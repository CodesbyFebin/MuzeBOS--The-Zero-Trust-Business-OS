import { describe, expect, test } from 'vitest';
import { bootstrap, coverage, logMae, newcombe, pairwiseAccuracy, prAuc, spearmanWithin, typicalFactor, wilson90, type RankRow } from '@/lib/lab/ledger/metrics';

/** 06 section 5 worked examples (AC-06-11 to AC-06-17). */
const one = (s: number[], y: number[]): RankRow[] => s.map((x, i) => ({ creator: 'c1', s: x, y: y[i] }));
const S = [1, 2, 3, 4, 5, 6];
const Y = [0.1, 0.3, 0.2, 0.5, 0.4, 0.6];

describe('ledger metrics', () => {
  test('AC-06-11 pairwise accuracy 13 of 15', () => {
    const r = pairwiseAccuracy(one(S, Y))!;
    expect(r.pairs).toBe(15);
    expect(r.acc).toBeCloseTo(13 / 15, 10);
  });

  test('pairs only within a creator; outcome ties under 0.01 drop out', () => {
    const rows = [...one([1, 2], [0.1, 0.2]), { creator: 'c2', s: 9, y: 0 }, { creator: 'c2', s: 1, y: 0.005 }];
    expect(pairwiseAccuracy(rows)).toEqual({ acc: 1, pairs: 1 });
  });

  test('AC-06-12 Spearman 0.886', () => {
    expect(spearmanWithin(one(S, Y))!.rho).toBeCloseTo(0.886, 3);
    expect(spearmanWithin(one([1, 2, 3, 4], [1, 2, 3, 4]))).toBeNull(); // n_c < 5 skipped
  });

  test('AC-06-13 PR-AUC 0.722 at base 0.30', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ score: 10 - i, positive: [0, 2, 5].includes(i), postId: `p${i}` }));
    const r = prAuc(rows)!;
    expect(r.ap).toBeCloseTo(0.722, 3);
    expect(r.base).toBeCloseTo(0.3, 10);
    expect(prAuc(rows.slice(0, 4))).toBeNull(); // fewer than 3 negatives
  });

  test('AC-06-14 log MAE 0.170, shown as x1.5', () => {
    const pts = [4.38, 3.9, 4.1, 4.6];
    const act = [4.25, 4.05, 4.0, 4.9];
    const mae = logMae(pts.map((p, i) => ({ point: 10 ** p - 1, actual: 10 ** act[i] - 1 })))!;
    expect(mae).toBeCloseTo(0.17, 3);
    expect(typicalFactor(mae).toFixed(1)).toBe('1.5');
  });

  test('AC-06-15 coverage 16 of 20, Wilson 90% 0.62 to 0.91', () => {
    const c = coverage([...Array(16).fill(true), ...Array(4).fill(false), null])!;
    expect(c.value).toBe(0.8);
    expect(c.m).toBe(20);
    expect(Math.abs(c.lo - 0.62)).toBeLessThan(0.005);
    expect(Math.abs(c.hi - 0.91)).toBeLessThan(0.005);
    expect(wilson90(16, 20)).toEqual([c.lo, c.hi]);
  });

  test('AC-06-16 bootstrap is deterministic for a seed, and stratified by creator', () => {
    const rows = [...one(S, Y), ...S.map((s, i) => ({ creator: 'c2', s, y: Y[5 - i] }))];
    const stat = (rs: RankRow[]) => pairwiseAccuracy(rs)?.acc ?? null;
    const a = bootstrap(rows, stat, { seed: 'sh_24h|backtest|all|12|2026-10-11', clusterBy: (r) => r.creator });
    const b = bootstrap(rows, stat, { seed: 'sh_24h|backtest|all|12|2026-10-11', clusterBy: (r) => r.creator });
    expect(a).toEqual(b);
    expect(a!.lo).toBeLessThanOrEqual(a!.hi);
    const c = bootstrap(rows, stat, { seed: 'other', clusterBy: (r) => r.creator });
    expect(c).not.toEqual(a);
  });

  test('AC-06-17 creator_median pairwise is exactly 0.5 (one score per creator)', () => {
    expect(pairwiseAccuracy(one([0, 0, 0, 0, 0, 0], Y))!.acc).toBe(0.5);
  });

  test('Newcombe on the 10.3 worked examples', () => {
    const w = newcombe(63, 4200, 31, 3900);
    expect(w.d).toBeCloseTo(0.00705, 5);
    expect(w.lo).toBeCloseTo(0.00317, 5);
    expect(w.hi).toBeCloseTo(0.01102, 5);
    const i = newcombe(40, 4000, 38, 4100);
    expect(i.lo).toBeCloseTo(-0.00288, 5);
    expect(i.hi).toBeCloseTo(0.00438, 5);
  });
});
