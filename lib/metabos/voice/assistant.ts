/**
 * MeTaBos voice assistant: a fixed tool set over real SQLite reads.
 * Read tools answer from DB queries only. Write tools create PENDING items (a Jev proposal or a Brain
 * draft) and never send: this module does not import dispatch, and no tool can approve.
 * Approving by voice is refused with a deep link. Every command and tool call goes to the evidence chain.
 */
import { randomUUID } from 'node:crypto';
import type { BusinessStore } from '../store';
import { propose, queue } from '../ai/jev';
import { guardDraft } from '../ai/local-llm';
import { LOW_STOCK_UNITS } from '../mission';
import type { AgentTask } from '@/lib/schemas';

export const READ_TOOLS = ['get_status', 'explain_item', 'list_tasks'] as const;
export const WRITE_TOOLS = ['create_task', 'draft_message'] as const;
export type ToolName = typeof READ_TOOLS[number] | typeof WRITE_TOOLS[number];
export const ALL_TOOLS: readonly string[] = [...READ_TOOLS, ...WRITE_TOOLS];
export type Link = { label: string; href: string };
export type ToolResult = { tool: ToolName | 'refused'; text: string; links: Link[]; dispatched: false; pending?: { kind: 'jev' | 'draft'; id: string } };
export type Ctx = { store: BusinessStore; tasks: AgentTask[]; at?: Date; tzOffsetMinutes?: number; model?: string | null };
const INR = (minor: number) => `₹${(minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Approve, reject, send, pay or dispatch by voice is never allowed. */
export const APPROVE_RE = /\b(approve|approval of|accept|reject|deny|sign off|send it|dispatch|pay (it|now|the)|publish)\b/i;

export function refuseApprove(ctx: Ctx, text: string): ToolResult {
  const id = text.match(/\b([0-9a-f]{8}-[0-9a-f-]{27,})\b/i)?.[1];
  const href = id ? `/brain?run=${encodeURIComponent(id)}` : '/brain';
  ctx.store.transact(() => ctx.store.appendEvidence('voice.refused', id ?? 'approve', 'Voice approval or send refused; owner must open the item'));
  return { tool: 'refused', text: 'I can’t approve or send by voice. Open it to approve.', links: [{ label: id ? 'Open the item in Jev' : 'Open the Jev queue', href }], dispatched: false };
}

function jevPending(store: BusinessStore) { return queue(store).filter((r) => r.status === 'awaiting_approval'); }

export function runTool(ctx: Ctx, name: string, args: Record<string, unknown> = {}): ToolResult {
  const { store } = ctx;
  if (!ALL_TOOLS.includes(name)) throw new Error(`Unknown tool ${name}`);
  let r: ToolResult;
  if (name === 'get_status') {
    const rec = store.snapshot();
    const at = ctx.at ?? new Date(); const off = (ctx.tzOffsetMinutes ?? 0) * 60_000;
    const dayStart = Math.floor((at.getTime() + off) / 86_400_000) * 86_400_000 - off;
    const jev = jevPending(store);
    const unpaid = rec.invoices.filter((i) => i.payment === 'pending');
    const low = rec.products.filter((p) => p.stock <= LOW_STOCK_UNITS);
    const orders = rec.orders.filter((o) => { const t = Date.parse(o.createdAt); return t >= dayStart && t < dayStart + 86_400_000; });
    const running = ctx.tasks.filter((t) => t.status === 'doing');
    const failed = store.db.prepare("SELECT COUNT(*) n FROM mb_workflow_runs WHERE status IN ('failed','timed_out')").get() as { n: number };
    const empty = !rec.invoices.length && !rec.products.length && !rec.orders.length && !jev.length && !ctx.tasks.length && !failed.n;
    r = { tool: 'get_status', dispatched: false, text: empty ? 'No records yet. Insufficient data for a status report.' : [
      `${plural(jev.length, 'Jev item')} waiting for approval.`,
      `${plural(unpaid.length, 'unpaid invoice')}${unpaid.length ? `, ${INR(unpaid.reduce((s, i) => s + i.payload.total, 0))}` : ''}.`,
      `${plural(low.length, 'product')} low or out of stock.`,
      `${plural(orders.length, 'order')} today.`,
      `${plural(running.length, 'agent task')} running.`,
      `${plural(failed.n, 'failed job')}.`,
    ].join(' '), links: [{ label: 'Jev queue', href: '/brain' }, { label: 'Invoices', href: '/business?view=invoices' }, { label: 'Inventory', href: '/business?view=inventory' }, { label: 'Orders', href: '/business?view=orders' }] };
  } else if (name === 'explain_item') {
    const id = String(args.id ?? '').trim();
    const run = id ? queue(store).find((x) => x.id === id || x.id.startsWith(id)) : undefined;
    const ord = !run && id ? store.snapshot().orders.find((o) => o.id === id) : undefined;
    const task = !run && !ord && id ? ctx.tasks.find((t) => t.id === id) : undefined;
    if (run) {
      const input: any = typeof run.input === 'string' ? (() => { try { return JSON.parse(run.input as string); } catch { return null; } })() : run.input;
      r = { tool: 'explain_item', dispatched: false, text: `Jev item ${run.id.slice(0, 8)} is ${run.status.replace(/_/g, ' ')}. It proposes ${input?.tool ?? 'a write'}${input?.args?.title ? ` “${input.args.title}”` : ''}, from a ${input?.source ?? 'unknown'} source. Reason: ${input?.rationale || 'none given'}.`, links: [{ label: 'Open in Jev', href: `/brain?run=${run.id}` }, { label: 'Evidence', href: `/workspace/evidence?target=${run.id}` }] };
    } else if (ord) r = { tool: 'explain_item', dispatched: false, text: `Order for ${ord.payload.customer.name} is ${ord.status.replace(/_/g, ' ')}, total ${INR(ord.payload.total)}.`, links: [{ label: 'Open the order', href: '/business?view=orders' }, { label: 'Evidence', href: `/workspace/evidence?target=${ord.id}` }] };
    else if (task) r = { tool: 'explain_item', dispatched: false, text: `Task “${task.title}” is ${task.status}. ${task.detail ? task.detail.slice(0, 200) : ''}`.trim(), links: [{ label: 'Tasks', href: '/workspace/brain' }] };
    else r = { tool: 'explain_item', dispatched: false, text: id ? `I found no item with id ${id}. Insufficient data.` : 'Which item? Say or type its id.', links: [] };
  } else if (name === 'list_tasks') {
    const open = ctx.tasks.filter((t) => t.status !== 'done');
    const rem = store.reminders().filter((x) => x.status === 'open');
    r = { tool: 'list_tasks', dispatched: false, text: !open.length && !rem.length ? 'No records yet. There are no open tasks.' : `${plural(open.length + rem.length, 'open task')}: ${[...rem.map((x) => x.title), ...open.map((t) => `${t.title} (${t.status})`)].slice(0, 5).join('; ')}${open.length + rem.length > 5 ? '; and more' : ''}.`, links: [{ label: 'Mission Control to-dos', href: '/' }] };
  } else if (name === 'create_task') {
    const title = String(args.title ?? '').trim().slice(0, 180);
    if (!title) return { tool: 'create_task', dispatched: false, text: 'What should the task say?', links: [] };
    const run = propose(store, { taskId: `voice-${Date.now().toString(36)}`, role: 'operations', tool: 'reminders.create', args: { title }, rationale: 'Requested by voice', source: ctx.model ? 'model' : 'rule', model: ctx.model ?? null });
    r = { tool: 'create_task', dispatched: false, pending: { kind: 'jev', id: run.id }, text: `I proposed a task “${title}”. It is pending in Jev; open it to approve.`, links: [{ label: 'Open it to approve', href: `/brain?run=${run.id}` }] };
  } else {
    const to = String(args.to ?? '').trim().slice(0, 120); const body = String(args.body ?? '').trim().slice(0, 4000);
    if (!body) return { tool: 'draft_message', dispatched: false, text: 'What should the message say?', links: [] };
    const id = randomUUID();
    store.transact(() => { store.db.prepare("INSERT INTO mb_brain_drafts VALUES(?,?,?,?,?,'draft',?)").run(id, 'voice', `Message${to ? ` to ${to}` : ''}`, body, 'writer', new Date().toISOString()); store.appendEvidence('brain.draft.created', id, 'From voice; draft only, not sent'); });
    r = { tool: 'draft_message', dispatched: false, pending: { kind: 'draft', id }, text: `I saved a draft${to ? ` to ${to}` : ''}. Nothing was sent; review it in Brain.`, links: [{ label: 'Review the draft', href: `/brain?draft=${id}` }] };
  }
  store.transact(() => store.appendEvidence('voice.tool', name, `${name}(${JSON.stringify(args).slice(0, 200)}) -> ${r.pending ? `pending ${r.pending.kind} ${r.pending.id}` : 'read'}; not dispatched`));
  return r;
}

/** Deterministic intent rules (token saver: no model call for common commands). */
export function ruleIntent(text: string): { tool: ToolName; args: Record<string, unknown> } | null {
  const t = text.trim().replace(/^(hey|ok)[\s,]+meta[\s,]*bo?ss?[,.!]?\s*/i, '');
  let m;
  if ((m = t.match(/^(?:create|add|make)\s+(?:a\s+)?(?:task|reminder|to-?do)\s*(?:to|:|for)?\s+(.+)$/i))) return { tool: 'create_task', args: { title: m[1].replace(/[.?!]$/, '') } };
  if ((m = t.match(/^(?:draft|write)\s+(?:a\s+)?(?:message|note|reply|email)(?:\s+to\s+([^:,]+?))?\s*(?::|,|saying|that)\s*(.+)$/i))) return { tool: 'draft_message', args: { to: m[1] ?? '', body: m[2] } };
  if ((m = t.match(/^(?:explain|what is|what's|tell me about)\s+(?:item|run|order|task)\s+([A-Za-z0-9-]{4,})/i))) return { tool: 'explain_item', args: { id: m[1] } };
  if (/\b(list|show|what are)\b.*\b(tasks|to-?dos)\b|^tasks\b/i.test(t)) return { tool: 'list_tasks', args: {} };
  if (/\b(status|summary|how are we|what'?s (up|pending|new)|briefing|overview)\b/i.test(t)) return { tool: 'get_status', args: {} };
  return null;
}

export const INTENT_PROMPT = `You route a business owner's voice command to exactly one tool. Reply with JSON only: {"tool":"<name>","args":{...}}.
Tools: get_status {} | explain_item {"id":string} | list_tasks {} | create_task {"title":string} | draft_message {"to":string,"body":string} | none {}.
Use "none" if nothing fits. Never invent ids, numbers or names that are not in the command.`;
export function parseIntent(raw: string): { tool: ToolName; args: Record<string, unknown> } | null {
  const j = raw.match(/\{[\s\S]*\}/)?.[0]; if (!j) return null;
  try { const o = JSON.parse(j); return ALL_TOOLS.includes(o?.tool) ? { tool: o.tool, args: o.args && typeof o.args === 'object' ? o.args : {} } : null; } catch { return null; }
}

export type VoiceReply = ToolResult & { heard: string; via: 'rule' | 'model' | 'none'; guard?: unknown };
/** Handle one command. `route` resolves intent with a model when no rule matched (low reasoning, cap-checked). */
export async function handleCommand(ctx: Ctx, heard: string, route?: (text: string) => Promise<{ text: string; model: string } | null>): Promise<VoiceReply> {
  const text = heard.trim().slice(0, 1000);
  ctx.store.transact(() => ctx.store.appendEvidence('voice.command', 'voice', JSON.stringify(text.slice(0, 300))));
  if (!text) return { tool: 'refused', text: 'I didn’t catch that.', links: [], dispatched: false, heard: text, via: 'none' };
  if (APPROVE_RE.test(text)) return { ...refuseApprove(ctx, text), heard: text, via: 'rule' };
  let intent = ruleIntent(text); let via: VoiceReply['via'] = intent ? 'rule' : 'none';
  if (!intent && route) {
    const out = await route(text).catch(() => null);
    if (out) { intent = parseIntent(out.text); if (intent) { via = 'model'; ctx = { ...ctx, model: out.model }; } }
  }
  if (!intent) return { tool: 'refused', text: route ? 'I’m not sure what to do with that. Insufficient data.' : 'No AI model connected, and that isn’t a command I know. Try “status”, “list tasks” or “create a task to …”.', links: [], dispatched: false, heard: text, via };
  if (intent.tool === 'draft_message') {
    const guard = await guardDraft(ctx.store, String(intent.args.body ?? ''), { target: 'voice' });
    if (guard.verdict === 'unsafe') return { tool: 'refused', text: `Llama Guard blocked that draft (unsafe ${guard.categories.map((c) => c.code).join(', ')}).`, links: [], dispatched: false, heard: text, via, guard };
    return { ...runTool(ctx, intent.tool, intent.args), heard: text, via, guard };
  }
  return { ...runTool(ctx, intent.tool, intent.args), heard: text, via };
}
