import { describe, expect, test } from 'vitest';
import { ebBaseline, fitEb, ratioOf, robustSpread, volatilityBand, volatilityClass, type EbFit } from '@/lib/lab/measure/eb';
import { valueAtAge } from '@/lib/lab/measure/age';

/** 04 3.4 worked examples, AC-04-6 to AC-04-8. */
const FIT: EbFit = { platform: 'instagram', surface: 'reel', ageH: 24, alpha: 1.2, beta: 0.65, flatPrior: null, S2: 0.06, tau2: 0.04, cells: 12 };
const y = (xs: number[]) => xs.map((v) => Math.log10(v));

describe('04 3.4 empirical-Bayes baseline (AC-04-6)', () => {
  test('worked example 1: a steady creator, 4.44x and z 3.76 is a breakout', () => {
    const sample = y([12_000, 15_000, 9_000, 20_000, 11_000, 14_000, 30_000, 13_000]);
    const { m, s } = robustSpread(sample);
    expect(m).toBeCloseTo(4.13, 3);
    expect(s).toBeCloseTo(0.1034, 3);
    const eb = ebBaseline(sample, FIT, Math.log10(40_000))!;
    expect(eb.sTilde ** 2).toBeCloseTo(0.02966, 4);
    expect(eb.sTilde).toBeCloseTo(0.1722, 3);
    expect(eb.se2).toBeCloseTo(0.00582, 4);
    expect(eb.prior!).toBeCloseTo(4.1913, 3);
    expect(eb.B).toBeCloseTo(0.1271, 3);
    expect(eb.b).toBeCloseTo(4.1378, 3);
    expect(eb.V).toBeCloseTo(0.00508, 4);
    expect(Math.sqrt(eb.V)).toBeCloseTo(0.0713, 3);
    const r = ratioOf(Math.log10(61_000), eb);
    expect(r.ratio).toBeCloseTo(4.44, 2);
    expect(r.lo).toBeCloseTo(3.39, 2);
    expect(r.hi).toBeCloseTo(5.82, 2);
    expect(r.z).toBeCloseTo(3.76, 2);
    expect(volatilityClass(eb.sTilde)).toBe('normal');
    const [lo, hi] = volatilityBand(eb.sTilde);
    expect(lo).toBeCloseTo(0.67, 2);
    expect(hi).toBeCloseTo(1.49, 2);
  });

  test('worked example 2: a volatile creator, 3.39x but z 1.35', () => {
    const sample = y([2_000, 9_000, 4_000, 30_000, 6_000, 1_500]);
    const eb = ebBaseline(sample, FIT, Math.log10(12_000))!;
    expect(eb.m).toBeCloseTo(3.6901, 3);
    expect(robustSpread(sample).s).toBeCloseTo(0.4842, 3);
    expect(eb.sTilde).toBeCloseTo(0.3939, 3);
    expect(eb.se2).toBeCloseTo(0.04062, 4);
    expect(eb.prior!).toBeCloseTo(3.8515, 3);
    expect(eb.B).toBeCloseTo(0.5039, 3);
    expect(eb.b).toBeCloseTo(3.7714, 3);
    const r = ratioOf(Math.log10(20_000), eb);
    expect(r.ratio).toBeCloseTo(3.39, 2);
    // the spec table prints 1.35; (4.3010 - 3.7714) / 0.3939 = 1.3445 (spec rounding slip, reported)
    expect(r.z).toBeCloseTo(1.3445, 3);
    expect(r.z).toBeLessThan(2);
    expect(volatilityClass(eb.sTilde)).toBe('swingy');
  });
});

describe('edge cases (AC-04-7, AC-04-8)', () => {
  test('MAD 0 gives a finite shrunk spread sqrt(5 S2 / 13) and a finite z', () => {
    const sample = new Array(8).fill(Math.log10(10_000));
    const eb = ebBaseline(sample, FIT, Math.log10(40_000))!;
    expect(eb.sTilde).toBeCloseTo(Math.sqrt((5 * 0.06) / 13), 6);
    const r = ratioOf(Math.log10(50_000), eb);
    expect(Number.isFinite(r.z)).toBe(true);
  });

  test('n 4 returns null; under 3 fit cells B is 0 and b is the median', () => {
    expect(ebBaseline(y([1, 2, 3, 4]), FIT, 4)).toBeNull();
    const thin = fitEb([{ m: 4, s2: 0.02, n: 8, logF: 4.5 }, { m: 3.5, s2: 0.03, n: 6, logF: 4 }], { platform: 'tiktok', surface: 'video', ageH: 24 });
    expect(thin.cells).toBe(2);
    expect(thin.alpha).toBeNull();
    expect(thin.flatPrior).toBeNull();
    expect(thin.S2).toBe(0.06);
    const sample = y([1000, 2000, 3000, 4000, 5000]);
    const eb = ebBaseline(sample, thin, 4.2)!;
    expect(eb.B).toBe(0);
    expect(eb.b).toBeCloseTo(eb.m, 12);
  });

  test('fitEb: 8 cells give an OLS prior, 3 to 7 a flat one, tau2 floored at 0.01', () => {
    const cells = Array.from({ length: 8 }, (_, i) => ({ m: 1.2 + 0.65 * (4 + i * 0.2), s2: 0.02, n: 10, logF: 4 + i * 0.2 }));
    const ols = fitEb(cells, { platform: 'instagram', surface: 'reel', ageH: 24 });
    expect(ols.alpha).toBeCloseTo(1.2, 6);
    expect(ols.beta).toBeCloseTo(0.65, 6);
    expect(ols.tau2).toBe(0.01);
    expect(ols.S2).toBeCloseTo(0.02, 9);
    const flat = fitEb(cells.slice(0, 4), { platform: 'instagram', surface: 'reel', ageH: 24 });
    expect(flat.alpha).toBeNull();
    expect(flat.flatPrior).not.toBeNull();
  });
});

describe('04 3.1 valueAtAge', () => {
  const posted = '2026-01-01T00:00:00.000Z';
  const at = (h: number) => new Date(Date.parse(posted) + h * 3_600_000).toISOString();
  test('interpolates in log age: 17h 21,000 and 41h 33,000 give 25,067 at 24h', () => {
    const v = valueAtAge([{ capturedAt: at(17), basis: 21_000 }, { capturedAt: at(41), basis: 33_000 }], posted, 24, at(100))!;
    expect(v.how).toBe('interpolated');
    expect(v.y).toBeCloseTo(4.3991, 3);
    expect(Math.round(v.views)).toBeGreaterThanOrEqual(25_060);
    expect(Math.round(v.views)).toBeLessThanOrEqual(25_075);
  });
  test('AC-06-8 shape: 150h 40,000 and 190h 52,000 give 45,361 at 168h', () => {
    const v = valueAtAge([{ capturedAt: at(150), basis: 40_000 }, { capturedAt: at(190), basis: 52_000 }], posted, 168, at(400))!;
    expect(v.how).toBe('interpolated');
    expect(Math.abs(v.views - 45_361)).toBeLessThanOrEqual(1);
  });
  test('nearest within tolerance, mature fallback, never extrapolates, as-of honoured', () => {
    expect(valueAtAge([{ capturedAt: at(26), basis: 100 }], posted, 24, at(30))!.how).toBe('nearest');
    expect(valueAtAge([{ capturedAt: at(40), basis: 100 }], posted, 24, at(50))).toBeNull();
    expect(valueAtAge([{ capturedAt: at(500), basis: 100 }], posted, 336, at(600))!.how).toBe('mature');
    expect(valueAtAge([{ capturedAt: at(26), basis: 100 }], posted, 24, at(25))).toBeNull();
    expect(valueAtAge([{ capturedAt: at(80), basis: 100 }], posted, 48, at(90), { matureH: 48 })!.how).toBe('mature');
  });
});
