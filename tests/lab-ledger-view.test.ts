import { describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/lab/ledger/deps', async (importOriginal) => (await import('./helpers/lab-measure-ref')).withMeasureFallback(await importOriginal()));

import type { LabEval, LabPrediction } from '@/lib/schemas';
import { seedLabFixtures } from '@/lib/lab/fixtures';
import { draftPrediction, seal } from '@/lib/lab/ledger/freeze';
import { compact, ledgerLine, ledgerView, predictionChip, type MetricCell } from '@/lib/lab/ledger/view';
import { DAY, addPost, addSource, iso, memStore } from './helpers/lab-ledger-world';

const NOW = Date.parse('2026-10-11T12:00:00.000Z');

const ev = (o: Partial<LabEval>): LabEval => ({
  predictor: 'sh_24h', predictorVersion: 'sh-1', scope: 'backtest', population: 'all', platform: 'all', windowWeeks: 12, computedDate: '2026-10-11', computedAt: '2026-10-11T03:30:00.000Z', harnessVersion: 'h-1',
  origins: 26, nPosts: 41, nCreators: 5, abstained: 0, nPairs: 80, pairwise: 0.6, pairwiseLo: 0.55, pairwiseHi: 0.65, spearman: 0.3, spearmanLo: 0.1, spearmanHi: 0.5,
  logMae: 0.17, logMaeBaseline: 0.29, maeDeltaLo: 0.05, maeDeltaHi: 0.2, coverage: 0.8, coverageLo: 0.62, coverageHi: 0.91, coverageN: 20,
  prAuc: 0.6, prAucLo: 0.45, prAucHi: 0.75, baseRate: 0.3, positives: 9, bandHits: {}, verdictForecast: null, verdictRanking: null, verdictClassifier: null, dry: false, ...o,
});

/** n graded live brody rows (each on its own post) with outcomes; ratio rises with the score half the time. */
function brodyRows(n: number): LabPrediction[] {
  const bands = ['below', 'normal', 'above', 'breakout'] as const;
  return Array.from({ length: n }, (_, i) => {
    const band = bands[i % 4];
    const ratio = [0.5, 1, 2, 4][(i * 3) % 4];
    return {
      ...seal(draftPrediction({ id: `lpr-b${i}`, predictor: 'brody', predictorVersion: 'brody-1', kind: 'pre_post', asOf: iso(NOW - 20 * DAY), frozenAt: iso(NOW - 20 * DAY), postId: `bp${i}`, sourceId: 'own', platform: 'instagram', band, score: i % 4 })),
      status: 'graded' as const, outcomeRatio7d: ratio, outcomeViews7d: ratio * 10_000, outcomeBand: ratio < 0.75 ? 'below' : ratio < 1.5 ? 'normal' : ratio < 3 ? 'above' : 'breakout', hitBand: false, gradedAt: iso(NOW - DAY),
    } as LabPrediction;
  });
}
const withRows = (rows: LabPrediction[]) => {
  const s = memStore();
  for (const r of rows) s.predictions.insert(r);
  return s;
};

describe('ledgerLine (06 8.5, AC-06-28)', () => {
  test('n 0, n 3, n 9, n 25', () => {
    expect(ledgerLine(memStore(), new Date(NOW))).toBe('No predictions graded yet. Freeze one in Studio before you post.');
    expect(ledgerLine(withRows(brodyRows(3)), new Date(NOW))).toBe('Predictions this month: 3 graded, pairwise not enough yet');
    expect(ledgerLine(withRows(brodyRows(9)), new Date(NOW))).toMatch(/^Predictions this month: 9 graded, pairwise \d+% \(n 9, at chance until n 20\)$/);
    const s25 = withRows(brodyRows(25));
    expect(ledgerLine(s25, new Date(NOW))).toMatch(/^Predictions this month: 25 graded, pairwise \d+% \(n 25, at chance\)$/);
    s25.evals.upsert(ev({ predictor: 'brody', predictorVersion: 'brody-1', scope: 'live', population: 'owned' }));
    expect(ledgerLine(s25, new Date(NOW))).toMatch(/^Predictions this month: 25 graded, pairwise \d+% \(n 25, beats your normal\)$/);
  });
});

describe('predictionChip (06 13.1, AC-06-26)', () => {
  function chipWorld() {
    const s = memStore();
    addSource(s, 'own');
    addPost(s, { id: 'young', source: 'own', postedAt: NOW - 30 * 3_600_000 });
    s.predictions.insert(seal(draftPrediction({ id: 'lpr-sh', predictor: 'sh_24h', predictorVersion: 'sh-1', kind: 'early', asOf: iso(NOW - 6 * 3_600_000), frozenAt: iso(NOW), postId: 'young', sourceId: 'own', platform: 'instagram', refAgeH: 24, viewsPoint: 23_945, viewsLo: 15_820, viewsHi: 36_242, ratioPoint: 2.18, band: 'above', intervalLevel: 0.8 })));
    return s;
  }
  test('a hidden predictor shows its reason line and never a number', () => {
    const s = chipWorld();
    s.evals.upsert(ev({ nPosts: 9 }));
    const chip = predictionChip(s, { postId: 'young' });
    expect(chip.text).toBeNull();
    expect(chip.record).toBeNull();
    expect(chip.hiddenReason).toBe('Hidden: 24-hour forecast has 9 graded posts. It shows once it beats your normal on 20.');
    expect(JSON.stringify(chip)).not.toMatch(/\d{2}K|23,?945/);
  });
  test('a shown forecast carries its record line', () => {
    const s = chipWorld();
    s.evals.upsert(ev({}));
    expect(predictionChip(s, { postId: 'young' })).toEqual({
      text: 'Projected 7-day: 24K (80% range 16K to 36K).',
      record: '24-hour forecast: typically off by x1.5 on 41 posts, 80% range held 16 of 20.',
      hiddenReason: null,
    });
  });
  test('compact numbers', () => {
    expect([compact(950), compact(1_234), compact(23_945), compact(1_250_000), compact(12_500_000)]).toEqual(['950', '1.2K', '24K', '1.3M', '13M']);
  });
});

describe('ledgerView (06 13)', () => {
  test('empty on a blank store: hero n 0 copy, every predictor listed, nothing graded', () => {
    const v = ledgerView(memStore(), { now: new Date(NOW) });
    expect(v.state).toBe('empty');
    expect(v.hero.sentence).toBe('Nothing graded yet. Freeze a prediction before your next post and it is graded 7 days later.');
    expect(v.predictors.map((p) => p.id)).toEqual(['creator_median', 'brody', 'sh_6h', 'sh_24h', 'mv_6h', 'mv_24h', 'comment_intent', 'judge']);
    expect(v.predictors.every((p) => p.record === 'not enough yet')).toBe(true);
    expect(v.planner).toBeNull();
    expect(v.plannerGate).toEqual({ n: 0, need: 20 });
    expect(v.retention.youtube.state).toBe('not_configured');
    expect(v.forecastRecord.n).toEqual({ runCost: 0, month: 0, gates: 0 });
  });

  test('collecting, then live; the hero speaks in n', () => {
    const c = ledgerView(withRows(brodyRows(3)), { now: new Date(NOW) });
    expect(c.state).toBe('collecting');
    expect(c.hero.sentence).toBe('3 graded so far. Not enough yet to say whether the Lab, or you, call it right.');
    const l = ledgerView(withRows(brodyRows(9)), { now: new Date(NOW) });
    expect(l.state).toBe('live');
    expect(l.hero.sentence).toMatch(/^When you said .+, it landed there \d+ of \d+ times \(n 9, at chance until n 20\)\.$/);
    expect(l.hero.reliability.map((b) => b.band)).toEqual(['below', 'normal', 'above', 'breakout']);
  });

  test('AC-06-27 every metric under n 5 shows "not enough yet"', () => {
    const s = memStore();
    for (const p of ['creator_median', 'sh_6h', 'sh_24h']) s.evals.upsert(ev({ predictor: p, predictorVersion: p === 'creator_median' ? 'cm-1' : 'sh-1', nPosts: 4, coverageN: 4 }));
    for (const p of ['brody', 'judge']) s.evals.upsert(ev({ predictor: p, predictorVersion: p === 'brody' ? 'brody-1' : 'judge-v1', scope: 'live', population: 'owned', nPosts: 4, coverageN: 0 }));
    const v = ledgerView(s, { now: new Date(NOW) });
    const cells = v.predictors.flatMap((p) => [p.pairwise, p.spearman, p.logMae, p.coverage, p.prAuc]).filter((c): c is MetricCell => c !== null);
    expect(cells.length).toBeGreaterThan(5);
    for (const c of cells) {
      expect(c.enough).toBe(false);
      expect(c.display).toBe('not enough yet');
    }
  });

  test('the fixture world: dry, sample and filming states build, seals hold, no dash or emoji in any string', () => {
    const s = memStore();
    seedLabFixtures(s, new Date(NOW));
    for (const mode of [{ dry: true }, { sample: true }, { filming: true }] as const) {
      const v = ledgerView(s, { now: new Date(NOW), ...mode });
      expect(v.state).toBe(Object.keys(mode)[0]);
      expect(v.predictions.length).toBe(50);
      expect(v.predictions.every((p) => p.sealOk)).toBe(true);
      expect(v.tests.length).toBeGreaterThan(3);
      const json = JSON.stringify(v);
      expect(json).not.toMatch(/[–—]/);
      expect(json).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(json).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    }
    const v = ledgerView(s, { now: new Date(NOW), dry: true });
    // the fixture evals: sh_6h beats, comment_intent is worse; a hidden card carries its reason and the baseline is never hidden
    expect(v.predictors.find((p) => p.id === 'sh_6h')).toMatchObject({ shown: true, hiddenReason: null });
    expect(v.predictors.find((p) => p.id === 'comment_intent')!.hiddenReason).toMatch(/^Hidden: Comment requests/);
    expect(v.predictors.find((p) => p.id === 'creator_median')!.shown).toBe(true);
    expect(v.retention.youtube.state).toBe('dry');
    const win = v.tests.find((t) => t.id === 'fx-test-1')!;
    expect(win.resultLabel).toBe('Winner: Hook A');
    expect(win.confirms).toBe('Confirms the Playbook: results first');
    expect(v.tests.find((t) => t.id === 'fx-test-2')!.resultLabel).toBe('Inconclusive');
  });
});
