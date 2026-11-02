/**
 * Goals, projects and check-ins. Clean-room, inspired by the observed product behaviour of
 * Operately (Apache-2.0 core): measurable goals linked to projects, with regular check-ins.
 * No Operately code or assets are used. Built during the Meta hackathon (PR #23).
 *
 * A rule draft is instant. A Muse Spark draft is an InferenceStore task gated by Jev approval;
 * its output is returned for editing and never saved. A human posts the check-in.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { BusinessError, type BusinessStore } from './store';
import { InferenceStore } from './inference/store';
import { routes, fingerprint } from './inference/routing';
import { runtimeEnv } from '@/lib/creds';

type Env = Record<string, string | undefined>;
export const CHECKIN_STATUS = ['on_track', 'at_risk', 'off_track'] as const;
export const GoalInput = z.object({ title: z.string().trim().min(3).max(200), unit: z.string().trim().max(20).default(''), start: z.number().finite(), target: z.number().finite(), due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).refine((g) => g.start !== g.target, 'Target must differ from start');
export const CheckinInput = z.object({ goalId: z.string().max(64), status: z.enum(CHECKIN_STATUS), value: z.number().finite(), note: z.string().trim().min(1).max(2000) });
export const ProjectInput = z.object({ goalId: z.string().max(64), title: z.string().trim().min(3).max(200) });

export type Checkin = { id: string; goalId: string; status: typeof CHECKIN_STATUS[number]; value: number; note: string; createdAt: string };
export type Project = { id: string; goalId: string; title: string; done: number };
export type Goal = { id: string; title: string; unit: string; start: number; target: number; current: number; due: string | null; createdAt: string; progress: number; projects: Project[]; checkins: Checkin[] };

function ensure(s: BusinessStore) {
  s.db.exec(`CREATE TABLE IF NOT EXISTS mb_goals(id TEXT PRIMARY KEY, title TEXT NOT NULL, unit TEXT NOT NULL, start REAL NOT NULL, target REAL NOT NULL, current REAL NOT NULL, due TEXT, createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mb_goal_projects(id TEXT PRIMARY KEY, goalId TEXT NOT NULL REFERENCES mb_goals(id), title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0,1)));
    CREATE TABLE IF NOT EXISTS mb_goal_checkins(id TEXT PRIMARY KEY, goalId TEXT NOT NULL REFERENCES mb_goals(id), status TEXT NOT NULL, value REAL NOT NULL, note TEXT NOT NULL, createdAt TEXT NOT NULL);`);
}
export const progressOf = (start: number, target: number, current: number) => Math.round(Math.min(1, Math.max(0, (current - start) / (target - start))) * 100);

export function getGoal(s: BusinessStore, id: string): Goal {
  ensure(s);
  const g = s.db.prepare('SELECT * FROM mb_goals WHERE id=?').get(id) as any;
  if (!g) throw new BusinessError('Goal not found', 404);
  return { ...g, progress: progressOf(g.start, g.target, g.current),
    projects: s.db.prepare('SELECT * FROM mb_goal_projects WHERE goalId=? ORDER BY rowid').all(id) as Project[],
    checkins: s.db.prepare('SELECT * FROM mb_goal_checkins WHERE goalId=? ORDER BY createdAt DESC, rowid DESC').all(id) as Checkin[] };
}
export function listGoals(s: BusinessStore): Goal[] { ensure(s); return (s.db.prepare('SELECT id FROM mb_goals ORDER BY createdAt DESC').all() as { id: string }[]).map((g) => getGoal(s, g.id)); }

export function createGoal(s: BusinessStore, raw: unknown): Goal {
  ensure(s); const g = GoalInput.parse(raw); const id = randomUUID();
  s.transact(() => { s.db.prepare('INSERT INTO mb_goals VALUES(?,?,?,?,?,?,?,?)').run(id, g.title, g.unit, g.start, g.target, g.start, g.due ?? null, new Date().toISOString()); s.appendEvidence('goal.created', id, g.title); });
  return getGoal(s, id);
}
export function addProject(s: BusinessStore, raw: unknown): Goal {
  ensure(s); const p = ProjectInput.parse(raw); getGoal(s, p.goalId);
  s.transact(() => { s.db.prepare('INSERT INTO mb_goal_projects(id,goalId,title) VALUES(?,?,?)').run(randomUUID(), p.goalId, p.title); s.appendEvidence('goal.project.added', p.goalId, p.title); });
  return getGoal(s, p.goalId);
}
export function toggleProject(s: BusinessStore, id: string): Goal {
  ensure(s); const p = s.db.prepare('SELECT * FROM mb_goal_projects WHERE id=?').get(id) as Project | undefined;
  if (!p) throw new BusinessError('Project not found', 404);
  s.transact(() => { s.db.prepare('UPDATE mb_goal_projects SET done=1-done WHERE id=?').run(id); s.appendEvidence('goal.project.toggled', p.goalId, p.title); });
  return getGoal(s, p.goalId);
}
/** A human-authored check-in; it updates the goal's current value. */
export function addCheckin(s: BusinessStore, raw: unknown): Goal {
  ensure(s); const c = CheckinInput.parse(raw); getGoal(s, c.goalId);
  s.transact(() => {
    s.db.prepare('INSERT INTO mb_goal_checkins VALUES(?,?,?,?,?,?)').run(randomUUID(), c.goalId, c.status, c.value, c.note, new Date().toISOString());
    s.db.prepare('UPDATE mb_goals SET current=? WHERE id=?').run(c.value, c.goalId);
    s.appendEvidence('goal.checkin', c.goalId, `${c.status} ${c.value}`);
  });
  return getGoal(s, c.goalId);
}

const DraftSchema = z.object({ status: z.enum(CHECKIN_STATUS), note: z.string().trim().min(1).max(2000) });
export type CheckinDraft = { status: typeof CHECKIN_STATUS[number]; note: string; source: string; saved: false };

/** Expected progress if the goal moved linearly from creation to its due date. */
function expected(g: Goal, now: Date) {
  if (!g.due) return null;
  const a = Date.parse(g.createdAt), b = Date.parse(`${g.due}T23:59:59Z`);
  return b <= a ? 100 : Math.round(Math.min(1, Math.max(0, (now.getTime() - a) / (b - a))) * 100);
}
export function ruleDraft(g: Goal, now = new Date()): CheckinDraft {
  const exp = expected(g, now); const gap = exp === null ? 0 : exp - g.progress;
  const status = gap > 25 ? 'off_track' : gap > 10 ? 'at_risk' : 'on_track';
  const done = g.projects.filter((p) => p.done).length;
  return { status, source: 'rule', saved: false, note: `${g.title}: ${g.current}${g.unit} of ${g.target}${g.unit} (${g.progress}%)${exp === null ? '' : `, ${exp}% expected by now`}. Projects: ${done}/${g.projects.length} done.` };
}
/** Files a Muse Spark check-in draft as an InferenceStore task. It costs nothing until it is approved in the Jev inference queue. */
export function requestModelDraft(s: BusinessStore, goalId: string, opts: { env?: Env; lane?: 'meta' | 'baseten'; paidConsent?: boolean } = {}) {
  const g = getGoal(s, goalId); const base = ruleDraft(g);
  const facts = JSON.stringify({ goal: g.title, unit: g.unit, start: g.start, target: g.target, current: g.current, due: g.due, progressPct: g.progress, ruleAssessment: base.status, projects: g.projects.map((p) => ({ title: p.title, done: !!p.done })), recentCheckins: g.checkins.slice(0, 3).map((c) => ({ status: c.status, note: c.note })) });
  return new InferenceStore(s, () => routes(opts.env ?? runtimeEnv())).create({ title: `Check-in draft: ${g.title.slice(0, 120)}`, prompt: `Draft a short weekly goal check-in for a small business owner using only these facts; do not invent numbers. Return exactly {"status":"on_track|at_risk|off_track","note":"..."}, no markdown. Facts: ${facts}`, kind: 'draft', lane: opts.lane ?? 'meta', maxTokens: 512, paidConsent: !!opts.paidConsent });
}
/** Reads a completed, approved draft. It is returned for human editing and never saved. */
export function readModelDraft(s: BusinessStore, taskId: string, opts: { env?: Env } = {}): CheckinDraft {
  const t = new InferenceStore(s, () => routes(opts.env ?? runtimeEnv())).task(taskId);
  if (t.state !== 'completed' || t.approvedHash !== t.hash || fingerprint(t.payload) !== t.hash || !t.output || fingerprint(t.output) !== t.outputHash) throw new BusinessError('An approved, completed draft with intact evidence is required', 409);
  let d; try { d = DraftSchema.strict().parse(JSON.parse(t.output)); } catch { throw new BusinessError('Draft was not exactly the expected JSON; nothing saved', 422); }
  return { ...d, source: t.payload.model, saved: false };
}
