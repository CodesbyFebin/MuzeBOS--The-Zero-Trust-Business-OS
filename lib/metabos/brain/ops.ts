/**
 * Brain/Ops: agent completions through the router with monthly spend caps, tool risk tiers,
 * a small flow DSL with an evaluator loop, and counterparty risk memory from real invoices and disputes.
 * Clean-room. Flow combinators follow the sequence/parallel/oneOf/forEach + evaluator idea in
 * open-agents-builder (MIT) and awesome-adk-agents (Apache-2.0); no code copied.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { BusinessError, type BusinessStore } from '../store';
import { route, type TierChoice } from '../ai/router';
import { propose } from '../dispatch/service';
import type { Channel } from '../dispatch/adapters';
import { records } from '../modules/engine';
import { agentSpend, ensureMetering } from './metering';

const iso = () => new Date().toISOString();

// ---------- Model router + per-agent spend cap ----------
export function proposeAgentCompletion(s: BusinessStore, actor: string, agentCode: string, prompt: string, tier: TierChoice = 'auto', maxTokens = 400) {
  ensureMetering(s);
  const agent = s.db.prepare('SELECT * FROM mb_agents WHERE code=?').get(agentCode) as { code: string; monthlyCapMicroUsd: number } | undefined;
  if (!agent) throw new BusinessError('Unknown agent; register it with a monthly cap first', 404);
  const spent = agentSpend(s, agentCode);
  if (spent.cost >= agent.monthlyCapMicroUsd) throw new BusinessError(`Agent ${agentCode} reached its monthly cap (${spent.cost}/${agent.monthlyCapMicroUsd} micro-USD); nothing proposed`, 402);
  // Preview only: the adapter routes again at send time with live availability.
  const preview = route(prompt, tier, { webgpu: false, states: { openrouter: 'ready' } });
  const d = propose(s, actor, 'completion', { prompt, tier, maxTokens });
  s.db.prepare('INSERT INTO mb_agent_dispatches VALUES(?,?,?,?,?,?)').run(d.id, agentCode, preview.tier, preview.chosen?.model ?? null, JSON.stringify(preview.reasons), iso());
  return { dispatch: d, route: { tier: preview.tier, model: preview.chosen?.model ?? null, reasons: preview.reasons }, spent };
}

// ---------- Tool registry risk tier ----------
export type Risk = 'low' | 'medium' | 'high';
export function toolGate(s: BusinessStore, code: string): { code: string; risk: Risk; needsJev: boolean; why: string } {
  const t = records(s, 'brain.tool-registry').find((r) => String(r.data.code).toUpperCase() === code.toUpperCase());
  if (!t) throw new BusinessError(`Tool ${code} is not registered`, 404);
  if (t.status !== 'enabled') throw new BusinessError(`Tool ${code} is ${t.status}`, 409);
  const risk = (t.data.risk as Risk | undefined) ?? 'high';
  const needsJev = risk === 'high' || Boolean(t.data.requiresApproval);
  return { code: String(t.data.code), risk, needsJev, why: risk === 'high' ? (t.data.risk ? 'high risk tier always needs Jev' : 'no risk tier recorded; treated as high') : needsJev ? 'marked as requiring approval' : `${risk} risk, no approval flag` };
}

// ---------- Flow DSL ----------
const Expr: z.ZodType<any> = z.lazy(() => z.union([z.number(), z.string(), z.boolean(), z.object({ var: z.string() }).strict(), z.object({ add: z.tuple([Expr, Expr]) }).strict(), z.object({ query: z.enum(['customer_count', 'pending_invoice_count', 'pending_invoice_total', 'open_dispute_count']) }).strict()]));
const Cond = z.object({ left: Expr, op: z.enum(['==', '!=', '>', '>=', '<', '<=']), right: Expr }).strict();
export type Step = { set: { var: string; value: unknown } } | { propose: { channel: Channel; payload: Record<string, unknown> } } | { tool: { code: string } } | { sequence: Step[] } | { parallel: Step[] } | { oneOf: { when: { if: z.infer<typeof Cond>; then: Step }[]; else?: Step } } | { forEach: { in: string; as: string; do: Step } } | { evaluate: { do: Step; until: z.infer<typeof Cond>; maxIterations: number } };
export const StepSchema: z.ZodType<Step> = z.lazy(() => z.union([
  z.object({ set: z.object({ var: z.string().regex(/^[a-z_]\w{0,30}$/i), value: Expr }).strict() }).strict(),
  z.object({ propose: z.object({ channel: z.enum(['whatsapp', 'instagram', 'email', 'payment-link', 'completion']), payload: z.record(z.string(), z.unknown()) }).strict() }).strict(),
  z.object({ tool: z.object({ code: z.string().min(1).max(60) }).strict() }).strict(),
  z.object({ sequence: z.array(StepSchema).min(1).max(50) }).strict(),
  z.object({ parallel: z.array(StepSchema).min(2).max(10) }).strict(),
  z.object({ oneOf: z.object({ when: z.array(z.object({ if: Cond, then: StepSchema }).strict()).min(1).max(10), else: StepSchema.optional() }).strict() }).strict(),
  z.object({ forEach: z.object({ in: z.string(), as: z.string().regex(/^[a-z_]\w{0,30}$/i), do: StepSchema }).strict() }).strict(),
  z.object({ evaluate: z.object({ do: StepSchema, until: Cond, maxIterations: z.number().int().min(1).max(10) }).strict() }).strict(),
])) as z.ZodType<Step>;
const MAX_STEPS = 200;
type Ctx = { vars: Record<string, unknown>; trace: string[]; dispatches: string[]; gates: string[]; steps: number; actor: string };
function evalExpr(s: BusinessStore, e: any, c: Ctx): unknown {
  if (e && typeof e === 'object') {
    if ('var' in e) { if (!(e.var in c.vars)) throw new BusinessError(`Unknown variable ${e.var}`, 422); return c.vars[e.var]; }
    if ('add' in e) { const a = evalExpr(s, e.add[0], c), b = evalExpr(s, e.add[1], c); if (typeof a !== 'number' || typeof b !== 'number') throw new BusinessError('add needs numbers', 422); return a + b; }
    if ('query' in e) {
      const inv = s.invoices();
      switch (e.query) {
        case 'customer_count': return s.customers().length;
        case 'pending_invoice_count': return inv.filter((i) => i.payment === 'pending').length;
        case 'pending_invoice_total': return inv.filter((i) => i.payment === 'pending').reduce((t, i) => t + i.payload.total, 0);
        case 'open_dispute_count': return records(s, 'money.dispute-and-chargeback-logger').filter((r) => ['open', 'evidence_submitted'].includes(r.status)).length;
      }
    }
  }
  return e;
}
function test(s: BusinessStore, k: z.infer<typeof Cond>, c: Ctx) {
  const l = evalExpr(s, k.left, c) as any, r = evalExpr(s, k.right, c) as any;
  switch (k.op) { case '==': return l === r; case '!=': return l !== r; case '>': return l > r; case '>=': return l >= r; case '<': return l < r; case '<=': return l <= r; }
}
const fill = (v: unknown, c: Ctx): unknown => typeof v === 'string' ? v.replace(/\{\{(\w+)\}\}/g, (_, k) => String(c.vars[k] ?? '')) : Array.isArray(v) ? v.map((x) => fill(x, c)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x, c)])) : v;
function run(s: BusinessStore, st: Step, c: Ctx, depth = 0): void {
  if (++c.steps > MAX_STEPS) throw new BusinessError(`Flow exceeded ${MAX_STEPS} steps`, 422);
  if (depth > 12) throw new BusinessError('Flow nested too deeply', 422);
  const pad = '  '.repeat(depth);
  if ('set' in st) { c.vars[st.set.var] = evalExpr(s, st.set.value, c); c.trace.push(`${pad}set ${st.set.var} = ${JSON.stringify(c.vars[st.set.var])}`); return; }
  if ('propose' in st) { const d = propose(s, c.actor, st.propose.channel, fill(st.propose.payload, c)); c.dispatches.push(d.id); c.trace.push(`${pad}proposed ${st.propose.channel} dispatch ${d.id.slice(0, 8)} (waits for Jev)`); return; }
  if ('tool' in st) { const g = toolGate(s, st.tool.code); c.gates.push(`${g.code}:${g.needsJev ? 'needs-jev' : 'allowed'}`); c.trace.push(`${pad}tool ${g.code}: ${g.risk} risk, ${g.needsJev ? 'needs Jev' : 'allowed'} (${g.why})`); return; }
  if ('sequence' in st) { c.trace.push(`${pad}sequence`); for (const x of st.sequence) run(s, x, c, depth + 1); return; }
  if ('parallel' in st) {
    c.trace.push(`${pad}parallel (${st.parallel.length} branches, isolated variables, merged in order)`);
    const base = { ...c.vars }; const merged: Record<string, unknown> = {};
    for (const b of st.parallel) { c.vars = { ...base }; run(s, b, c, depth + 1); for (const [k, v] of Object.entries(c.vars)) if (base[k] !== v) merged[k] = v; }
    c.vars = { ...base, ...merged }; return;
  }
  if ('oneOf' in st) { const hit = st.oneOf.when.findIndex((w) => test(s, w.if, c)); c.trace.push(`${pad}oneOf -> ${hit >= 0 ? `branch ${hit + 1}` : st.oneOf.else ? 'else' : 'no branch'}`); const next = hit >= 0 ? st.oneOf.when[hit].then : st.oneOf.else; if (next) run(s, next, c, depth + 1); return; }
  if ('forEach' in st) { const list = c.vars[st.forEach.in]; if (!Array.isArray(list)) throw new BusinessError(`${st.forEach.in} is not a list`, 422); if (list.length > 50) throw new BusinessError('forEach is limited to 50 items', 422); c.trace.push(`${pad}forEach ${st.forEach.in} (${list.length})`); for (const item of list) { c.vars[st.forEach.as] = item; run(s, st.forEach.do, c, depth + 1); } return; }
  if ('evaluate' in st) {
    for (let i = 1; i <= st.evaluate.maxIterations; i++) { run(s, st.evaluate.do, c, depth + 1); const ok = test(s, st.evaluate.until, c); c.trace.push(`${pad}evaluate iteration ${i}: ${ok ? 'condition met' : 'not met'}`); if (ok) return; }
    c.trace.push(`${pad}evaluate stopped at ${st.evaluate.maxIterations} iterations without meeting the condition`); return;
  }
}
function ensureFlows(s: BusinessStore) {
  s.db.exec(`CREATE TABLE IF NOT EXISTS mb_flows(id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, spec TEXT NOT NULL, createdBy TEXT NOT NULL, createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mb_flow_runs(id TEXT PRIMARY KEY, flowId TEXT NOT NULL, status TEXT NOT NULL, trace TEXT NOT NULL, vars TEXT NOT NULL, dispatches TEXT NOT NULL, gates TEXT NOT NULL, error TEXT, startedBy TEXT NOT NULL, at TEXT NOT NULL);`);
}
export function saveFlow(s: BusinessStore, actor: string, name: string, spec: unknown) {
  ensureFlows(s); const parsed = StepSchema.safeParse(spec);
  if (!parsed.success) throw new BusinessError(`Invalid flow: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`, 422);
  const id = randomUUID();
  s.db.prepare('INSERT INTO mb_flows VALUES(?,?,?,?,?) ON CONFLICT(name) DO UPDATE SET spec=excluded.spec').run(id, name.slice(0, 80), JSON.stringify(parsed.data), actor, iso());
  s.appendEvidence('flow.saved', name, `Flow saved by ${actor}`);
  return s.db.prepare('SELECT * FROM mb_flows WHERE name=?').get(name) as { id: string; name: string; spec: string };
}
/** Runs a flow. Side effects are limited to dispatch proposals (pending Jev) and tool gate checks. */
export function runFlow(s: BusinessStore, actor: string, flowId: string, input: Record<string, unknown> = {}) {
  ensureFlows(s); const f = s.db.prepare('SELECT * FROM mb_flows WHERE id=?').get(flowId) as { id: string; spec: string; name: string } | undefined;
  if (!f) throw new BusinessError('Flow not found', 404);
  const c: Ctx = { vars: { ...input }, trace: [], dispatches: [], gates: [], steps: 0, actor };
  let status = 'completed', error: string | null = null;
  try { s.transact(() => run(s, JSON.parse(f.spec), c)); } catch (e) { status = 'failed'; error = e instanceof Error ? e.message : 'error'; c.dispatches = []; }
  if (status === 'completed' && (c.dispatches.length || c.gates.some((g) => g.endsWith('needs-jev')))) status = 'awaiting_jev';
  const id = randomUUID();
  s.db.prepare('INSERT INTO mb_flow_runs VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, f.id, status, JSON.stringify(c.trace), JSON.stringify(c.vars), JSON.stringify(c.dispatches), JSON.stringify(c.gates), error, actor, iso());
  s.appendEvidence('flow.run', id, `${f.name}: ${status}${error ? ` (${error})` : ''}; ${c.dispatches.length} proposals, ${c.steps} steps`);
  return { id, status, error, trace: c.trace, dispatches: c.dispatches, gates: c.gates, vars: c.vars };
}
export function listFlows(s: BusinessStore) {
  ensureFlows(s);
  return { flows: (s.db.prepare('SELECT * FROM mb_flows ORDER BY createdAt DESC').all() as { id: string; name: string; spec: string; createdAt: string }[]).map((f) => ({ ...f, spec: JSON.parse(f.spec) })),
    runs: (s.db.prepare('SELECT * FROM mb_flow_runs ORDER BY at DESC LIMIT 50').all() as Record<string, string>[]).map((r) => ({ ...r, trace: JSON.parse(r.trace), dispatches: JSON.parse(r.dispatches), gates: JSON.parse(r.gates) })) };
}

// ---------- Counterparty risk memory ----------
const DAY = 86_400_000;
export type Counterparty = { customerId: string; name: string; invoices: number; paid: number; pending: number; pendingTotal: number; oldestPendingDays: number | null; disputes: number; disputesLost: number; band: 'low' | 'medium' | 'high' | 'no history'; reasons: string[]; events: { id: string; kind: string; note: string; at: string; predictedBand: string; outcome: string | null }[] };
function ensureRisk(s: BusinessStore) { s.db.exec('CREATE TABLE IF NOT EXISTS mb_counterparty_events(id TEXT PRIMARY KEY, customerId TEXT NOT NULL, kind TEXT NOT NULL, note TEXT NOT NULL, predictedBand TEXT NOT NULL, by TEXT NOT NULL, at TEXT NOT NULL, outcome TEXT, gradedBy TEXT, gradedAt TEXT)'); }
export function counterparties(s: BusinessStore, now = Date.now()): Counterparty[] {
  ensureRisk(s);
  const inv = s.invoices(); const disputes = records(s, 'money.dispute-and-chargeback-logger');
  return s.customers().map((cu) => {
    const mine = inv.filter((i) => i.payload.customer.id === cu.id);
    const ids = new Set(mine.map((i) => i.id)); const dis = disputes.filter((d) => ids.has(String(d.data.invoiceId)));
    const pend = mine.filter((i) => i.payment === 'pending');
    const oldest = pend.length ? Math.floor((now - Math.min(...pend.map((i) => Date.parse(i.createdAt)))) / DAY) : null;
    const events = s.db.prepare('SELECT id,kind,note,at,predictedBand,outcome FROM mb_counterparty_events WHERE customerId=? ORDER BY at DESC').all(cu.id) as Counterparty['events'];
    const late = events.filter((e) => e.kind === 'late_payment').length;
    const reasons: string[] = []; let pts = 0;
    if (oldest !== null && oldest > 30) { pts += 2; reasons.push(`invoice pending ${oldest} days`); } else if (oldest !== null && oldest > 15) { pts += 1; reasons.push(`invoice pending ${oldest} days`); }
    const lost = dis.filter((d) => d.status === 'lost').length;
    if (dis.length) { pts += dis.length + lost; reasons.push(`${dis.length} dispute(s), ${lost} lost`); }
    if (late) { pts += late; reasons.push(`${late} late payment(s) recorded`); }
    const band = !mine.length && !events.length ? 'no history' : pts >= 3 ? 'high' : pts >= 1 ? 'medium' : 'low';
    if (band === 'low') reasons.push(`${mine.length - pend.length} paid, nothing overdue`);
    return { customerId: cu.id, name: cu.name, invoices: mine.length, paid: mine.length - pend.length, pending: pend.length, pendingTotal: pend.reduce((t, i) => t + i.payload.total, 0), oldestPendingDays: oldest, disputes: dis.length, disputesLost: lost, band, reasons, events };
  });
}
export function recordCounterpartyEvent(s: BusinessStore, actor: string, customerId: string, kind: 'late_payment' | 'paid_on_time' | 'dispute' | 'other', note: string) {
  ensureRisk(s); const cp = counterparties(s).find((c) => c.customerId === customerId); if (!cp) throw new BusinessError('Customer not found', 404);
  const id = randomUUID();
  s.db.prepare('INSERT INTO mb_counterparty_events(id,customerId,kind,note,predictedBand,by,at) VALUES(?,?,?,?,?,?,?)').run(id, customerId, kind, note.slice(0, 500), cp.band, actor, iso());
  s.appendEvidence('counterparty.event', customerId, `${kind} recorded by ${actor} (band was ${cp.band})`); return id;
}
/** Later, a person grades whether the band at the time held up. This is how the memory is checked, not trained. */
export function gradeCounterpartyEvent(s: BusinessStore, actor: string, id: string, outcome: 'band_held' | 'band_wrong') {
  ensureRisk(s); const r = s.db.prepare('UPDATE mb_counterparty_events SET outcome=?, gradedBy=?, gradedAt=? WHERE id=? AND outcome IS NULL').run(outcome, actor, iso(), id);
  if (!r.changes) throw new BusinessError('Event not found or already graded', 409);
  s.appendEvidence('counterparty.graded', id, `${outcome} by ${actor}`);
}
