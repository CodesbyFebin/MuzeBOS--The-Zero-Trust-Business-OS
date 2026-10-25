import { describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/lab/ledger/deps', async (importOriginal) => (await import('./helpers/lab-measure-ref')).withMeasureFallback(await importOriginal()));

import { asOfView } from '@/lib/lab/measure/asof';
import { conformalQ, earlyForecastDue, fitAndCache, fitMultivariate, fitSh, readFit, ridgeFit, mvPredict, shForecast, splitConformal } from '@/lib/lab/ledger/forecast';
import { H, addPost, forecastWorld, iso } from './helpers/lab-ledger-world';

const NOW = Date.parse('2026-10-11T12:00:00.000Z');

describe('Szabo-Huberman (06 6.1, 6.4)', () => {
  test('AC-06-18 worked example 23,945 (15,820 to 36,242), ratio 2.18 above, 1.44 to 3.29', () => {
    const f = shForecast({ c: 0.3, q: 0.18 }, 12_000, 11_000);
    expect(Math.abs(f.viewsPoint! - 23_945)).toBeLessThanOrEqual(1);
    expect(Math.abs(f.viewsLo! - 15_820)).toBeLessThanOrEqual(1);
    expect(Math.abs(f.viewsHi! - 36_242)).toBeLessThanOrEqual(1);
    expect(f.ratioPoint).toBeCloseTo(2.18, 2);
    expect(f.band).toBe('above');
    expect(f.ratioLo).toBeCloseTo(1.44, 2);
    expect(f.ratioHi).toBeCloseTo(3.29, 2);
    expect(f.intervalLevel).toBe(0.8);
  });

  test('AC-06-19 abstains under 20 training pairs', () => {
    expect(fitSh(asOfView(forecastWorld(19), iso(NOW)), 'instagram', 24)).toBeNull();
    const fit = fitSh(asOfView(forecastWorld(20), iso(NOW)), 'instagram', 24)!;
    expect(fit.n).toBe(20);
    expect(fit.c).toBeGreaterThan(0.2);
    expect(fit.q).toBeNull(); // no 20-row calibration set yet: a point, no interval
  });

  test('AC-06-20 conformal q is the 17th of 20', () => {
    const r = Array.from({ length: 20 }, (_, i) => (20 - i) / 100);
    expect(conformalQ(r)).toBeCloseTo(0.17, 10);
    expect(conformalQ([0.1, 0.2])).toBeNull();
  });

  test('split conformal: first 70% fit, last 30% calibrate, only with 20 calibration rows', () => {
    expect(splitConformal(Array.from({ length: 66 }, (_, i) => i)).cal).toHaveLength(0);
    const sp = splitConformal(Array.from({ length: 67 }, (_, i) => i));
    expect(sp.fit).toHaveLength(47);
    expect(sp.cal).toHaveLength(20);
    const fit = fitSh(asOfView(forecastWorld(70), iso(NOW)), 'instagram', 24)!;
    expect(fit.nCal).toBe(21);
    expect(fit.q).not.toBeNull();
    // proper split: the point model never saw a calibration post
    expect(fit.trainIds.some((id) => fit.calIds.includes(id))).toBe(false);
  });

  test('exogenous posts are out of training', () => {
    const s = forecastWorld(21);
    s.posts.flagExo('p000', 'collab', null, iso(NOW));
    expect(fitSh(asOfView(s, iso(NOW)), 'instagram', 24)!.n).toBe(20);
    // 04's automatic flag (lab_measures.exo_auto) arrives as a set; 19 pairs left, so it abstains
    expect(fitSh(asOfView(s, iso(NOW)), 'instagram', 24, { exo: new Set(['p001']) })).toBeNull();
  });
});

describe('multivariate (06 6.3)', () => {
  test('AC-06-21 locked under 50 complete posts, unlocked at 50', () => {
    expect(fitMultivariate(asOfView(forecastWorld(49), iso(NOW)), 'instagram', 'mv_24h')).toBeNull();
    const fit = fitMultivariate(asOfView(forecastWorld(50), iso(NOW)), 'instagram', 'mv_24h')!;
    expect(fit.n).toBe(50);
    expect(fit.beta).toHaveLength(4);
    expect(fitMultivariate(asOfView(forecastWorld(50), iso(NOW)), 'instagram', 'mv_6h')!.beta).toHaveLength(2);
  });

  test('ridge on standardized features recovers a clean linear signal (intercept unpenalized)', () => {
    const xs = Array.from({ length: 60 }, (_, i) => [i / 10, (i % 7) / 3]);
    const ys = xs.map(([a, b]) => 1 + 2 * a - b);
    const m = ridgeFit(xs, ys, 1e-6);
    expect(mvPredict(m, [2, 1])).toBeCloseTo(4, 3);
  });
});

describe('earlyForecastDue (06 6.6)', () => {
  test('freezes sh_6h and sh_24h once from the cached fit, as of the reading time', () => {
    const s = forecastWorld(30);
    expect(fitAndCache(s, new Date(NOW)).fitted).toBeGreaterThan(0);
    expect(readFit(s, 'sh_24h', 'instagram')?.kind).toBe('sh');
    expect(readFit(s, 'mv_24h', 'instagram')).toBeNull(); // locked under 50
    addPost(s, { id: 'young', source: 'own', postedAt: NOW - 26 * H, reads: { 6: 2_000, 24: 7_000 } });
    const r = earlyForecastDue(s, new Date(NOW), { dry: true });
    expect(r.frozen).toBe(2);
    const rows = s.predictions.forPost('young');
    expect(rows.map((p) => p.predictor).sort()).toEqual(['sh_24h', 'sh_6h']);
    const r24 = rows.find((p) => p.predictor === 'sh_24h')!;
    expect(r24.asOf).toBe(iso(NOW - 26 * H + 24 * H));
    expect(r24.dry).toBe(true);
    expect(r24.refAgeH).toBe(24);
    expect(earlyForecastDue(s, new Date(NOW), { dry: true }).frozen).toBe(0); // a second freeze is a no-op
  });

  test('a post older than 30 h gets no early row; no cached fit means abstain (no row)', () => {
    const s = forecastWorld(5);
    addPost(s, { id: 'old', source: 'own', postedAt: NOW - 40 * H, reads: { 6: 2_000, 24: 7_000 } });
    addPost(s, { id: 'young', source: 'own', postedAt: NOW - 8 * H, reads: { 6: 2_000 } });
    expect(earlyForecastDue(s, new Date(NOW)).frozen).toBe(0);
  });
});
