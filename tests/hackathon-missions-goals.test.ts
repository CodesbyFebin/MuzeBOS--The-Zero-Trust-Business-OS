import { describe, it, expect, afterEach } from 'vitest';
import { BusinessStore } from '../lib/muzebos/store';
import { createMission, advanceMission, adoptLeadPlan, parseLeadPlan, rulePlan, listMissions } from '../lib/muzebos/ai/lead';
import { createGoal, addProject, toggleProject, addCheckin, ruleDraft, progressOf, requestModelDraft, readModelDraft, listGoals } from '../lib/muzebos/goals';
import { InferenceStore } from '../lib/muzebos/inference/store';
import { routes } from '../lib/muzebos/inference/routing';
import { runServerOnce } from '../lib/muzebos/inference/providers';
import { WorkflowEngine } from '../lib/muzebos/workflows';

// Injected protocol fixtures only; no live inference.
const env = { META_MODEL_API_KEY: 'fixture', MUZEBOS_INFERENCE_PAID: '1', MUZEBOS_META_MODEL: 'muse-wonder-1.0' };
const opened: BusinessStore[] = [];
const fresh = () => { const b = new BusinessStore(':memory:'); opened.push(b); return b; };
afterEach(() => opened.splice(0).forEach((b) => b.close()));
const reply = (content: string) => (async () => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }))) as unknown as typeof fetch;
const approveAndRun = async (b: BusinessStore, id: string, out: string) => { const s = new InferenceStore(b, () => routes(env)); const t = s.task(id); s.approve(t.id, t.hash); await runServerOnce(s, 'test', env, reply(out)); return s.task(id); };

describe('lead/worker missions (Jev-gated, no direct model calls)', () => {
  it('validates lead plans strictly', () => {
    expect(parseLeadPlan('{"subtasks":[{"text":"do a","role":"finance","dependsOn":[0]}]}').ok).toBe(false);
    expect(parseLeadPlan('{"subtasks":[{"text":"do a","role":"hacker"}]}').ok).toBe(false);
    expect(parseLeadPlan('```json\n{"subtasks":[]}\n```').ok).toBe(false);
    const ok = parseLeadPlan('{"subtasks":[{"text":"count stock","role":"inventory"},{"text":"remind me to reorder","role":"operations","dependsOn":[0,0]}]}');
    expect(ok.ok && ok.plan[1].dependsOn).toEqual([0]);
    expect(rulePlan('Check stock then remind me to reorder').some((p) => p.dependsOn.length)).toBe(true);
  });
  it('creating a mission files drafts only: no model call, no business write', () => {
    const b = fresh();
    const m = createMission(b, 'Remind me to call the supplier tomorrow', { env });
    expect(m.leadTaskId).toBeTruthy(); expect(m.planner).toBe('rule');
    const s = new InferenceStore(b, () => routes(env));
    expect(s.task(m.leadTaskId!).state).toBe('awaiting_approval');
    expect(m.tasks.filter((t) => t.wantsWrite).every((t) => t.status === 'awaiting_inference')).toBe(true);
    expect(new WorkflowEngine(b).runs()).toHaveLength(0);
    expect(listMissions(b)).toHaveLength(1);
  });
  it('approved worker output becomes a second-gate Jev proposal; a dependant then wakes', async () => {
    const b = fresh();
    const m = createMission(b, 'Remind me to pay rent then remind me to file the receipt', { env, paidConsent: true });
    const [first, second] = m.tasks; expect(second.status).toBe('blocked');
    await approveAndRun(b, first.inferenceId!, '{"tool":"reminders.create","args":{"title":"Pay rent"}}');
    const after = advanceMission(b, m.id, { env });
    expect(after.tasks[0].status).toBe('proposed'); expect(after.tasks[0].runId).toBeTruthy();
    expect(after.tasks[1].status).toBe('awaiting_inference');
    expect(new WorkflowEngine(b).runs()[0].status).toBe('awaiting_approval');
    expect(b.db.prepare('SELECT COUNT(*) n FROM mb_reminders').get()).toEqual({ n: 0 });
  });
  it('a bad worker output fails the task and cancels its dependant', async () => {
    const b = fresh();
    const m = createMission(b, 'Remind me to pay rent then remind me to file the receipt', { env, paidConsent: true });
    await approveAndRun(b, m.tasks[0].inferenceId!, 'Sure! I will set that up.');
    expect(advanceMission(b, m.id, { env }).tasks.map((t) => t.status)).toEqual(['failed', 'cancelled']);
  });
  it('adopts an approved Muse Wonder plan only before workers start', async () => {
    const b = fresh();
    const m = createMission(b, 'Handle low stock', { env, paidConsent: true });
    expect(() => adoptLeadPlan(b, m.id, { env })).toThrow(/approved, completed/);
    await approveAndRun(b, m.leadTaskId!, '{"subtasks":[{"text":"check low stock","role":"inventory"},{"text":"remind me to reorder low stock","role":"operations","dependsOn":[0]}]}');
    const adopted = adoptLeadPlan(b, m.id, { env });
    expect(adopted.planner).toBe('muse-wonder-1.0');
    expect(adopted.tasks.map((t) => t.status)).toEqual(['done', 'awaiting_inference']);
  });
});

describe('goals, projects and check-ins', () => {
  it('tracks progress, projects and human check-ins', () => {
    const b = fresh();
    const g = createGoal(b, { title: 'Monthly orders', start: 100, target: 200 });
    const p = addProject(b, { goalId: g.id, title: 'Launch referral offer' }).projects[0];
    expect(toggleProject(b, p.id).projects[0].done).toBe(1);
    const after = addCheckin(b, { goalId: g.id, status: 'on_track', value: 150, note: 'Halfway' });
    expect(after.progress).toBe(50); expect(after.checkins).toHaveLength(1);
    expect(progressOf(10, 0, 5)).toBe(50);
    expect(() => createGoal(b, { title: 'bad', start: 1, target: 1 })).toThrow();
    expect(() => addCheckin(b, { goalId: 'nope', status: 'on_track', value: 1, note: 'x' })).toThrow(/not found/);
  });
  it('rule draft flags a goal that lags its schedule', () => {
    const b = fresh();
    const g = createGoal(b, { title: 'Revenue', unit: 'k', start: 0, target: 10, due: '2099-01-01' });
    expect(ruleDraft(g, new Date('2098-12-01T00:00:00Z')).status).toBe('off_track');
    expect(ruleDraft(g, new Date(g.createdAt)).status).toBe('on_track');
  });
  it('Muse Spark check-in draft is gated, strictly parsed, and never saved', async () => {
    const b = fresh();
    const g = createGoal(b, { title: 'Orders', start: 0, target: 10 });
    const t = requestModelDraft(b, g.id, { env, paidConsent: true });
    expect(() => readModelDraft(b, t.id, { env })).toThrow(/approved/);
    await approveAndRun(b, t.id, '{"status":"at_risk","note":"0 of 10 so far."}');
    expect(readModelDraft(b, t.id, { env })).toMatchObject({ status: 'at_risk', saved: false });
    expect(listGoals(b)[0].checkins).toHaveLength(0);
    const bad = requestModelDraft(b, g.id, { env, paidConsent: true });
    await approveAndRun(b, bad.id, '{"status":"great"}');
    expect(() => readModelDraft(b, bad.id, { env })).toThrow(/expected JSON/);
  });
});
