import { describe, expect, test, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

vi.mock('@/lib/lab/ledger/deps', async (importOriginal) => (await import('./helpers/lab-measure-ref')).withMeasureFallback(await importOriginal()));

import { asOfView } from '@/lib/lab/measure/asof';
import { bandOf, gradeDue, gradePairwiseDue, ledgerBaseline, viewsAtAge } from '@/lib/lab/ledger/outcome';
import { draftPrediction, recordJudgeVerdict, seal } from '@/lib/lab/ledger/freeze';
import { DAY, H, addHistory, addPost, addSource, iso, memStore } from './helpers/lab-ledger-world';
import type { LabTest } from '@/lib/schemas';

const NOW = Date.parse('2026-10-11T12:00:00.000Z');

function frozenRow(store: ReturnType<typeof memStore>, postId: string, extra: Record<string, unknown> = {}) {
  const row = seal(draftPrediction({ id: `lpr-${postId}`, predictor: 'brody', predictorVersion: 'brody-1', kind: 'pre_post', asOf: iso(NOW - 30 * DAY), frozenAt: iso(NOW - 30 * DAY), postId, sourceId: 'own', platform: 'instagram', band: 'above', score: 2, baseline7dViews: 20_000, ...extra }));
  store.predictions.insert(row);
  return row;
}

describe('views at an exact age (06 4.1)', () => {
  test('AC-06-8 150 h 40,000 and 190 h 52,000 give 45,361 at 168 h, interpolated', () => {
    const s = memStore();
    addSource(s, 'own');
    const p = addPost(s, { id: 'p1', source: 'own', postedAt: NOW - 20 * DAY, reads: { 150: 40_000, 190: 52_000 } });
    const v = viewsAtAge(asOfView(s, iso(NOW)), p, 168)!;
    expect(Math.abs(v.views - 45_361)).toBeLessThanOrEqual(1);
    expect(v.how).toBe('interpolated');
  });

  test('AC-06-8 the ledger defines no tolerance of its own (no AGE_TOL under lib/lab/ledger)', () => {
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : [path.join(d, f)]));
    for (const f of walk(path.join(process.cwd(), 'lib/lab/ledger'))) expect(readFileSync(f, 'utf8'), f).not.toMatch(/AGE_TOL/);
  });
});

describe('bands (06 2.1)', () => {
  test('AC-06-10', () => {
    expect(bandOf(0.74)).toBe('below');
    expect(bandOf(0.75)).toBe('normal');
    expect(bandOf(1.5)).toBe('above');
    expect(bandOf(3)).toBe('breakout');
  });
});

describe('gradeDue (06 4.2)', () => {
  test('AC-06-9 not due before 180 h', () => {
    const s = memStore();
    addSource(s, 'own');
    addPost(s, { id: 'p1', source: 'own', postedAt: NOW - 179 * H, reads: { 150: 40_000, 175: 50_000 } });
    frozenRow(s, 'p1');
    expect(gradeDue(s, new Date(NOW)).graded).toBe(0);
    expect(gradeDue(s, new Date(NOW + 2 * H)).graded).toBe(1);
    const g = s.predictions.get('lpr-p1')!;
    expect(g.status).toBe('graded');
    expect(g.outcomeMethod).toBe('interpolated');
    expect(g.outcomeRatio7d).toBeCloseTo(g.outcomeViews7d! / 20_000, 10);
  });

  test('AC-06-9 a nearest read is not accepted before 210 h, then is', () => {
    const s = memStore();
    addSource(s, 'own');
    addPost(s, { id: 'p1', source: 'own', postedAt: NOW - 200 * H, reads: { 24: 9_000, 190: 50_000 } }); // 190/24 > 3: no bracket; 190 is within 42 h of 168
    frozenRow(s, 'p1');
    expect(gradeDue(s, new Date(NOW)).graded).toBe(0);
    expect(s.predictions.get('lpr-p1')!.status).toBe('frozen');
    expect(gradeDue(s, new Date(NOW + 11 * H)).graded).toBe(1);
    expect(s.predictions.get('lpr-p1')!.outcomeMethod).toBe('nearest');
  });

  test('AC-06-9 ungradable after 336 h with no usable read', () => {
    const s = memStore();
    addSource(s, 'own');
    addPost(s, { id: 'p1', source: 'own', postedAt: NOW - 300 * H, reads: { 24: 9_000 } });
    frozenRow(s, 'p1');
    expect(gradeDue(s, new Date(NOW)).ungradable).toBe(0);
    const r = gradeDue(s, new Date(NOW + 40 * H));
    expect(r.ungradable).toBe(1);
    expect(s.predictions.get('lpr-p1')!.status).toBe('ungradable');
    expect(r.run?.kind).toBe('grade');
  });

  test('late rows are never graded', () => {
    const s = memStore();
    addSource(s, 'own');
    addPost(s, { id: 'p1', source: 'own', postedAt: NOW - 20 * DAY, reads: { 150: 40_000, 190: 52_000 } });
    frozenRow(s, 'p1', { late: true });
    expect(gradeDue(s, new Date(NOW)).graded).toBe(0);
  });
});

describe('ledgerBaseline (06 4.3)', () => {
  test('AC-06-34 an Instagram reel baseline ignores same-creator carousels and other-format dissections', () => {
    const s = memStore();
    addSource(s, 'own');
    const T = NOW;
    addHistory(s, 'own', T, [10_000, 12_000, 9_000, 11_000, 13_000, 10_500]);
    const target = { sourceId: 'own', platform: 'instagram' as const, contentType: 'reel', postedAt: iso(T) };
    const before = ledgerBaseline(asOfView(s, iso(T)), target)!;
    addHistory(s, 'own', T, [900_000, 800_000, 950_000], { contentType: 'carousel', prefix: 'car' });
    // a reel dissected as another format stays in the cell (the format is never part of the key)
    s.dissections.upsert({ postId: 'own-h0', format: 'carousel', hookForm: 'results_first', emotionalTrigger: 'curiosity', hookChannel: 'spoken', hookText: '', firstFrameText: '', structureType: 'tutorial', beats: [], pacing: 'punchy', pillar: 'educational', ctaType: 'none', tension: null, confidences: {}, qualityNotes: '', modelId: 'x', promptVersion: 'x', analysedAt: iso(T) });
    const after = ledgerBaseline(asOfView(s, iso(T)), target)!;
    expect(after.views).toBeCloseTo(before.views, 6);
    expect(after.n).toBe(6);
  });

  test('under 5 values it returns null (the caller abstains)', () => {
    const s = memStore();
    addSource(s, 'own');
    addHistory(s, 'own', NOW, [10_000, 12_000, 9_000, 11_000]);
    expect(ledgerBaseline(asOfView(s, iso(NOW)), { sourceId: 'own', platform: 'instagram', contentType: 'reel', postedAt: iso(NOW) })).toBeNull();
  });

  test('AC-06-34 the backtest path fits from asOfView data only (no stored eb prior is read)', () => {
    const src = readFileSync(path.join(process.cwd(), 'lib/lab/ledger/outcome.ts'), 'utf8');
    // the stored fit is read only on the live branch, which needs both a store and now
    expect(src).toMatch(/const live = opts\.store && opts\.now/);
    expect(src).toMatch(/fitEb\(cells/);
  });
});

describe('pairwise grading (06 4.4)', () => {
  const trial = (id: string, result: LabTest['result'], winnerArm: string | null): LabTest => ({
    id, kind: 'trial_reels', title: 'Hook test', hypothesis: '', variable: 'hook', featureKey: null, expectedSign: null, scriptId: 'sc1', platform: 'instagram', status: 'done',
    arms: (['a', 'b'] as const).map((a) => ({ id: a, label: a, variantText: a, hookId: `h-${a}`, featureValue: null, postId: null, metrics: { atAgeH: 72, reach: 4000, views: null, likes: null, shares: 40, saved: null, follows: null, watchTimeSharePct: null, source: 'manual' as const }, propensity: null })),
    judgeAgeH: 72, primaryMetric: 'shares_per_reach', result, winnerArm, observedSign: null, confirms: null, judgeDetail: {}, notes: '', planWeek: null, startedAt: iso(NOW), judgedAt: iso(NOW), createdAt: iso(NOW), updatedAt: iso(NOW), dry: false,
  });

  test('AC-06-31 judge winner = arm A hook gives pairRight; an inconclusive test makes it ungradable; abstained is ungradable at insert', () => {
    const s = memStore();
    const right = recordJudgeVerdict(s, { scriptId: 'sc1', aId: 'h-a', bId: 'h-b', winner: 'h-a', abstained: false, promptVersion: 'judge-v1', dry: false, now: new Date(NOW) });
    const abst = recordJudgeVerdict(s, { scriptId: 'sc2', aId: 'h-a', bId: 'h-b', winner: null, abstained: true, promptVersion: 'judge-v1', dry: false, now: new Date(NOW) });
    expect(abst.status).toBe('ungradable');
    expect(abst.note).toBe('abstained');
    // a second verdict for the same pair returns the existing row
    expect(recordJudgeVerdict(s, { scriptId: 'sc1', aId: 'h-b', bId: 'h-a', winner: 'h-b', abstained: false, promptVersion: 'judge-v1', dry: false, now: new Date(NOW) }).id).toBe(right.id);
    expect(gradePairwiseDue(s, new Date(NOW))).toBe(0); // no test yet: stays frozen
    s.tests.create(trial('t1', 'winner', 'a'));
    expect(gradePairwiseDue(s, new Date(NOW))).toBe(1);
    expect(s.predictions.get(right.id)).toMatchObject({ status: 'graded', pairRight: true, testId: 't1' });

    const s2 = memStore();
    const r2 = recordJudgeVerdict(s2, { scriptId: 'sc1', aId: 'h-a', bId: 'h-b', winner: 'h-a', abstained: false, promptVersion: 'judge-v1', dry: false, now: new Date(NOW) });
    s2.tests.create(trial('t2', 'inconclusive', null));
    gradePairwiseDue(s2, new Date(NOW));
    expect(s2.predictions.get(r2.id)).toMatchObject({ status: 'ungradable', testId: 't2', pairRight: null });
  });
});
