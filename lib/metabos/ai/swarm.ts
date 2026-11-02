/**
 * Agent swarm: a deterministic task sorter splits a request into subtasks and assigns each to a
 * role agent and a tier. Agents may only PROPOSE tool calls; proposals are parsed as untrusted
 * data and go to the Jev gate. Nothing here can write.
 */
import { AgentProposalSchema, AGENT_ROLES, type AgentProposal } from '../workflows';
import { classify } from './router';
import type { Tier } from './models';

export type Role = typeof AGENT_ROLES[number];
export type Subtask = { id: string; text: string; role: Role; tier: Tier; why: string; wantsWrite: boolean };

const ROLE_RULES: [Role, RegExp][] = [
  ['inventory', /\b(stock|inventory|restock|sku|product|warehouse|supplier)/i],
  ['finance', /\b(invoice|payment|paid|refund|revenue|cash|tax|gst|expense|price)/i],
  ['customers', /\b(customer|client|lead|follow[- ]?up|call|email|message|reply)/i],
  ['writer', /\b(write|draft|copy|post|caption|announce|describe)/i],
];
const WRITE = /\b(remind|reminder|follow[- ]?up|schedule|todo|to-do|task|create|add|set up|restock)\b/i;

/** Split on sentence ends, new lines, ';' and ' then ' / ' and then '. Max 8 subtasks. */
export function sortTask(text: string, idPrefix = 't'): Subtask[] {
  const parts = text.split(/(?:\n+|;|(?<=[.!?])\s+|\s+(?:and\s+)?then\s+)/i).map((p) => p.trim().replace(/[.!?]+$/, '')).filter((p) => p.length > 2).slice(0, 8);
  return parts.map((p, i) => {
    const hit = ROLE_RULES.find(([, re]) => re.test(p));
    const role: Role = hit ? hit[0] : 'operations';
    const c = classify(p);
    return { id: `${idPrefix}${i + 1}`, text: p, role, tier: c.tier, why: `${hit ? `matched ${role} words` : 'no domain words, operations'}; ${c.why}`, wantsWrite: WRITE.test(p) };
  });
}

export type ParsedProposal = { ok: true; proposal: AgentProposal } | { ok: false; reason: string };

/** Parse untrusted model text: first JSON object only, then strict schema. Anything else is refused. */
export function parseModelProposal(raw: string, ctx: { taskId: string; role: Role; model: string }): ParsedProposal {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return { ok: false, reason: 'Model output had no JSON proposal' };
  let obj: any; try { obj = JSON.parse(m[0]); } catch { return { ok: false, reason: 'Model output was not valid JSON' }; }
  if (!obj || typeof obj !== 'object') return { ok: false, reason: 'Model output was not an object' };
  // The model may only choose tool and args. Task, role, source and model are fixed by the caller.
  const r = AgentProposalSchema.safeParse({ tool: obj.tool, args: obj.args, rationale: typeof obj.rationale === 'string' ? obj.rationale.slice(0, 500) : '', taskId: ctx.taskId, role: ctx.role, source: 'model', model: ctx.model });
  return r.success ? { ok: true, proposal: r.data } : { ok: false, reason: `Refused: ${r.error.issues.map((i) => `${i.path.join('.') || 'proposal'} ${i.message}`).join('; ')}` };
}

/** Without a model, an agent drafts a rule-based reminder proposal for write-like subtasks so the
 *  gate can be used. It is labelled source:'rule' everywhere. */
export function ruleProposal(t: Subtask): AgentProposal | null {
  if (!t.wantsWrite) return null;
  return AgentProposalSchema.parse({ taskId: t.id, role: t.role, tool: 'reminders.create', args: { title: t.text.slice(0, 180) }, rationale: 'Rule-based draft: the subtask asks for a follow-up action. No model was used.', source: 'rule', model: null });
}

export const PROPOSAL_PROMPT = 'You are a business operations agent. You cannot act. If the task needs a reminder, reply with ONLY JSON {"tool":"reminders.create","args":{"title":"..."},"rationale":"..."}; otherwise reply {"tool":null}.';
