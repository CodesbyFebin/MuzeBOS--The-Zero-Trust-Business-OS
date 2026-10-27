import { describe, it, expect } from 'vitest';
import { BusinessStore } from '../lib/muzebos/store';
import { createMission, runMission, parseLeadPlan, listMissions } from '../lib/muzebos/ai/lead';
import { createGoal, addProject, toggleProject, addCheckin, draftCheckin, listGoals, ruleDraft, progressOf } from '../lib/muzebos/goals';
import { queue } from '../lib/muzebos/ai/jev';

const reply = (content: string) => new Response(JSON.stringify({ model: 'x', choices: [{ message: { content } }], usage: {} }), { status: 200, headers: { 'content-type': 'application/json' } });
const env = { META_MODEL_API_KEY: 'test' };

describe('lead/worker missions', () => {
  it('rejects plans with forward or self dependencies and bad roles', () => {
    expect(parseLeadPlan('{"subtasks":[{"text":"do a","role":"finance","dependsOn":[0]}]}').ok).toBe(false);
    expect(parseLeadPlan('{"subtasks":[{"text":"do a","role":"hacker","dependsOn":[]}]}').ok).toBe(false);
    expect(parseLeadPlan('no json').ok).toBe(false);
    const ok = parseLeadPlan('{"subtasks":[{"text":"count stock","role":"inventory"},{"text":"remind me to reorder","role":"operations","dependsOn":[0,0]}]}');
    expect(ok.ok && ok.plan[1].dependsOn).toEqual([0]);
  });
  it('rule mode plans and runs without a key; writes go to Jev only', async () => {
    const s = new BusinessStore(':memory:');
    const m = await createMission(s, 'Remind me to call the supplier tomorrow', { env: {} });
    expect(m.planner).toBe('rule');
    const done = await runMission(s, m.id, { env: {} });
    expect(done.tasks.every((t) => ['proposed', 'done'].includes(t.status))).toBe(true);
    expect(queue(s).filter((r) => r.status === 'awaiting_approval').length).toBe(done.tasks.filter((t) => t.status === 'proposed').length);
    expect(listMissions(s)).toHaveLength(1);
  });
  it('Muse Wonder leads, dependants wake after prerequisites, Muse Spark proposals hit Jev', async () => {
    const s = new BusinessStore(':memory:'); const models: string[] = [];
    const f = (async (_u: string, init: any) => {
      const b = JSON.parse(init.body); models.push(b.model);
      if (b.model === 'muse-wonder-1.0') return reply('{"subtasks":[{"text":"check low stock","role":"inventory","dependsOn":[]},{"text":"remind me to reorder low stock","role":"operations","dependsOn":[0]}]}');
      return reply('{"tool":"reminders.create","args":{"title":"Reorder low stock"},"rationale":"low stock"}');
    }) as unknown as typeof fetch;
    const m = await createMission(s, 'Handle low stock', { env, fetch: f });
    expect(m.planner).toBe('x'); expect(m.tasks[1].status).toBe('blocked');
    const r = await runMission(s, m.id, { env, fetch: f });
    expect(models[0]).toBe('muse-wonder-1.0');
    expect(r.tasks[1].status).toBe('proposed'); expect(r.tasks[1].runId).toBeTruthy();
    expect(s.db.prepare("SELECT COUNT(*) n FROM mb_reminders").get()).toEqual({ n: 0 });
  });
  it('a failed prerequisite cancels its dependant; a bad lead plan falls back to rules', async () => {
    const s = new BusinessStore(':memory:');
    const f = (async (_u: string, init: any) => {
      const b = JSON.parse(init.body);
      if (b.model === 'muse-wonder-1.0') return reply('{"subtasks":[{"text":"remind me to pay rent","role":"finance"},{"text":"remind me to file receipt","role":"finance","dependsOn":[0]}]}');
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const m = await createMission(s, 'rent', { env, fetch: f });
    const r = await runMission(s, m.id, { env, fetch: f });
    expect(r.tasks.map((t) => t.status)).toEqual(['failed', 'cancelled']);
    const bad = await createMission(s, 'Remind me to water plants', { env, fetch: (async () => reply('nope')) as any });
    expect(bad.planner).toBe('rule'); expect(bad.note).toMatch(/no JSON/);
  });
});

describe('goals, projects and check-ins', () => {
  it('tracks progress, projects and human check-ins', () => {
    const s = new BusinessStore(':memory:');
    const g = createGoal(s, { title: 'Monthly orders', unit: '', start: 100, target: 200 });
    expect(g.progress).toBe(0);
    const p = addProject(s, { goalId: g.id, title: 'Launch referral offer' }).projects[0];
    expect(toggleProject(s, p.id).projects[0].done).toBe(1);
    const after = addCheckin(s, { goalId: g.id, status: 'on_track', value: 150, note: 'Halfway' });
    expect(after.progress).toBe(50); expect(after.checkins).toHaveLength(1);
    expect(progressOf(10, 0, 5)).toBe(50);
    expect(() => createGoal(s, { title: 'bad', start: 1, target: 1 })).toThrow();
    expect(() => addCheckin(s, { goalId: 'nope', status: 'on_track', value: 1, note: 'x' })).toThrow(/not found/);
  });
  it('rule draft flags a goal that lags its schedule', () => {
    const s = new BusinessStore(':memory:');
    const g = createGoal(s, { title: 'Revenue', unit: 'k', start: 0, target: 10, due: '2099-01-01' });
    const far = new Date('2098-12-01T00:00:00Z');
    expect(ruleDraft(g, far).status).toBe('off_track');
    expect(ruleDraft(g, new Date(g.createdAt)).status).toBe('on_track');
  });
  it('Muse Spark drafts a check-in but never saves it; invalid output falls back', async () => {
    const s = new BusinessStore(':memory:');
    const g = createGoal(s, { title: 'Orders', start: 0, target: 10 });
    const d = await draftCheckin(s, g.id, { env, fetch: (async () => reply('{"status":"at_risk","note":"0 of 10 so far."}')) as any });
    expect(d).toMatchObject({ status: 'at_risk', saved: false });
    expect(listGoals(s)[0].checkins).toHaveLength(0);
    const fb = await draftCheckin(s, g.id, { env, fetch: (async () => reply('{"status":"great"}')) as any });
    expect(fb.source).toBe('rule'); expect(fb.note2).toMatch(/validation/);
  });
});
