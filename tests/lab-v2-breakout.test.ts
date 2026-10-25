import { describe, expect, test } from 'vitest';
import { baselineConfidence, growthOffsets, isBreakoutV2, isDualHigh, nicheBaseline } from '@/lib/lab/measure/breakout';
import { judgeAge } from '@/lib/lab/measure/age';
import { isBreakout } from '@/lib/lab/measures';

describe('04 3.7 the breakout rule (AC-04-9)', () => {
  test('ratio 3.4 with z 1.35 is not a breakout', () => {
    expect(isBreakoutV2({ ratio: 3.4, z: 1.35, confidence: baselineConfidence(6, true), judgedAgeH: 24 })).toBe(false);
  });
  test('ratio 4.4, z 3.8, n 8 with a prior at 24h is; at 6h it is not; with no prior (low) it is not', () => {
    const conf = baselineConfidence(8, true);
    expect(conf).toBe('ok');
    expect(isBreakoutV2({ ratio: 4.4, z: 3.8, confidence: conf, judgedAgeH: 24 })).toBe(true);
    expect(isBreakoutV2({ ratio: 4.4, z: 3.8, confidence: conf, judgedAgeH: 6 })).toBe(false);
    expect(baselineConfidence(8, false)).toBe('low');
    expect(isBreakoutV2({ ratio: 4.4, z: 3.8, confidence: baselineConfidence(8, false), judgedAgeH: 24 })).toBe(false);
  });
  test('confidence bands and the v1 re-export', () => {
    expect(baselineConfidence(30)).toBe('high');
    expect(baselineConfidence(10)).toBe('ok');
    expect(baselineConfidence(4, true)).toBe('low');
    expect(isBreakout).toBe(isBreakoutV2);
  });
  test('judge ages', () => {
    expect(judgeAge(5, 'instagram')).toBeNull();
    expect(judgeAge(30, 'instagram')).toBe(24);
    expect(judgeAge(200, 'instagram')).toBe(168);
    expect(judgeAge(47, 'twitter')).toBe(24);
    expect(judgeAge(400, 'twitter')).toBe(24);
  });
});

describe('04 3.11 Dual-High (AC-04-13)', () => {
  test('(4.4, 3.1) true, (4.4, 2.9) false, niche n 19 gives null', () => {
    expect(isDualHigh(4.4, 3.1)).toBe(true);
    expect(isDualHigh(4.4, 2.9)).toBe(false);
    expect(isDualHigh(4.4, null)).toBe(false);
    expect(nicheBaseline(new Array(19).fill(1000))).toBeNull();
    expect(nicheBaseline(Array.from({ length: 20 }, (_, i) => 1000 + i))).toEqual({ median: 1009.5, n: 20 });
  });
});

describe('04 3.3 growth offsets', () => {
  test('c(a) is the median of y_mature - y_a per platform x surface x age', () => {
    const rows = [0.5, 0.6, 0.7].map((d) => ({ platform: 'tiktok' as const, surface: 'video' as const, ages: { 24: 4, 336: 4 + d } }));
    const off = growthOffsets(rows);
    expect(off).toHaveLength(1);
    expect(off[0]).toMatchObject({ ageH: 24, n: 3 });
    expect(off[0].c).toBeCloseTo(0.6, 9);
    expect(off[0].sd).toBeCloseTo(1.4826 * 0.1, 9);
  });
});
