import { describe, expect, test } from 'vitest';
import type { LabMeasureV2 } from '@/lib/schemas';
import { ageMatchedView, heroBreakouts, heroNormal, ratioCurve } from '@/lib/lab/measure/view';
import { LAB_LAYERS_BUILT } from '@/lib/lab/view/layers';

/** 04 7 view builders (AC-04-33). */
const NOW = new Date('2026-10-10T12:00:00.000Z');
const ago = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

function measure(over: Partial<LabMeasureV2> = {}): LabMeasureV2 {
  return {
    postId: 'p', depth: null, breakout: null, breakoutLo: null, breakoutHi: null, baselineN: 0, baselineConfidence: 'low', reach: null, velocity: null, trajectory: null, quadrant: null, isBreakout: false, computedAt: NOW.toISOString(),
    measureVersion: 'measure-v2', metricBasis: 'views', judgedAgeH: null, basisAtAge: null, baselineLog: null, baselineVar: null, priorLog: null, shrinkB: null, baselineSource: null, robustZ: null, volatility: null, volatilityClass: null,
    maxOverMedian: null, nicheRatio: null, dualHigh: false, trajectoryClass: null, peakDayShare: null, exoAuto: false, sharesPerView: null, savesPerView: null, xActionScore: null, followersAsOf: null,
    ages: {
      '6': { y: 3, ratio: 1.2, lo: 0.9, hi: 1.6, z: 0.4, n: 8, how: 'nearest' },
      '24': { y: 4, ratio: 2.31, lo: 1.62, hi: 3.08, z: 1.5, n: 8, how: 'interpolated' },
      '72': { y: 4.2, ratio: 2.8, lo: 2, hi: 3.9, z: 1.9, n: 8, how: 'nearest' },
      '168': { y: 4.4, ratio: 3.4, lo: 2.5, hi: 4.6, z: 2.4, n: 9, how: 'nearest' },
    },
    ...over,
  };
}

describe('ageMatchedView (AC-04-33)', () => {
  test('too new at 5h, judged at 24h at 30h, at 7d at 200h; X at 24h at 47h', () => {
    const m = measure();
    expect(ageMatchedView(m, { postedAt: ago(5), platform: 'instagram' }, NOW, true)).toMatchObject({ state: 'too_new', text: 'too new', nextAtH: 24 });
    expect(ageMatchedView(m, { postedAt: ago(30), platform: 'instagram' }, NOW, true)).toMatchObject({ state: 'judged', atH: 24, atLabel: 'at 24h', ratioText: '2.3x', rangeText: '1.6x to 3.1x', n: 8, nextAtH: 72 });
    expect(ageMatchedView(m, { postedAt: ago(200), platform: 'instagram' }, NOW, true)).toMatchObject({ state: 'judged', atH: 168, atLabel: 'at 7d', nextAtH: null });
    expect(ageMatchedView(m, { postedAt: ago(47), platform: 'twitter' }, NOW, true)).toMatchObject({ state: 'judged', atH: 24 });
  });
  test('no ratio or n under 5 is "not enough yet"; not built is "not live yet"', () => {
    expect(ageMatchedView(measure({ ages: {} }), { postedAt: ago(30), platform: 'tiktok' }, NOW, true)).toMatchObject({ state: 'no_baseline', text: 'not enough yet', atH: 24 });
    expect(ageMatchedView(null, { postedAt: ago(30), platform: 'tiktok' }, NOW, true)).toMatchObject({ state: 'no_baseline' });
    expect(ageMatchedView(measure({ ages: { '24': { y: 4, ratio: 3, lo: 2, hi: 4, z: 2, n: 4, how: 'nearest' } } }), { postedAt: ago(30), platform: 'tiktok' }, NOW, true).state).toBe('no_baseline');
    expect(ageMatchedView(measure(), { postedAt: ago(30), platform: 'tiktok' }, NOW, false)).toMatchObject({ state: 'not_built', text: 'not live yet' });
  });
});

describe('heroes and the ratio curve', () => {
  const period = { from: ago(30 * 24), to: NOW.toISOString(), prevFrom: ago(60 * 24) };
  test('heroNormal with 4 posts gives value null; with 5 the median', () => {
    const rows = [1.1, 1.4, 0.9, 2].map((r, i) => ({ postedAt: ago(24 * (i + 2)), ratio: r, platform: 'tiktok' as const }));
    expect(heroNormal(rows, period, 'all')).toMatchObject({ value: null, n: 4, enough: false });
    const five = [...rows, { postedAt: ago(24 * 9), ratio: 1.3, platform: 'tiktok' as const }];
    expect(heroNormal(five, period, 'all')).toMatchObject({ value: 1.3, n: 5, enough: true });
    expect(heroNormal(five, period, 'instagram')).toMatchObject({ value: null, n: 0 });
  });
  test('heroBreakouts counts tracked posts judged in the period and their breakouts', () => {
    const rows = [
      { postedAt: ago(48), isBreakout: true, owned: false, platform: 'tiktok' as const },
      { postedAt: ago(72), isBreakout: false, owned: false, platform: 'tiktok' as const },
      { postedAt: ago(72), isBreakout: true, owned: true, platform: 'tiktok' as const },
      { postedAt: ago(40 * 24), isBreakout: true, owned: false, platform: 'tiktok' as const },
    ];
    expect(heroBreakouts(rows, period, 'all')).toEqual({ value: 1, n: 2, prev: 1, judged: 2 });
  });
  test('ratioCurve lists reached ages in order', () => {
    expect(ratioCurve(measure()).map((x) => x.ageH)).toEqual([6, 24, 72, 168]);
  });
  test('the measure layer is built (04 9)', () => {
    expect(LAB_LAYERS_BUILT.measure).toBe(true);
  });
});
