/**
 * Chief of Staff: a deterministic daily brief, a decisions registry and an observer review of
 * agent proposals. Clean-room design based on the *observed* behaviour of several reference
 * projects. No code from them is used:
 *  - gquthier/company-os (MIT): a decisions registry so a settled question is never asked again,
 *    and tiered autonomy (T1 acts and logs, T2 acts and notifies, T3 waits; money is always T3).
 *  - Hyper-AI-Lab/cyber-ai-team (MIT): an observer that reviews proposals for prompt-injection
 *    style instructions and goal drift before a human decides.
 *  - simonlin1212/Agent-Staff and felipeluissalgueiro/hive (MIT): a chief of staff that rolls up
 *    every department into one brief.
 * MeTaBos is stricter than tiered autonomy: the tier is advisory only. Every agent write still
 * needs a payload-bound Jev approval, and nothing in this module approves or executes anything.
 * Built during the Meta Global AI Developer Hackathon.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { BusinessError, type BusinessStore } from './store';
import { queue } from './ai/jev';
import { listMissions } from './ai/lead';
import { listGoals, ruleDraft } from './goals';

export const DecisionInput = z.object({ question: z.string().trim().min(5).max(300), answer: z.string().trim().min(1).max(1000), decidedBy: z.string().trim().min(1).max(80).default('owner') }).strict();
export type Decision = { id: string; key: string; question: string; answer: string; decidedBy: string; createdAt: string };

const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'for', 'and', 'or', 'we', 'do', 'should', 'is', 'are', 'our', 'on', 'in', 'with', 'what', 'how', 'which', 'when', 'it', 'be', 'us']);
export const tokens = (t: string) => [...new Set(t.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)))];
const keyOf = (q: string) => tokens(q).sort().join(' ');

function ensure(s: BusinessStore) {
  s.db.exec(`CREATE TABLE IF NOT EXISTS mb_decisions (id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, question TEXT NOT NULL, answer TEXT NOT NULL, decidedBy TEXT NOT NULL, createdAt TEXT NOT NULL)`);
}

/** Records a decision. Re-deciding the same question is refused; decisions are append-only so the history stays auditable. */
export function recordDecision(s: BusinessStore, raw: unknown): Decision {
  ensure(s); const d = DecisionInput.parse(raw); const key = keyOf(d.question);
  if (!key) throw new BusinessError('Question needs at least one meaningful word', 400);
  if (s.db.prepare('SELECT 1 FROM mb_decisions WHERE key=?').get(key)) throw new BusinessError('This question is already decided; see the decisions registry', 409);
  const row: Decision = { id: randomUUID(), key, question: d.question, answer: d.answer, decidedBy: d.decidedBy, createdAt: new Date().toISOString() };
  s.transact(() => { s.db.prepare('INSERT INTO mb_decisions VALUES (?,?,?,?,?,?)').run(row.id, row.key, row.question, row.answer, row.decidedBy, row.createdAt); s.appendEvidence('decision.recorded', 'chief-of-staff', `${row.id}: ${row.question.slice(0, 120)}`); });
  return row;
}
export function listDecisions(s: BusinessStore, limit = 50): Decision[] { ensure(s); return s.db.prepare('SELECT * FROM mb_decisions ORDER BY createdAt DESC, rowid DESC LIMIT ?').all(limit) as Decision[]; }

/** Lookup-first: returns prior decisions whose words overlap the question (Jaccard >= 0.5), best first. */
export function lookupDecision(s: BusinessStore, question: string): { decision: Decision; score: number }[] {
  const q = tokens(question); if (!q.length) return [];
  return listDecisions(s, 500).map((d) => { const k = d.key.split(' '); const inter = k.filter((w) => q.includes(w)).length; return { decision: d, score: Math.round((inter / new Set([...k, ...q]).size) * 100) / 100 }; })
    .filter((m) => m.score >= 0.5).sort((a, b) => b.score - a.score).slice(0, 5);
}

export type Tier = 'T1' | 'T2' | 'T3';
export type ObserverFlag = { code: string; detail: string };
const INJECTION = [/ignore (all |any )?(previous|prior|above) (instructions|rules)/i, /system prompt/i, /\b(auto-?approve|approve (this|it|yourself))\b/i, /\bdisregard\b.*\b(rules|policy|instructions)\b/i, /\byou are now\b/i];
const MONEY = /\b(pay|payment|refund|transfer|wire|invoice|charge|purchase|buy|discount|price)\b|[$€£₹]\s?\d/i;
const IRREVERSIBLE = /\b(delete|remove|cancel|terminate|fire|close account|wipe)\b/i;
const SECRET = /\b(password|passcode|otp|api[ _-]?key|token|card number|cvv)\b/i;

/** Advisory tier for a proposed title, after gquthier/company-os's rule: money and the irreversible are always T3. */
export function tierOf(text: string): Tier { return MONEY.test(text) || IRREVERSIBLE.test(text) ? 'T3' : /\b(customer|email|message|post|publish|send)\b/i.test(text) ? 'T2' : 'T1'; }

/** Deterministic observer review of one agent proposal. Flags are advice for the human; they never approve or block by themselves. */
export function observe(p: { args?: { title?: string }; rationale?: string; source?: string }, context?: string): { tier: Tier; flags: ObserverFlag[] } {
  const title = p.args?.title ?? ''; const all = `${title} ${p.rationale ?? ''}`; const flags: ObserverFlag[] = [];
  if (INJECTION.some((r) => r.test(all))) flags.push({ code: 'injection', detail: 'Text reads like an instruction to the approver or the model' });
  if (/https?:\/\/|www\./i.test(all)) flags.push({ code: 'link', detail: 'Contains a link; check where it points before approving' });
  if (SECRET.test(all)) flags.push({ code: 'secret', detail: 'Mentions a credential or one-time code' });
  if (MONEY.test(all)) flags.push({ code: 'money', detail: 'Touches money; MeTaBos treats this as T3' });
  if (context) { const c = tokens(context); const t = tokens(title); if (c.length && t.length && !t.some((w) => c.includes(w))) flags.push({ code: 'drift', detail: 'Shares no words with the task it came from' }); }
  if (p.source === 'model' && title.length > 140) flags.push({ code: 'long', detail: 'Unusually long model-written title' });
  return { tier: tierOf(all), flags };
}

export type Brief = {
  generatedAt: string;
  approvals: { runId: string; title: string; role: string; source: string; tier: Tier; flags: ObserverFlag[] }[];
  missions: { total: number; byStatus: Record<string, number>; stuck: { missionId: string; request: string; failed: number }[] };
  goals: { id: string; title: string; progress: number; status: string; note: string }[];
  decisions: Decision[];
  headline: string;
};

/** One brief across approvals, missions, goals and decisions. Read-only. */
export function brief(s: BusinessStore, now = new Date()): Brief {
  const missions = listMissions(s, 50); const taskText = new Map<string, string>();
  for (const m of missions) for (const t of m.tasks) taskText.set(t.id, t.text);
  const approvals = queue(s).filter((r) => r.status === 'awaiting_approval').map((r) => {
    const i = (r.input ?? {}) as { taskId?: string; role?: string; source?: string; args?: { title?: string }; rationale?: string };
    const o = observe(i, i.taskId ? taskText.get(i.taskId) : undefined);
    return { runId: r.id, title: i.args?.title ?? '', role: i.role ?? '', source: i.source ?? '', ...o };
  }).sort((a, b) => b.tier.localeCompare(a.tier) || b.flags.length - a.flags.length);
  const byStatus: Record<string, number> = {};
  for (const m of missions) for (const t of m.tasks) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
  const stuck = missions.map((m) => ({ missionId: m.id, request: m.request, failed: m.tasks.filter((t) => t.status === 'failed' || t.status === 'cancelled').length })).filter((m) => m.failed > 0);
  const goals = listGoals(s).map((g) => { const d = ruleDraft(g, now); return { id: g.id, title: g.title, progress: g.progress, status: d.status, note: d.note }; }).sort((a, b) => (a.status === 'on_track' ? 1 : 0) - (b.status === 'on_track' ? 1 : 0));
  const decisions = listDecisions(s, 5);
  const flagged = approvals.filter((a) => a.flags.length).length; const atRisk = goals.filter((g) => g.status !== 'on_track').length;
  const headline = `${approvals.length} approval${approvals.length === 1 ? '' : 's'} waiting (${flagged} flagged by the observer), ${atRisk} goal${atRisk === 1 ? '' : 's'} not on track, ${stuck.length} mission${stuck.length === 1 ? '' : 's'} with failed tasks.`;
  return { generatedAt: now.toISOString(), approvals, missions: { total: missions.length, byStatus, stuck }, goals, decisions, headline };
}
