/**
 * Governed workflows: declarative definitions plus a small durable run engine on the
 * business SQLite store. Every state change is one IMMEDIATE transaction that writes
 * the run/step row, a run event and a hash-chained evidence event together, so a crash
 * leaves either the old state or the new one, and a run can be resumed from its last
 * persisted step.
 *
 * Trust rules enforced here:
 *  - A step may only call a tool listed in its definition AND whose permission the
 *    definition grants. Permissions come from the definition only. A request from a model
 *    (or anyone) that names extra permissions never adds them. It is denied and recorded.
 *  - Approval is bound to the canonical hash of the planned payload. Execution recomputes
 *    the plan; if it changed since approval the run fails and nothing is written.
 *  - Retry is offered only for failed steps marked idempotent. Cancel compensates any
 *    effects from completed steps.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { BusinessError, payloadHash, type BusinessStore, type Product } from './store';
import { OverdueReminderInput, overduePlan, performOverdueSend, senderConnectedFromEnv, type OverdueReminderInputT } from './overdue-core';

export const PERMISSIONS = ['inventory.read', 'reminders.write', 'messages.send', 'invoices.issue'] as const;
export type Permission = typeof PERMISSIONS[number];
export type ToolName = 'inventory.lowStock' | 'reminders.create' | 'reminders.complete' | 'messages.send' | 'invoices.issue';
/** Every tool states the single permission it needs and whether calling it twice is safe. */
export const TOOLS: Record<ToolName, { permission: Permission; idempotent: boolean; description: string }> = {
  'inventory.lowStock': { permission: 'inventory.read', idempotent: true, description: 'Read products at or below a stock threshold.' },
  'reminders.create': { permission: 'reminders.write', idempotent: true, description: 'Create one open reminder linked to a product (skipped if this run already created it).' },
  'reminders.complete': { permission: 'reminders.write', idempotent: true, description: 'Close reminders this run created (compensation).' },
  'messages.send': { permission: 'messages.send', idempotent: false, description: 'Send an outside message through a connected integration only. Granted only to the overdue-invoice reminder; without a connected sender it records that nothing was sent.' },
  'invoices.issue': { permission: 'invoices.issue', idempotent: false, description: 'Issue an invoice. Only the operator approval flow may do this; no workflow is granted it.' },
};

export type StepContext = { store: BusinessStore; runId: string; input: unknown; plan: unknown; outputs: Record<string, unknown> };
export type StepDefinition = { id: string; label: string; tool: ToolName; run: (ctx: StepContext) => unknown };
export type WorkflowDefinition = {
  id: string; version: number; name: string; summary: string;
  trigger: { kind: 'manual' | 'schedule' | 'event'; description: string };
  input: z.ZodTypeAny; inputDescription: Record<string, string>;
  permissions: Permission[]; tools: ToolName[];
  approval: { required: boolean; boundTo: 'payloadHash'; description: string };
  idempotency: { description: string };
  retry: { maxAttempts: number; description: string };
  timeoutMs: number;
  compensation: { description: string; run: (ctx: StepContext) => unknown };
  /** Pure read that produces the payload the operator approves. */
  plan: (store: BusinessStore, input: any) => unknown;
  steps: StepDefinition[];
};

type LowStockPlan = { threshold: number; products: { id: string; sku: string; name: string; stock: number }[] };
const lowStock = (products: Product[], threshold: number): LowStockPlan => ({ threshold, products: products.filter((p) => p.stock <= threshold).map(({ id, sku, name, stock }) => ({ id, sku, name, stock })).sort((a, b) => a.sku.localeCompare(b.sku)) });

export const LOW_STOCK_REMINDER: WorkflowDefinition = {
  id: 'low-stock-reminder', version: 1, name: 'Low-stock alert to reminder',
  summary: 'Finds products at or below a stock threshold and creates one restock reminder per product after you approve the exact list.',
  trigger: { kind: 'manual', description: 'Started by the operator from /workflows. No scheduler or event source is connected yet.' },
  input: z.object({ threshold: z.number().int().min(0).max(1_000_000) }).strict(),
  inputDescription: { threshold: 'Integer stock level; products with stock at or below it are included.' },
  permissions: ['inventory.read', 'reminders.write'],
  tools: ['inventory.lowStock', 'reminders.create', 'reminders.complete'],
  approval: { required: true, boundTo: 'payloadHash', description: 'Operator approves the canonical hash of {threshold, products with stock}. Any stock change before execution invalidates it.' },
  idempotency: { description: 'One run per threshold per stock snapshot hash; replaying the same start returns the existing run.' },
  retry: { maxAttempts: 3, description: 'Failed steps are retryable up to 3 attempts because both tools are idempotent.' },
  timeoutMs: 24 * 60 * 60 * 1000,
  compensation: { description: 'Cancelling after reminders were created closes those reminders (marked done) and records it.', run: () => undefined },
  plan: (store, input) => lowStock(store.products(), input.threshold),
  steps: [
    { id: 'scan', label: 'Read low-stock products', tool: 'inventory.lowStock', run: (ctx) => lowStock(ctx.store.products(), (ctx.input as { threshold: number }).threshold) },
    { id: 'remind', label: 'Create restock reminders', tool: 'reminders.create', run: () => undefined },
  ],
};

/** Shape of a write an AI agent may propose. Model output is untrusted; it is parsed against this
 *  strict schema and can only ever name the one write tool this definition grants. */
export const AGENT_ROLES = ['inventory', 'customers', 'finance', 'operations', 'writer'] as const;
export const AgentProposalSchema = z.object({
  taskId: z.string().min(1).max(64).regex(/^[A-Za-z0-9_.:-]+$/),
  role: z.enum(AGENT_ROLES),
  tool: z.literal('reminders.create'),
  args: z.object({ title: z.string().trim().min(1).max(180) }).strict(),
  rationale: z.string().max(500).default(''),
  source: z.enum(['model', 'rule']),
  model: z.string().max(120).nullable().default(null),
}).strict();
export type AgentProposal = z.infer<typeof AgentProposalSchema>;

/** 'Jev' gate: every write proposed by an AI agent becomes a run of this definition, which always
 *  requires a human approval bound to the hash of the exact proposal. There is no auto-approve path. */
export const JEV_AGENT_WRITE: WorkflowDefinition = {
  id: 'agent-proposed-write', version: 1, name: 'Jev approval gate for agent proposals',
  summary: 'An AI agent proposed a write. Nothing happens until a person approves the exact payload hash; then one reminder is created.',
  trigger: { kind: 'event', description: 'Created when a Brain runtime agent proposes a tool call. Agents cannot approve or execute.' },
  input: AgentProposalSchema,
  inputDescription: { taskId: 'Swarm subtask id', role: 'Agent role that proposed it', tool: 'Only reminders.create is proposable', args: '{ title } of the reminder', rationale: 'Agent explanation (untrusted text)', source: 'model or rule (no model configured)', model: 'Model id when source is model' },
  permissions: ['reminders.write'],
  tools: ['reminders.create', 'reminders.complete'],
  approval: { required: true, boundTo: 'payloadHash', description: 'A person approves the canonical hash of the full proposal. A changed title, tool, role or task is a different hash and is refused.' },
  idempotency: { description: 'The same proposal returns the same run; the reminder is created at most once per run.' },
  retry: { maxAttempts: 3, description: 'reminders.create is idempotent per run, so a failed attempt may be retried.' },
  timeoutMs: 24 * 60 * 60 * 1000,
  compensation: { description: 'Cancelling after execution closes the reminder this run created.', run: () => undefined },
  plan: (_store, input) => ({ tool: input.tool, args: input.args, role: input.role, taskId: input.taskId }),
  steps: [{ id: 'remind', label: 'Create the approved reminder', tool: 'reminders.create', run: () => undefined }],
};

export const OVERDUE_INVOICE_REMINDER: WorkflowDefinition = {
  id: 'overdue-invoice-reminder', version: 1, name: 'Overdue invoice reminder',
  summary: 'A drafted payment reminder for one overdue invoice. Nothing is sent until a person approves the exact draft; then it goes only to a connected email integration.',
  trigger: { kind: 'event', description: 'Created from the Overdue page after a draft (fixture or live Muse) passes validation.' },
  input: OverdueReminderInput,
  inputDescription: { invoiceId: 'Stored invoice id', to: 'Customer email on the invoice', subject: 'Validated subject', body: 'Validated body', mode: 'fixture or live', model: 'Model id when live', draftHash: 'sha256 of subject+body' },
  permissions: ['messages.send'],
  tools: ['messages.send'],
  approval: { required: true, boundTo: 'payloadHash', description: 'A person approves the hash of the draft plus the invoice state. If the invoice is reconciled or edited before execution, the hash changes and sending is refused.' },
  idempotency: { description: 'The same draft for the same invoice returns the same run; at most one outbound message per run.' },
  retry: { maxAttempts: 1, description: 'messages.send is not idempotent, so it is never retried automatically.' },
  timeoutMs: 72 * 60 * 60 * 1000,
  compensation: { description: 'A message handed to the sender cannot be recalled; cancelling before execution sends nothing.', run: () => undefined },
  plan: (store, input) => overduePlan(store, input as OverdueReminderInputT),
  steps: [{ id: 'send', label: 'Send the approved reminder via the connected integration', tool: 'messages.send', run: () => undefined }],
};

export const WORKFLOWS: WorkflowDefinition[] = [LOW_STOCK_REMINDER, JEV_AGENT_WRITE, OVERDUE_INVOICE_REMINDER];
export const workflowById = (id: string) => WORKFLOWS.find((w) => w.id === id);

/** Serializable view of a definition for the UI/API (functions and schemas removed). */
export function describeWorkflow(w: WorkflowDefinition) {
  return {
    id: w.id, version: w.version, name: w.name, summary: w.summary, trigger: w.trigger, input: w.inputDescription,
    permissions: w.permissions, tools: w.tools.map((t) => ({ name: t, ...TOOLS[t] })), approval: { required: w.approval.required, boundTo: w.approval.boundTo, description: w.approval.description },
    idempotency: w.idempotency.description, retry: w.retry, timeoutMs: w.timeoutMs, compensation: w.compensation.description,
    steps: w.steps.map((s) => ({ id: s.id, label: s.label, tool: s.tool, idempotent: TOOLS[s.tool].idempotent })),
  };
}

export type ToolRequest = { tool: string; requestedBy: 'definition' | 'model'; permissions?: string[] };
/** Pure authorization: only the definition grants. Extra permissions in the request are ignored. */
export function authorizeTool(w: WorkflowDefinition, req: ToolRequest): { allowed: boolean; reason: string } {
  const tool = TOOLS[req.tool as ToolName];
  if (!tool) return { allowed: false, reason: `Unknown tool ${req.tool}` };
  if (!w.tools.includes(req.tool as ToolName)) return { allowed: false, reason: `${req.tool} is not a permitted tool of ${w.id}` };
  if (!w.permissions.includes(tool.permission)) return { allowed: false, reason: `${w.id} is not granted ${tool.permission}` };
  return { allowed: true, reason: `${req.tool} permitted by ${w.id} via ${tool.permission}` };
}

export type RunStatus = 'awaiting_approval' | 'running' | 'failed' | 'succeeded' | 'cancelled' | 'compensated' | 'timed_out';
export type WorkflowRun = { id: string; workflowId: string; version: number; status: RunStatus; input: unknown; payloadHash: string; idempotencyKey: string; error: string | null; createdAt: string; updatedAt: string; deadlineAt: string; plan: unknown; approvedHash: string | null };
export type RunStep = { runId: string; stepId: string; status: 'pending' | 'succeeded' | 'failed' | 'compensated'; attempts: number; output: unknown; error: string | null; updatedAt: string };
export type RunEvent = { seq: number; runId: string; stepId: string | null; type: string; detail: string; createdAt: string };

const now = () => new Date().toISOString();
const TERMINAL: RunStatus[] = ['succeeded', 'cancelled', 'compensated', 'timed_out'];

export class WorkflowEngine {
  /** `fault` is a test hook to simulate a transient failure in a step attempt. */
  constructor(private store: BusinessStore, private opts: { fault?: (stepId: string, attempt: number) => void; clock?: () => number; senderConnected?: () => boolean } = {}) {}
  private get db() { return this.store.db; }
  private time() { return this.opts.clock?.() ?? Date.now(); }
  private event(runId: string, stepId: string | null, type: string, detail: string) {
    this.db.prepare('INSERT INTO mb_workflow_events(runId,stepId,type,detail,createdAt) VALUES(?,?,?,?,?)').run(runId, stepId, type, detail, now());
    this.store.appendEvidence(`workflow.${type}`, stepId ? `${runId}:${stepId}` : runId, detail);
  }
  private setRun(id: string, status: RunStatus, error: string | null = null) { this.db.prepare('UPDATE mb_workflow_runs SET status=?, error=?, updatedAt=? WHERE id=?').run(status, error, now(), id); }
  private def(id: string) { const w = workflowById(id); if (!w) throw new BusinessError('Unknown workflow', 404); return w; }

  runs(limit = 50): WorkflowRun[] { return (this.db.prepare('SELECT r.*, a.payloadHash AS approvedHash FROM mb_workflow_runs r LEFT JOIN mb_workflow_approvals a ON a.runId=r.id ORDER BY r.createdAt DESC, r.rowid DESC LIMIT ?').all(limit) as any[]).map((r) => this.hydrate(r)); }
  run(id: string): WorkflowRun { const r = this.db.prepare('SELECT r.*, a.payloadHash AS approvedHash FROM mb_workflow_runs r LEFT JOIN mb_workflow_approvals a ON a.runId=r.id WHERE r.id=?').get(id); if (!r) throw new BusinessError('Run not found', 404); return this.hydrate(r); }
  private hydrate(r: any): WorkflowRun { const input = JSON.parse(r.input); return { ...r, input: input.input, plan: input.plan, approvedHash: r.approvedHash ?? null }; }
  steps(runId: string): RunStep[] { return (this.db.prepare('SELECT * FROM mb_workflow_steps WHERE runId=? ORDER BY rowid').all(runId) as any[]).map((s) => ({ ...s, output: s.output ? JSON.parse(s.output) : null })); }
  events(runId?: string): RunEvent[] { return (runId ? this.db.prepare('SELECT * FROM mb_workflow_events WHERE runId=? ORDER BY seq').all(runId) : this.db.prepare('SELECT * FROM mb_workflow_events ORDER BY seq DESC LIMIT 500').all()) as RunEvent[]; }

  /** Validate input, compute the plan and its hash, persist the run. Same workflow+input+plan returns the existing run. */
  start(workflowId: string, rawInput: unknown): WorkflowRun {
    const w = this.def(workflowId);
    const input = w.input.parse(rawInput);
    return this.store.transact(() => {
      const plan = w.plan(this.store, input);
      const hash = payloadHash({ workflowId: w.id, version: w.version, input, plan });
      const key = hash;
      const existing = this.db.prepare('SELECT id FROM mb_workflow_runs WHERE workflowId=? AND idempotencyKey=?').get(w.id, key) as { id: string } | undefined;
      if (existing) return this.run(existing.id);
      const id = randomUUID(); const t = now();
      this.db.prepare('INSERT INTO mb_workflow_runs VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id, w.id, w.version, w.approval.required ? 'awaiting_approval' : 'running', JSON.stringify({ input, plan }), hash, key, null, t, t, new Date(this.time() + w.timeoutMs).toISOString());
      for (const s of w.steps) this.db.prepare('INSERT INTO mb_workflow_steps(runId,stepId,status,attempts,updatedAt) VALUES(?,?,?,?,?)').run(id, s.id, 'pending', 0, t);
      this.event(id, null, 'run.started', `${w.id} v${w.version}; payload ${hash}`);
      if (w.approval.required) this.event(id, null, 'approval.requested', `Approve payload ${hash}`);
      return this.run(id);
    });
  }

  approve(runId: string, hash: string): WorkflowRun {
    const { run, denied } = this.tryApprove(runId, hash);
    if (denied) throw new BusinessError('Approval does not match the planned payload', 409);
    return run;
  }
  /** Like approve, but a hash mismatch is returned (and recorded) instead of thrown, so callers wrapping
   *  this in an outer transaction still commit the denial evidence. */
  tryApprove(runId: string, hash: string): { run: WorkflowRun; denied: boolean } {
    const result = this.store.transact(() => {
      const r = this.run(runId);
      if (r.status !== 'awaiting_approval') throw new BusinessError(`Run is ${r.status}, not awaiting approval`, 409);
      if (Date.parse(r.deadlineAt) <= this.time()) { this.setRun(runId, 'timed_out', 'Approval window expired'); this.event(runId, null, 'run.timed_out', 'Approval window expired; nothing executed'); return this.run(runId); }
      // Recorded (committed) before refusing, so denied approvals stay in the evidence.
      if (hash !== r.payloadHash) { this.event(runId, null, 'approval.denied', `Hash ${hash} does not match payload ${r.payloadHash}`); return null; }
      this.db.prepare('INSERT INTO mb_workflow_approvals VALUES(?,?,?)').run(runId, hash, now());
      this.setRun(runId, 'running');
      this.event(runId, null, 'approval.granted', `Operator approved payload ${hash}`);
      return this.run(runId);
    });
    return result ? { run: result, denied: false } : { run: this.run(runId), denied: true };
  }

  /** Check a tool request against the run's definition and record the decision. Never widens permissions. */
  requestTool(runId: string, req: ToolRequest) {
    return this.store.transact(() => {
      const r = this.run(runId); const w = this.def(r.workflowId);
      const decision = authorizeTool(w, req);
      const extra = (req.permissions ?? []).filter((p) => !w.permissions.includes(p as Permission));
      const note = extra.length ? `; requested extra permissions ignored: ${extra.join(', ')}` : '';
      this.event(runId, null, decision.allowed ? 'tool.allowed' : 'tool.denied', `${req.requestedBy} asked for ${req.tool}: ${decision.reason}${note}`);
      return { ...decision, ignoredPermissions: extra };
    });
  }

  /** Execute (or resume) pending steps. Each step attempt is its own transaction. */
  execute(runId: string): WorkflowRun {
    const r0 = this.run(runId);
    if (r0.status !== 'running') throw new BusinessError(`Run is ${r0.status}; it must be approved and running`, 409);
    const w = this.def(r0.workflowId);
    if (w.approval.required) {
      const ok = this.store.transact(() => {
        const r = this.run(runId);
        if (r.approvedHash !== r.payloadHash) throw new BusinessError('Run has no approval for its payload', 409);
        const current = payloadHash({ workflowId: w.id, version: w.version, input: r.input, plan: w.plan(this.store, r.input) });
        if (current !== r.approvedHash) { this.setRun(runId, 'failed', 'Payload changed since approval'); this.event(runId, null, 'approval.stale', `Current payload ${current} differs from approved ${r.approvedHash}; nothing executed. Start a new run.`); return false; }
        return true;
      });
      if (!ok) return this.run(runId);
    }
    for (const step of w.steps) {
      const st = this.steps(runId).find((s) => s.stepId === step.id)!;
      if (st.status === 'succeeded') continue;
      const done = this.store.transact(() => {
        const r = this.run(runId);
        const auth = authorizeTool(w, { tool: step.tool, requestedBy: 'definition' });
        if (!auth.allowed) { this.setRun(runId, 'failed', auth.reason); this.event(runId, step.id, 'tool.denied', auth.reason); return false; }
        const attempt = st.attempts + 1;
        const outputs = Object.fromEntries(this.steps(runId).filter((s) => s.status === 'succeeded').map((s) => [s.stepId, s.output]));
        try {
          const sp = `s${attempt}`; this.db.exec(`SAVEPOINT ${sp}`);
          try { this.opts.fault?.(step.id, attempt); var output = this.perform(w, step, { store: this.store, runId, input: r.input, plan: r.plan, outputs }); this.db.exec(`RELEASE ${sp}`); }
          catch (e) { this.db.exec(`ROLLBACK TO ${sp}`); this.db.exec(`RELEASE ${sp}`); throw e; }
          this.db.prepare("UPDATE mb_workflow_steps SET status='succeeded', attempts=?, output=?, error=NULL, updatedAt=? WHERE runId=? AND stepId=?").run(attempt, JSON.stringify(output ?? null), now(), runId, step.id);
          this.event(runId, step.id, 'step.succeeded', `${step.tool} attempt ${attempt}`);
          return true;
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Step failed';
          this.db.prepare("UPDATE mb_workflow_steps SET status='failed', attempts=?, error=?, updatedAt=? WHERE runId=? AND stepId=?").run(attempt, msg, now(), runId, step.id);
          this.setRun(runId, 'failed', `${step.id}: ${msg}`);
          this.event(runId, step.id, 'step.failed', `${step.tool} attempt ${attempt}: ${msg}; no partial writes from this attempt`);
          return false;
        }
      });
      if (!done) return this.run(runId);
    }
    this.store.transact(() => { this.setRun(runId, 'succeeded'); this.event(runId, null, 'run.succeeded', 'All steps completed'); });
    return this.run(runId);
  }

  /** Workflow-specific effects, dispatched by tool so a step can only do what its tool allows. */
  private perform(w: WorkflowDefinition, step: StepDefinition, ctx: StepContext) {
    if (step.tool === 'messages.send' && w.id === OVERDUE_INVOICE_REMINDER.id) {
      return performOverdueSend(this.store, ctx.runId, ctx.plan as ReturnType<typeof overduePlan>, (this.opts.senderConnected ?? senderConnectedFromEnv)());
    }
    if (step.tool === 'reminders.create' && w.id === JEV_AGENT_WRITE.id) {
      const plan = ctx.plan as { args: { title: string }; role: string };
      const marker = `[run ${ctx.runId.slice(0, 8)}]`;
      const exists = this.db.prepare('SELECT id FROM mb_reminders WHERE title LIKE ?').get(`%${marker}`) as { id: string } | undefined;
      if (exists) return { reminderIds: [exists.id] };
      const rec = this.store.reminder({ title: `${plan.args.title} ${marker}` });
      return { reminderIds: [rec.id] };
    }
    if (step.tool === 'reminders.create') {
      const plan = ctx.outputs.scan as LowStockPlan;
      const created: string[] = [];
      for (const p of plan.products) {
        const marker = `[run ${ctx.runId.slice(0, 8)}]`;
        const exists = this.db.prepare("SELECT id FROM mb_reminders WHERE linkKind='product' AND linkId=? AND title LIKE ?").get(p.id, `%${marker}`) as { id: string } | undefined;
        if (exists) { created.push(exists.id); continue; }
        const rec = this.store.reminder({ title: `Restock ${p.name} (${p.sku}): ${p.stock} left, threshold ${plan.threshold} ${marker}`, link: { kind: 'product', id: p.id } });
        created.push(rec.id);
      }
      return { reminderIds: created };
    }
    return step.run(ctx);
  }

  /** Retry is allowed only for a failed run whose failed step is idempotent and under maxAttempts. */
  retry(runId: string): WorkflowRun {
    const r = this.run(runId); const w = this.def(r.workflowId);
    if (r.status !== 'failed') throw new BusinessError(`Run is ${r.status}; only failed runs can be retried`, 409);
    const failed = this.steps(runId).find((s) => s.status === 'failed');
    if (!failed) throw new BusinessError('This run failed before any step (for example a stale approval). Start a new run.', 409);
    const step = w.steps.find((s) => s.id === failed.stepId)!;
    if (!TOOLS[step.tool].idempotent) throw new BusinessError(`${step.id} is not idempotent; cancel to compensate instead`, 409);
    if (failed.attempts >= w.retry.maxAttempts) throw new BusinessError(`Retry limit ${w.retry.maxAttempts} reached`, 409);
    this.store.transact(() => { this.setRun(runId, 'running'); this.event(runId, step.id, 'step.retry', `Attempt ${failed.attempts + 1} of ${w.retry.maxAttempts}`); });
    return this.execute(runId);
  }

  /** Cancel a non-terminal run. Effects of completed steps are compensated in the same transaction. */
  cancel(runId: string): WorkflowRun {
    return this.store.transact(() => {
      const r = this.run(runId);
      if (TERMINAL.includes(r.status)) throw new BusinessError(`Run is already ${r.status}`, 409);
      const remind = this.steps(runId).find((s) => s.stepId === 'remind' && s.status === 'succeeded');
      const ids = ((remind?.output as { reminderIds?: string[] } | null)?.reminderIds) ?? [];
      if (ids.length) {
        for (const id of ids) this.db.prepare("UPDATE mb_reminders SET status='done', completedAt=? WHERE id=? AND status='open'").run(now(), id);
        this.db.prepare("UPDATE mb_workflow_steps SET status='compensated', updatedAt=? WHERE runId=? AND stepId='remind'").run(now(), runId);
        this.setRun(runId, 'compensated');
        this.event(runId, 'remind', 'run.compensated', `Closed ${ids.length} reminder(s) created by this run`);
      } else { this.setRun(runId, 'cancelled'); this.event(runId, null, 'run.cancelled', 'Cancelled by operator; no effects to compensate'); }
      return this.run(runId);
    });
  }
}
