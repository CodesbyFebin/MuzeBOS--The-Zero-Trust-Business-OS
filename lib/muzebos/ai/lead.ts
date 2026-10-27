/**
 * Lead/worker missions. Clean-room design inspired by the *observed* behaviour of
 * desplega-ai/agent-swarm (MIT): a lead plans, workers execute, dependent tasks wake
 * when their prerequisites reach an outcome. No code from that project is used.
 *
 * Built during the Meta Global AI Developer Hackathon (PR #23).
 * The lead is Muse Wonder (Meta Model API) when a key is set, otherwise a deterministic
 * rule planner. Workers never write: any write becomes a Jev proposal awaiting approval.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { BusinessStore } from '../store';
import { BusinessError } from '../store';
import { AGENT_ROLES } from '../workflows';
import { metaChat, metaKey, META_MODELS } from './meta';
import { sortTask, parseModelProposal, ruleProposal, PROPOSAL_PROMPT, type Role, type Subtask } from './swarm';
import { propose } from './jev';

type Env = Record<string, string | undefined>;
type Opts = { env?: Env; fetch?: typeof fetch };
export type TaskStatus = 'blocked' | 'ready' | 'proposed' | 'done' | 'failed' | 'cancelled';
export type MissionTask = { id: string; missionId: string; idx: number; text: string; role: Role; dependsOn: number[]; status: TaskStatus; worker: string | null; outcome: string | null; runId: string | null };
export type Mission = { id: string; request: string; planner: string; createdAt: string; tasks: MissionTask[] };

const TERMINAL: TaskStatus[] = ['proposed', 'done', 'failed', 'cancelled'];
export const LEAD_PROMPT = `You are the lead agent of a small-business operations swarm. You cannot act. Split the request into at most 6 subtasks for these worker roles: ${AGENT_ROLES.join(', ')}. Reply with ONLY JSON {"subtasks":[{"text":"...","role":"...","dependsOn":[0]}]} where dependsOn lists indexes of EARLIER subtasks that must finish first.`;

const PlanSchema = z.object({ subtasks: z.array(z.object({ text: z.string().trim().min(3).max(500), role: z.enum(AGENT_ROLES), dependsOn: z.array(z.number().int().min(0)).max(6).default([]) })).min(1).max(6) });
export type Plan = { planner: string; subtasks: { text: string; role: Role; dependsOn: number[] }[]; note?: string };

/** Validates a model plan: schema, and every dependency must point at an earlier index (so the graph is acyclic). */
export function parseLeadPlan(raw: string): { ok: true; plan: Plan['subtasks'] } | { ok: false; reason: string } {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return { ok: false, reason: 'Lead reply had no JSON object.' };
  let json: unknown; try { json = JSON.parse(m[0]); } catch { return { ok: false, reason: 'Lead reply was not valid JSON.' }; }
  const r = PlanSchema.safeParse(json);
  if (!r.success) return { ok: false, reason: `Lead plan refused: ${r.error.issues[0]?.message ?? 'invalid'}` };
  for (const [i, s] of r.data.subtasks.entries()) if (s.dependsOn.some((d) => d >= i)) return { ok: false, reason: `Subtask ${i} depends on a later or same subtask; refused.` };
  return { ok: true, plan: r.data.subtasks.map((s) => ({ ...s, dependsOn: [...new Set(s.dependsOn)] })) };
}

export function rulePlan(request: string): Plan['subtasks'] {
  return sortTask(request, 'm').map((t) => ({ text: t.text, role: t.role, dependsOn: [] }));
}

export async function planWithLead(request: string, opts: Opts = {}): Promise<Plan> {
  const env = opts.env ?? process.env;
  if (!metaKey(env)) return { planner: 'rule', subtasks: rulePlan(request) };
  try {
    const r = await metaChat(META_MODELS.wonder, [{ role: 'system', content: LEAD_PROMPT }, { role: 'user', content: request }], { env, fetch: opts.fetch });
    const p = parseLeadPlan(r.text);
    if (p.ok) return { planner: r.model, subtasks: p.plan };
    return { planner: 'rule', subtasks: rulePlan(request), note: p.reason };
  } catch (e) { return { planner: 'rule', subtasks: rulePlan(request), note: `Lead call failed: ${(e as Error).message.slice(0, 160)}` }; }
}

function ensure(store: BusinessStore) {
  store.db.exec(`CREATE TABLE IF NOT EXISTS mb_missions(id TEXT PRIMARY KEY, request TEXT NOT NULL, planner TEXT NOT NULL, createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mb_mission_tasks(id TEXT PRIMARY KEY, missionId TEXT NOT NULL REFERENCES mb_missions(id), idx INTEGER NOT NULL, text TEXT NOT NULL, role TEXT NOT NULL, dependsOn TEXT NOT NULL, status TEXT NOT NULL, worker TEXT, outcome TEXT, runId TEXT, UNIQUE(missionId, idx));`);
}
const row = (r: any): MissionTask => ({ ...r, dependsOn: JSON.parse(r.dependsOn) });

export function getMission(store: BusinessStore, id: string): Mission {
  ensure(store);
  const m = store.db.prepare('SELECT * FROM mb_missions WHERE id=?').get(id) as any;
  if (!m) throw new BusinessError('Mission not found', 404);
  return { ...m, tasks: (store.db.prepare('SELECT * FROM mb_mission_tasks WHERE missionId=? ORDER BY idx').all(id) as any[]).map(row) };
}
export function listMissions(store: BusinessStore, limit = 20): Mission[] {
  ensure(store);
  return (store.db.prepare('SELECT id FROM mb_missions ORDER BY createdAt DESC LIMIT ?').all(limit) as { id: string }[]).map((m) => getMission(store, m.id));
}

export async function createMission(store: BusinessStore, request: string, opts: Opts = {}): Promise<Mission & { note?: string }> {
  ensure(store);
  const plan = await planWithLead(request, opts);
  const id = randomUUID(); const now = new Date().toISOString();
  store.transact(() => {
    store.db.prepare('INSERT INTO mb_missions VALUES(?,?,?,?)').run(id, request.slice(0, 4000), plan.planner, now);
    plan.subtasks.forEach((s, i) => store.db.prepare('INSERT INTO mb_mission_tasks(id,missionId,idx,text,role,dependsOn,status) VALUES(?,?,?,?,?,?,?)')
      .run(randomUUID(), id, i, s.text, s.role, JSON.stringify(s.dependsOn), s.dependsOn.length ? 'blocked' : 'ready'));
    store.appendEvidence('ai.mission.planned', id, `${plan.planner}: ${plan.subtasks.length} subtasks${plan.note ? `; ${plan.note}` : ''}`.slice(0, 1000));
  });
  return { ...getMission(store, id), note: plan.note };
}

/** Wakes blocked tasks once every dependency is terminal; a failed/cancelled dependency cancels the dependant. */
function wake(store: BusinessStore, missionId: string) {
  const tasks = getMission(store, missionId).tasks;
  for (const t of tasks.filter((x) => x.status === 'blocked')) {
    const deps = t.dependsOn.map((d) => tasks[d]);
    if (deps.some((d) => !d || d.status === 'failed' || d.status === 'cancelled')) set(store, t.id, 'cancelled', null, 'A prerequisite failed; not started.', null);
    else if (deps.every((d) => TERMINAL.includes(d.status))) set(store, t.id, 'ready', null, null, null);
  }
}
function set(store: BusinessStore, id: string, status: TaskStatus, worker: string | null, outcome: string | null, runId: string | null) {
  store.db.prepare('UPDATE mb_mission_tasks SET status=?, worker=COALESCE(?,worker), outcome=?, runId=? WHERE id=?').run(status, worker, outcome, runId, id);
}

async function work(store: BusinessStore, t: MissionTask, opts: Opts) {
  const sub: Subtask = { ...sortTask(t.text, 'w')[0], id: t.id, text: t.text, role: t.role };
  if (!sub.wantsWrite) return set(store, t.id, 'done', 'rule', 'Read-only subtask; nothing to propose.', null);
  const env = opts.env ?? process.env;
  try {
    if (!metaKey(env)) {
      const run = propose(store, ruleProposal(sub)!) as any;
      return set(store, t.id, 'proposed', 'rule', 'Rule worker filed a Jev proposal; awaiting approval.', run?.id ?? null);
    }
    const r = await metaChat(META_MODELS.spark, [{ role: 'system', content: PROPOSAL_PROMPT }, { role: 'user', content: `Agent role: ${t.role}. Subtask: ${t.text}` }], { env, fetch: opts.fetch });
    const p = parseModelProposal(r.text, { taskId: t.id, role: t.role, model: r.model });
    if (!p.ok) return set(store, t.id, 'done', r.model, `No write proposed: ${p.reason}`.slice(0, 500), null);
    const run = propose(store, p.proposal) as any;
    set(store, t.id, 'proposed', r.model, 'Worker proposal filed with Jev; awaiting approval of its payload hash.', run?.id ?? null);
  } catch (e) { set(store, t.id, 'failed', null, (e as Error).message.slice(0, 300), null); }
}

/** Runs every ready task, waking dependants, until no task is ready. */
export async function runMission(store: BusinessStore, missionId: string, opts: Opts = {}): Promise<Mission> {
  for (let guard = 0; guard < 20; guard++) {
    wake(store, missionId);
    const ready = getMission(store, missionId).tasks.filter((t) => t.status === 'ready');
    if (!ready.length) break;
    for (const t of ready) await work(store, t, opts);
  }
  const m = getMission(store, missionId);
  store.transact(() => store.appendEvidence('ai.mission.ran', missionId, m.tasks.map((t) => `${t.idx}:${t.status}`).join(' ')));
  return m;
}
