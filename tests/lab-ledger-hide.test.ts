import { describe, expect, test } from 'vitest';
import type { LabEval } from '@/lib/schemas';
import { hideReason, hideReasonFor, isShown, recordLine, verdictFor } from '@/lib/lab/ledger/hide';
import { predictorDef } from '@/lib/lab/ledger/predictors';
import { memStore } from './helpers/lab-ledger-world';

/** 06 8.2 verdict table, each row with a constructed eval (AC-06-25). */
const ev = (o: Partial<LabEval> = {}): LabEval => ({
  predictor: 'sh_24h', predictorVersion: 'sh-1', scope: 'backtest', population: 'all', platform: 'all', windowWeeks: 12, computedDate: '2026-10-11', computedAt: '2026-10-11T03:30:00.000Z', harnessVersion: 'h-1',
  origins: 26, nPosts: 30, nCreators: 5, abstained: 0, nPairs: 60,
  pairwise: 0.6, pairwiseLo: 0.55, pairwiseHi: 0.65, spearman: 0.3, spearmanLo: 0.1, spearmanHi: 0.5,
  logMae: 0.17, logMaeBaseline: 0.29, maeDeltaLo: 0.05, maeDeltaHi: 0.2, coverage: 0.8, coverageLo: 0.62, coverageHi: 0.91, coverageN: 20,
  prAuc: 0.6, prAucLo: 0.45, prAucHi: 0.75, baseRate: 0.3, positives: 9, bandHits: {}, verdictForecast: null, verdictRanking: null, verdictClassifier: null, dry: false, ...o,
});

describe('verdicts (06 8.2, AC-06-25)', () => {
  test('forecast', () => {
    expect(verdictFor(ev({ nPosts: 19 }), 'forecast')).toBe('not_enough');
    expect(verdictFor(ev(), 'forecast')).toBe('beats');
    expect(verdictFor(ev({ coverage: 0.95 }), 'forecast')).toBe('at_chance'); // intervals exist but miscalibrated
    expect(verdictFor(ev({ coverage: null }), 'forecast')).toBe('beats'); // no intervals: only the paired MAE bound
    expect(verdictFor(ev({ maeDeltaLo: -0.1, maeDeltaHi: -0.01 }), 'forecast')).toBe('worse');
    expect(verdictFor(ev({ maeDeltaLo: -0.1, maeDeltaHi: 0.1 }), 'forecast')).toBe('at_chance');
  });
  test('ranking', () => {
    expect(verdictFor(ev({ nPairs: 29 }), 'ranking')).toBe('not_enough');
    expect(verdictFor(ev({ nPosts: 19 }), 'ranking')).toBe('not_enough');
    expect(verdictFor(ev(), 'ranking')).toBe('beats');
    expect(verdictFor(ev({ spearmanLo: -0.1 }), 'ranking')).toBe('at_chance');
    expect(verdictFor(ev({ pairwiseLo: 0.3, pairwiseHi: 0.49 }), 'ranking')).toBe('worse');
  });
  test('classifier', () => {
    expect(verdictFor(ev({ positives: 4 }), 'classifier')).toBe('not_enough');
    expect(verdictFor(ev({ prAucLo: 0.35 }), 'classifier')).toBe('beats');
    expect(verdictFor(ev({ prAucLo: 0.1, prAucHi: 0.25 }), 'classifier')).toBe('worse');
    expect(verdictFor(ev({ prAucLo: 0.2 }), 'classifier')).toBe('at_chance');
  });
  test('pairwise (judge)', () => {
    expect(verdictFor(ev({ nPosts: 19 }), 'pairwise')).toBe('not_enough');
    expect(verdictFor(ev({ pairwiseLo: 0.51 }), 'pairwise')).toBe('beats');
    expect(verdictFor(ev({ pairwiseHi: 0.49, pairwiseLo: 0.3 }), 'pairwise')).toBe('worse');
    expect(verdictFor(ev({ pairwiseLo: 0.4 }), 'pairwise')).toBe('at_chance');
  });
});

describe('hide rule and copy (06 8.3, 8.4)', () => {
  test('the deciding eval: backtest for replayable, live otherwise; the platform row only with n 20', () => {
    const s = memStore();
    s.evals.upsert(ev({ platform: 'instagram', nPosts: 12, maeDeltaLo: -0.2, maeDeltaHi: -0.1 }));
    s.evals.upsert(ev());
    expect(isShown(s, 'sh_24h', 'instagram', 'forecast')).toBe(true); // instagram n 12 < 20: the `all` row decides
    s.evals.upsert(ev({ platform: 'instagram', nPosts: 25, maeDeltaLo: -0.2, maeDeltaHi: -0.1 }));
    expect(isShown(s, 'sh_24h', 'instagram', 'forecast')).toBe(false);
    expect(hideReason(s, 'sh_24h', 'instagram', 'forecast')).toBe('Hidden: 24-hour forecast has done worse than your normal (n 25).');
    // a live eval does not decide for a replayable predictor
    s.evals.upsert(ev({ predictor: 'sh_6h', scope: 'live' }));
    expect(isShown(s, 'sh_6h', 'all', 'forecast')).toBe(false);
    expect(hideReason(s, 'sh_6h', 'all', 'forecast')).toBe('Hidden: 6-hour forecast has not been graded yet.');
    expect(isShown(s, 'creator_median', 'all')).toBe(true); // the baseline is never hidden
  });

  test('every hide reason copy line', () => {
    const sh = predictorDef('sh_24h');
    expect(hideReasonFor(sh, ev({ nPosts: 9 }), 'not_enough', 'forecast')).toBe('Hidden: 24-hour forecast has 9 graded posts. It shows once it beats your normal on 20.');
    expect(hideReasonFor(sh, ev(), 'at_chance', 'forecast')).toBe('Hidden: 24-hour forecast is not yet better than your normal (off by x1.5 vs x1.9, n 30).');
    expect(hideReasonFor(predictorDef('brody'), ev({ pairwise: 0.53 }), 'at_chance', 'ranking')).toBe('Hidden: Your pick picks the better post 53% of the time, which is chance so far (n 30).');
    expect(hideReasonFor(sh, ev(), 'at_chance', 'classifier')).toBe('Hidden: 24-hour forecast finds breakouts no better than chance yet (0.60 vs 0.30, n 30).');
    expect(hideReasonFor(predictorDef('judge'), ev({ pairwise: 0.5, nPosts: 22 }), 'at_chance', 'pairwise')).toBe('Hidden: Hook judge picked the test winner 11 of 22 times, which is chance so far.');
    expect(hideReasonFor(sh, null, null, 'forecast')).toBe('Hidden: 24-hour forecast has not been graded yet.');
  });

  test('record lines; under n 5 "not enough yet"', () => {
    const s = memStore();
    s.evals.upsert(ev({ predictor: 'sh_24h' }));
    expect(recordLine(s, 'sh_24h', 'all', 'forecast')).toBe('24-hour forecast: typically off by x1.5 on 30 posts, 80% range held 16 of 20.');
    expect(recordLine(s, 'sh_24h', 'all', 'ranking')).toBe('24-hour forecast: picked the better post 60% of the time (30 posts, 12 weeks).');
    expect(recordLine(s, 'sh_24h', 'all', 'classifier')).toBe('24-hour forecast: finds breakouts at 0.60 against 0.30 by chance (30 posts).');
    s.evals.upsert(ev({ predictor: 'judge', scope: 'live', population: 'owned', nPosts: 22, pairwise: 14 / 22 }));
    expect(recordLine(s, 'judge', 'all')).toBe('Hook judge: picked the test winner 14 of 22 times.');
    s.evals.upsert(ev({ predictor: 'brody', scope: 'live', population: 'owned', nPosts: 4 }));
    expect(recordLine(s, 'brody', 'all')).toBe('not enough yet');
  });
});
