import { beforeAll, describe, expect, test } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { LabTest, LabTestArm } from '@/lib/schemas';
import type { LabStore } from '@/lib/lab/store';
import { createTest, judgeTest, judgeTrialReels, observedSignOf, testMark } from '@/lib/lab/ledger/tests';
import { addPost, addSource, iso, memStore } from './helpers/lab-ledger-world';

const NOW = Date.parse('2026-10-11T12:00:00.000Z');
const m = (reach: number | null, shares: number | null): LabTestArm['metrics'] => ({ atAgeH: 72, reach, views: null, likes: null, shares, saved: null, follows: null, watchTimeSharePct: null, source: 'manual' });
const arm = (id: string, reach: number | null, shares: number | null, featureValue: string | null = null): LabTestArm => ({ id, label: `Hook ${id.toUpperCase()}`, variantText: `hook ${id}`, hookId: `h-${id}`, featureValue, postId: null, metrics: m(reach, shares), propensity: null });

describe('Trial Reels judging (06 10.3)', () => {
  test('AC-06-40 worked examples: winner A, then inconclusive', () => {
    const w = judgeTrialReels({ arms: [arm('a', 4200, 63), arm('b', 3900, 31)] });
    expect(w.result).toBe('winner');
    expect(w.winnerArm).toBe('a');
    expect(w.detail.lo as number).toBeCloseTo(0.00317, 5);
    const i = judgeTrialReels({ arms: [arm('a', 4000, 40), arm('b', 4100, 38)] });
    expect(i.result).toBe('inconclusive');
    expect(i.winnerArm).toBeNull();
  });

  test('performed the same when the whole interval sits inside 15% of the pooled rate', () => {
    expect(judgeTrialReels({ arms: [arm('a', 4_000_000, 40_000), arm('b', 4_000_000, 40_100)] }).result).toBe('performed_same');
  });

  test('AC-06-41 reach under 500 gives inconclusive with the reason', () => {
    const r = judgeTrialReels({ arms: [arm('a', 499, 30), arm('b', 4000, 10)] });
    expect(r.result).toBe('inconclusive');
    expect(r.detail.reason).toBe('reach under 500');
  });

  test('observed sign and confirms from featureKey', () => {
    const t = { featureKey: 'hook_form:results_first', arms: [arm('a', 1, 1, 'results_first'), arm('b', 1, 1, 'direct_question')] };
    expect(observedSignOf(t, 'winner', 'a')).toBe(1);
    expect(observedSignOf(t, 'winner', 'b')).toBe(-1);
    expect(observedSignOf(t, 'inconclusive', null)).toBeNull();
    const s = memStore();
    const created = createTest(s, { kind: 'trial_reels', title: 'Results first vs question', hypothesis: '', variable: 'hook', featureKey: 'hook_form:results_first', expectedSign: 1, platform: 'instagram', arms: [arm('a', 4200, 63, 'results_first'), arm('b', 3900, 31, 'direct_question')] }, { now: new Date(NOW), dry: false });
    const judged = judgeTest(s, created.id, new Date(NOW));
    expect(judged).toMatchObject({ status: 'done', result: 'winner', winnerArm: 'a', observedSign: 1, confirms: true });
  });

  test('arm metrics fill from Instagram retention within 12 h of the judge age', () => {
    const s = memStore();
    addSource(s, 'own');
    addPost(s, { id: 'ra', source: 'own', postedAt: NOW - 4 * 86_400_000 });
    addPost(s, { id: 'rb', source: 'own', postedAt: NOW - 4 * 86_400_000 });
    const base = { platform: 'instagram' as const, source: 'ig_graph' as const, capturedAt: iso(NOW), partial: false, curve: null, views: 5000, avgViewDurationS: null, avgViewPct: null, likes: 100, comments: 3, saved: 9, totalInteractions: 120, avgWatchTimeMs: 5000, totalWatchTimeMs: 1e7, skipRate: 40, raw: {}, dry: false };
    s.retention.add({ ...base, postId: 'ra', ageH: 70, reach: 4200, shares: 63 });
    s.retention.add({ ...base, postId: 'rb', ageH: 75, reach: 3900, shares: 31 });
    const t = createTest(s, { kind: 'trial_reels', title: 'Two hooks', hypothesis: '', variable: 'hook', platform: 'instagram', arms: [{ ...arm('a', null, null), postId: 'ra', metrics: undefined }, { ...arm('b', null, null), postId: 'rb', metrics: undefined }] }, { now: new Date(NOW), dry: false });
    const j = judgeTest(s, t.id, new Date(NOW));
    expect(j.arms.map((a) => a.metrics.source)).toEqual(['instagram_api', 'instagram_api']);
    expect(j.result).toBe('winner');
  });
});

describe('confirmed by test (06 10.6)', () => {
  const done = (id: string, kind: LabTest['kind'], result: LabTest['result'], observedSign: 1 | -1 | null, extra: Partial<LabTest> = {}): LabTest => ({
    id, kind, title: id, hypothesis: '', variable: 'hook', featureKey: 'hook_form:results_first', expectedSign: 1, scriptId: null, platform: 'instagram', status: 'done', arms: [arm('a', 1, 1)], judgeAgeH: 72,
    primaryMetric: 'shares_per_reach', result, winnerArm: result === 'winner' ? 'a' : null, observedSign, confirms: null, judgeDetail: {}, notes: '', planWeek: null, startedAt: iso(NOW), judgedAt: iso(NOW), createdAt: iso(NOW), updatedAt: iso(NOW), dry: false, ...extra,
  });
  test('AC-06-44 the mark table; self-experiments, dry and unfinished tests never count', () => {
    const s = memStore();
    expect(testMark(s, 'hook_form:results_first', 1)).toMatchObject({ mark: 'correlation', label: 'correlation' });
    s.tests.create(done('se', 'self_experiment', 'winner', 1));
    s.tests.create(done('dry', 'trial_reels', 'winner', 1, { dry: true }));
    s.tests.create(done('run', 'trial_reels', null, null, { status: 'running' }));
    expect(testMark(s, 'hook_form:results_first', 1).mark).toBe('correlation');
    s.tests.create(done('i1', 'trial_reels', 'inconclusive', null));
    s.tests.create(done('p1', 'yt_test_compare', 'performed_same', null));
    expect(testMark(s, 'hook_form:results_first', 1)).toMatchObject({ mark: 'tested_inconclusive', inconclusive: 2, label: 'tested, no clear winner (2)' });
    s.tests.create(done('w1', 'trial_reels', 'winner', 1));
    expect(testMark(s, 'hook_form:results_first', 1)).toMatchObject({ mark: 'confirmed', agree: 1, disagree: 0, label: 'confirmed by test (1 of 1)' });
    s.tests.create(done('w2', 'trial_reels', 'winner', -1));
    s.tests.create(done('w3', 'yt_test_compare', 'winner', -1));
    expect(testMark(s, 'hook_form:results_first', 1)).toMatchObject({ mark: 'contradicted', agree: 1, disagree: 2, label: 'contradicted by test (2 of 3)' });
    expect(testMark(s, 'hook_form:results_first', -1)).toMatchObject({ mark: 'confirmed', label: 'confirmed by test (2 of 3)' });
  });
});

describe('test API (06 10.7)', () => {
  let store: LabStore;
  let routes: { create: (r: Request) => Promise<Response>; patch: (r: Request, c: { params: { id: string } }) => Promise<Response>; judge: (r: Request, c: { params: { id: string } }) => Promise<Response> };
  beforeAll(async () => {
    process.env.GLADOS_DB = path.join(mkdtempSync(path.join(tmpdir(), 'glados-ledger-tests-')), 'test.db');
    process.env.GLADOS_MODE_FILE = path.join(tmpdir(), 'no-such-mode-file');
    store = (await import('@/lib/data')).getDb().lab;
    addSource(store, 'yt', { platform: 'youtube' });
    addPost(store, { id: 'short1', source: 'yt', platform: 'youtube', contentType: 'short', postedAt: NOW - 86_400_000 });
    addPost(store, { id: 'long1', source: 'yt', platform: 'youtube', contentType: 'video', postedAt: NOW - 86_400_000 });
    const t = await import('@/app/api/lab/tests/route');
    const one = await import('@/app/api/lab/tests/[id]/route');
    const j = await import('@/app/api/lab/tests/[id]/judge/route');
    routes = { create: t.POST as never, patch: one.PATCH as never, judge: j.POST as never };
  });
  const req = (url: string, method: string, b: unknown) => new Request(`http://localhost${url}`, { method, body: JSON.stringify(b) });
  const yt = (postId: string) => ({ kind: 'yt_test_compare', title: 'Title test', hypothesis: '', variable: 'title', platform: 'youtube', arms: [{ id: 'a', variantText: 'Title A', postId }, { id: 'b', variantText: 'Title B', postId }] });

  test('AC-06-42 yt_test_compare on a Short answers 400 "YouTube cannot test Shorts."', async () => {
    const res = await routes.create(req('/api/lab/tests', 'POST', yt('short1')));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('YouTube cannot test Shorts.');
    expect((await routes.create(req('/api/lab/tests', 'POST', yt('long1')))).status).toBe(201);
  });

  test('a trial_reels test needs 2 or 3 arms', async () => {
    const res = await routes.create(req('/api/lab/tests', 'POST', { kind: 'trial_reels', title: 'One', hypothesis: '', variable: 'hook', platform: 'instagram', arms: [{ id: 'a', variantText: 'x' }] }));
    expect(res.status).toBe(400);
  });

  test('AC-06-43 editing a variant of a running test answers 409; metrics and the manual YouTube result are fine', async () => {
    const created = await (await routes.create(req('/api/lab/tests', 'POST', yt('long1')))).json();
    const id = created.test.id as string;
    expect(created.test.status).toBe('running');
    const bad = await routes.patch(req(`/api/lab/tests/${id}`, 'PATCH', { arms: [{ id: 'a', variantText: 'A new title' }] }), { params: { id } });
    expect(bad.status).toBe(409);
    expect((await bad.json()).error).toBe('Changing a variant mid-test stops it. Start a new test.');
    const ok = await routes.patch(req(`/api/lab/tests/${id}`, 'PATCH', { arms: [{ id: 'a', metrics: { watchTimeSharePct: 41 } }], result: 'winner', winnerArm: 'b' }), { params: { id } });
    expect(ok.status).toBe(200);
    expect((await ok.json()).test).toMatchObject({ status: 'done', result: 'winner', winnerArm: 'b' });
    expect((await routes.judge(req(`/api/lab/tests/${id}/judge`, 'POST', {}), { params: { id } })).status).toBe(400); // trial_reels only
    const stop = await routes.patch(req(`/api/lab/tests/${id}`, 'PATCH', { status: 'abandoned' }), { params: { id } });
    expect((await stop.json()).test.status).toBe('abandoned');
  });
});
