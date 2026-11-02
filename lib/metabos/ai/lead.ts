/**
 * Lead/worker missions. A clean-room design based on the *observed* behaviour of
 * desplega-ai/agent-swarm (MIT): a lead plans, workers execute, and dependent tasks wake
 * once their prerequisites reach an outcome. No code from that project is used.
 * Built during the Meta Global AI Developer Hackathon (stacked PR on #22).
 *
 * Gates follow PR #22:
 *  - This module never calls a model directly. The lead (Muse Wonder) and the workers
 *    (Muse Spark/Baseten) are InferenceStore drafts, and each needs its own Jev approval.
 *  - A worker output becomes an action only through proposeInferenceAction, and that action
 *    needs a second, payload-bound Jev approval.
 *  - Until an approved lead plan is adopted, missions use a deterministic rule plan.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { BusinessStore } from '../store';
import { BusinessError } from '../store';
import { AGENT_ROLES } from '../workflows';
import { InferenceStore } from '../inference/store';
import { routes, fingerprint } from '../inference/routing';
import { proposeInferenceAction } from '../inference/jev-bridge';
import { runtimeEnv } from '@/lib/creds';
import { sortTask, type Role } from './swarm';

type Env = Record<string, string | undefined>;
export type Lane = 'meta' | 'baseten';
type Opts = { env?: Env; lane?: Lane; paidConsent?: boolean };
export type TaskStatus = 'blocked' | 'ready' | 'awaiting_inference' | 'proposed' | 'done' | 'failed' | 'cancelled';
export type MissionTask = { id: string; missionId: string; idx: number; text: string; role: Role; dependsOn: number[]; wantsWrite: number; status: TaskStatus; inferenceId: string | null; outcome: string | null; runId: string | null };
export type Mission = { id: string; request: string; planner: string; lane: Lane; paidConsent: number; leadTaskId: string | null; createdAt: string; tasks: MissionTask[] };

const TERMINAL: TaskStatus[] = ['proposed', 'done', 'failed', 'cancelled'];
export const LEAD_PROMPT = `You are the lead agent of a small-business operations swarm. You cannot act. Split the request into at most 6 subtasks for these worker roles: ${AGENT_ROLES.join(', ')}. Return exactly {"subtasks":[{"text":"...","role":"...","dependsOn":[0]}]} where dependsOn lists indexes of EARLIER subtasks. No markdown.`;
const workerPrompt = (text: string) => `Propose only a reminder for human review for this request: ${text}. Return exactly {"tool":"reminders.create","args":{"title":"your reminder title"}}, no markdown or extra fields. Do not execute actions.`;

const PlanSchema = z.object({ subtasks: z.array(z.object({ text: z.string().trim().min(3).max(500), role: z.enum(AGENT_ROLES), dependsOn: z.array(z.number().int().min(0)).max(6).default([]) }).strict()).min(1).max(6) }).strict();
type PlanItem = { text: string; role: Role; dependsOn: number[]; wantsWrite: boolean };

/** Strict: the whole output must be the JSON plan (no markdown stripping); dependencies must point backwards. */
export function parseLeadPlan(raw: string): { ok: true; plan: PlanItem[] } | { ok: false; reason: string } {
  let json: unknown; try { json = JSON.parse(raw); } catch { return { ok: false, reason: 'Lead output was not exactly one JSON object.' }; }
  const r = PlanSchema.safeParse(json);
  if (!r.success) return { ok: false, reason: `Lead plan refused: ${r.error.issues[0]?.message ?? 'invalid'}` };
  for (const [i, s] of r.data.subtasks.entries()) if (s.dependsOn.some((d) => d >= i)) return { ok: false, reason: `Subtask ${i} depends on a later or same subtask; refused.` };
  return { ok: true, plan: r.data.subtasks.map((s) => ({ ...s, dependsOn: [...new Set(s.dependsOn)], wantsWrite: sortTask(s.text, 'p')[0]?.wantsWrite ?? false })) };
}
/** Rule plan: each later write waits on the earlier subtasks ("then" semantics), read-only ones run at once. */
export function rulePlan(request: string): PlanItem[] {
  const subs = sortTask(request, 'm').slice(0, 6);
  return subs.map((t, i) => ({ text: t.text, role: t.role, wantsWrite: t.wantsWrite, dependsOn: /\bthen\b/i.test(request) && i > 0 ? [i - 1] : [] }));
}

function ensure(s: BusinessStore) {
  s.db.exec(`CREATE TABLE IF NOT EXISTS mb_missions(id TEXT PRIMARY KEY, request TEXT NOT NULL, planner TEXT NOT NULL, lane TEXT NOT NULL, paidConsent INTEGER NOT NULL, leadTaskId TEXT, createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mb_mission_tasks(id TEXT PRIMARY KEY, missionId TEXT NOT NULL REFERENCES mb_missions(id), idx INTEGER NOT NULL, text TEXT NOT NULL, role TEXT NOT NULL, dependsOn TEXT NOT NULL, wantsWrite INTEGER NOT NULL, status TEXT NOT NULL, inferenceId TEXT, outcome TEXT, runId TEXT, UNIQUE(missionId, idx));`);
}
const inf = (s: BusinessStore, env?: Env) => new InferenceStore(s, () => routes(env ?? runtimeEnv()));

export function getMission(s: BusinessStore, id: string): Mission {
  ensure(s);
  const m = s.db.prepare('SELECT * FROM mb_missions WHERE id=?').get(id) as any;
  if (!m) throw new BusinessError('Mission not found', 404);
  return { ...m, tasks: (s.db.prepare('SELECT * FROM mb_mission_tasks WHERE missionId=? ORDER BY idx').all(id) as any[]).map((r) => ({ ...r, dependsOn: JSON.parse(r.dependsOn) })) };
}
export function listMissions(s: BusinessStore, limit = 20): Mission[] {
  ensure(s);
  return (s.db.prepare('SELECT id FROM mb_missions ORDER BY createdAt DESC, rowid DESC LIMIT ?').all(limit) as { id: string }[]).map((m) => getMission(s, m.id));
}
function insertTasks(s: BusinessStore, missionId: string, plan: PlanItem[]) {
  plan.forEach((p, i) => s.db.prepare('INSERT INTO mb_mission_tasks(id,missionId,idx,text,role,dependsOn,wantsWrite,status) VALUES(?,?,?,?,?,?,?,?)')
    .run(randomUUID(), missionId, i, p.text, p.role, JSON.stringify(p.dependsOn), p.wantsWrite ? 1 : 0, p.dependsOn.length ? 'blocked' : 'ready'));
}

/** Creates a mission from the rule plan plus one Muse Wonder lead draft (awaiting Jev approval), then advances it. */
export function createMission(s: BusinessStore, request: string, opts: Opts = {}): Mission {
  ensure(s);
  if (request.trim().length < 3 || request.length > 4000) throw new BusinessError('Mission request must contain 3–4000 characters');
  const lane = opts.lane ?? 'meta'; const paid = !!opts.paidConsent; const id = randomUUID();
  s.transact(() => {
    const lead = lane === 'meta' ? inf(s, opts.env).create({ title: `Lead plan: ${request.slice(0, 140)}`, prompt: `${LEAD_PROMPT}\n\nRequest: ${request}`, kind: 'plan', lane, maxTokens: 2048, paidConsent: paid }) : null;
    s.db.prepare('INSERT INTO mb_missions VALUES(?,?,?,?,?,?,?)').run(id, request, 'rule', lane, paid ? 1 : 0, lead?.id ?? null, new Date().toISOString());
    insertTasks(s, id, rulePlan(request));
    s.appendEvidence('ai.mission.created', id, `rule plan; lead draft ${lead?.id ?? 'none'} awaiting Jev approval`);
  });
  return advanceMission(s, id, opts);
}

/** Adopts an approved, completed lead draft as the plan, but only while no worker draft has been approved. */
export function adoptLeadPlan(s: BusinessStore, missionId: string, opts: Opts = {}): Mission {
  const m = getMission(s, missionId); const store = inf(s, opts.env);
  if (!m.leadTaskId) throw new BusinessError('This mission has no lead draft', 409);
  const lead = store.task(m.leadTaskId);
  if (lead.state !== 'completed' || lead.approvedHash !== lead.hash || fingerprint(lead.payload) !== lead.hash || !lead.output || fingerprint(lead.output) !== lead.outputHash) throw new BusinessError('An approved, completed lead draft with intact evidence is required', 409);
  const started = m.tasks.some((t) => t.inferenceId && store.task(t.inferenceId).state !== 'awaiting_approval');
  if (started || m.tasks.some((t) => t.status === 'proposed')) throw new BusinessError('Workers already started; create a new mission to use the lead plan', 409);
  const p = parseLeadPlan(lead.output);
  if (!p.ok) throw new BusinessError(p.reason, 422);
  s.transact(() => {
    for (const t of m.tasks) if (t.inferenceId) store.cancel(t.inferenceId);
    s.db.prepare('DELETE FROM mb_mission_tasks WHERE missionId=?').run(missionId);
    insertTasks(s, missionId, p.plan);
    s.db.prepare('UPDATE mb_missions SET planner=? WHERE id=?').run(lead.payload.model, missionId);
    s.appendEvidence('ai.mission.plan_adopted', missionId, `lead ${lead.id} output SHA256=${lead.outputHash}`);
  });
  return advanceMission(s, missionId, opts);
}

function set(s: BusinessStore, id: string, f: Partial<Pick<MissionTask, 'status' | 'inferenceId' | 'outcome' | 'runId'>>) {
  const keys = Object.keys(f) as (keyof typeof f)[];
  s.db.prepare(`UPDATE mb_mission_tasks SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`).run(...keys.map((k) => f[k] ?? null), id);
}

/**
 * Advances without spending: it wakes dependants, files worker drafts for ready writes, and
 * turns completed worker drafts into Jev action proposals. It never approves anything.
 */
export function advanceMission(s: BusinessStore, missionId: string, opts: Opts = {}): Mission {
  const store = inf(s, opts.env);
  for (let guard = 0; guard < 20; guard++) {
    const m = getMission(s, missionId); let changed = false;
    for (const t of m.tasks) {
      if (t.status === 'blocked') {
        const deps = t.dependsOn.map((d) => m.tasks[d]);
        if (deps.some((d) => !d || d.status === 'failed' || d.status === 'cancelled')) { set(s, t.id, { status: 'cancelled', outcome: 'A prerequisite failed; not started.' }); changed = true; }
        else if (deps.every((d) => TERMINAL.includes(d.status))) { set(s, t.id, { status: 'ready' }); changed = true; }
      } else if (t.status === 'ready') {
        if (!t.wantsWrite) set(s, t.id, { status: 'done', outcome: 'Read-only subtask; nothing to propose.' });
        else {
          try {
            const d = store.create({ title: `Worker ${t.role}: ${t.text.slice(0, 120)}`, prompt: workerPrompt(t.text), kind: 'draft', lane: m.lane, maxTokens: 1024, paidConsent: !!m.paidConsent });
            set(s, t.id, { status: 'awaiting_inference', inferenceId: d.id, outcome: 'Worker draft filed; approve it in the Jev inference queue.' });
          } catch (e) { set(s, t.id, { status: 'failed', outcome: (e as Error).message.slice(0, 300) }); }
        }
        changed = true;
      } else if (t.status === 'awaiting_inference' && t.inferenceId) {
        const d = store.task(t.inferenceId);
        if (d.state === 'completed') {
          try { const run = proposeInferenceAction(store, d.id) as any; set(s, t.id, { status: 'proposed', runId: run?.id ?? null, outcome: 'Action proposed; it needs a second Jev approval of its payload hash.' }); }
          catch (e) { set(s, t.id, { status: 'failed', outcome: (e as Error).message.slice(0, 300) }); }
          changed = true;
        } else if (d.state === 'failed' || d.state === 'cancelled') { set(s, t.id, { status: 'failed', outcome: `Worker draft ${d.state}.` }); changed = true; }
      }
    }
    if (!changed) break;
  }
  return getMission(s, missionId);
}
