import { describe, expect, test } from 'vitest';
import { baselineSample, breakout } from '@/lib/lab/measure/baseline';
import { followersAsOf } from '@/lib/lab/measure/asof';
import {
  baselineConfidence,
  beatTemplate,
  depth,
  durationBand,
  enough,
  fmtRatio,
  isBreakout,
  ladder,
  ladderIndex,
  lift,
  median,
  medianInterval,
  minesPatterns,
  momentum,
  normalizeBeats,
  quadrant,
  quantile,
  reach,
  strandMarks,
  timing,
  trajectory,
  wilson,
  wordBudget,
  wpmBand,
  wpmOf,
} from '@/lib/lab/measures';

const iso = (dayOffset: number, hour = 12) => new Date(Date.UTC(2026, 8, 1 + dayOffset, hour)).toISOString();

describe('basic statistics', () => {
  test('median and quantile ignore non-finite values and handle even counts', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([1, NaN, 3])).toBe(2);
    expect(quantile([1, 2, 3, 4, 5], 0.25)).toBe(2);
    expect(quantile([10], 0.9)).toBe(10);
  });

  test('medianInterval: order statistics at 90%, [min, max] when n is too small', () => {
    expect(medianInterval([])).toBeNull();
    expect(medianInterval([5, 1, 3])).toEqual([1, 5]);
    // n = 10: P(Bin(10,.5) <= 1) = 0.0107 <= .05, P(<= 2) = 0.0547 > .05 → k = 2 → [x2, x9]
    expect(medianInterval([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toEqual([2, 9]);
    const big = Array.from({ length: 30 }, (_, i) => i + 1);
    const [lo, hi] = medianInterval(big)!;
    expect(lo).toBeGreaterThan(5);
    expect(hi).toBeLessThan(26);
    expect(lo).toBeLessThan(15.5);
    expect(hi).toBeGreaterThan(15.5);
  });

  test('wilson interval brackets the proportion and stays in [0, 1]', () => {
    expect(wilson(0, 0)).toBeNull();
    const [lo, hi] = wilson(5, 20)!;
    expect(lo).toBeLessThan(0.25);
    expect(hi).toBeGreaterThan(0.25);
    expect(wilson(0, 10)![0]).toBe(0);
    expect(wilson(10, 10)![1]).toBe(1);
  });

  test('enough(n): the UI shows a number only from n 5', () => {
    expect(enough(4)).toBe(false);
    expect(enough(5)).toBe(true);
  });
});

describe('depth: saves only where real, no views no rate', () => {
  test('counts likes, comments and saves over views', () => {
    expect(depth({ views: 1000, likes: 50, comments: 5, saves: 7 })).toBeCloseTo(0.062);
  });
  test('null saves are not zero-filled into the platform comparison, they are skipped', () => {
    expect(depth({ views: 1000, likes: 50, comments: 10, saves: null })).toBeCloseTo(0.06);
  });
  test('no views (or zero views) → null, never a fallback denominator', () => {
    expect(depth({ views: null, likes: 50, comments: 10, saves: 3 })).toBeNull();
    expect(depth({ views: 0, likes: 50, comments: 10, saves: 3 })).toBeNull();
  });
  test('no counters at all → null', () => {
    expect(depth({ views: 1000, likes: null, comments: null, saves: null })).toBeNull();
  });
});

describe('breakout vs the creator’s own same-format baseline', () => {
  test('baselineSample: only earlier posts in the 90 days before, newest 30, never itself', () => {
    const target = { id: 't', postedAt: iso(100) };
    const others = [
      { id: 't', postedAt: iso(100), views: 999 },
      { id: 'later', postedAt: iso(101), views: 5 },
      { id: 'old', postedAt: iso(5), views: 7 },
      { id: 'noviews', postedAt: iso(99), views: null },
      ...Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, postedAt: iso(60 + Math.floor(i / 2), i % 2 ? 18 : 6), views: 100 + i })),
    ];
    const s = baselineSample(target, others);
    expect(s).toHaveLength(30);
    expect(s).not.toContain(999);
    expect(s).not.toContain(5);
    expect(s).not.toContain(7);
    expect(s[0]).toBe(139); // newest first
  });

  test('n >= 10: views over the own median, confidence ok, interval brackets the ratio', () => {
    const base = [100, 110, 90, 105, 95, 100, 120, 80, 100, 100];
    const b = breakout(500, base, { median: 10_000, p25: 5_000, p75: 20_000 })!;
    expect(b.ratio).toBeCloseTo(5);
    expect(b.ownWeight).toBe(1);
    expect(b.confidence).toBe('ok');
    expect(b.lo).toBeLessThanOrEqual(b.ratio);
    expect(b.hi).toBeGreaterThanOrEqual(b.ratio);
  });

  test('n < 10 shrinks toward the niche median with weight n/10', () => {
    const base = [100, 100, 100, 100, 100]; // n 5 → w .5
    const b = breakout(600, base, { median: 300, p25: 300, p75: 300 })!;
    expect(b.ownWeight).toBe(0.5);
    expect(b.baseline).toBeCloseTo(200); // .5 × 100 + .5 × 300
    expect(b.ratio).toBeCloseTo(3);
    expect(b.confidence).toBe('low');
  });

  test('n 0 uses the niche alone; nothing at all → null', () => {
    expect(breakout(600, [], { median: 200 })!.ratio).toBeCloseTo(3);
    expect(breakout(600, [], { median: null })).toBeNull();
    expect(breakout(null, [100], { median: 100 })).toBeNull();
    expect(breakout(0, [100], { median: 100 })).toBeNull();
  });

  test('a thin own baseline with no niche still uses what the creator has', () => {
    const b = breakout(300, [100, 100], { median: null })!;
    expect(b.ratio).toBeCloseTo(3);
  });

  test('baseline confidence bands: low < 10, ok 10-29, high 30+', () => {
    expect(baselineConfidence(9)).toBe('low');
    expect(baselineConfidence(10)).toBe('ok');
    expect(baselineConfidence(29)).toBe('ok');
    expect(baselineConfidence(30)).toBe('high');
  });
});

describe('the Ladder and the breakout definition', () => {
  test('rungs: < 2 none, 2-5 notable, 5-10 strong, > 10 exceptional', () => {
    expect(ladder(1.9)).toBe('none');
    expect(ladder(2)).toBe('notable');
    expect(ladder(4.99)).toBe('notable');
    expect(ladder(5)).toBe('strong');
    expect(ladder(10)).toBe('strong');
    expect(ladder(10.01)).toBe('exceptional');
    expect(ladder(null)).toBeNull();
    expect(ladderIndex('none')).toBe(1);
    expect(ladderIndex('exceptional')).toBe(4);
    expect(ladderIndex(null)).toBe(0);
  });

  test('fmtRatio: one decimal under 10x, whole above', () => {
    expect(fmtRatio(7.24)).toBe('7.2x');
    expect(fmtRatio(3)).toBe('3.0x');
    expect(fmtRatio(14.6)).toBe('15x');
    expect(fmtRatio(null)).toBeNull();
  });

  test('a breakout is v2 (04 3.7): >= 3x, z >= 2, ok/high confidence, judged at 24h or older; clickbait no longer removes it', () => {
    expect(isBreakout({ ratio: 3, z: 2, confidence: 'ok', judgedAgeH: 24 })).toBe(true);
    expect(isBreakout({ ratio: 2.99, z: 5, confidence: 'high', judgedAgeH: 168 })).toBe(false);
    expect(isBreakout({ ratio: 8, z: 5, confidence: 'low', judgedAgeH: 168 })).toBe(false);
    expect(isBreakout({ ratio: 8, z: 1.9, confidence: 'high', judgedAgeH: 168 })).toBe(false);
    expect(isBreakout({ ratio: 8, z: 5, confidence: 'high', judgedAgeH: 6 })).toBe(false);
  });

  test('pattern mining (04 5.4): cases and controls only; drops clickbait, comment-keyword bait and outside pushes', () => {
    expect(minesPatterns({ quadrant: 'ideal' }, 'comment_keyword', { role: 'case', exoReason: null })).toBe(false);
    expect(minesPatterns({ quadrant: 'loyal' }, 'follow', { role: 'case', exoReason: null })).toBe(true);
    expect(minesPatterns({ quadrant: 'dud' }, 'follow', { role: 'control', exoReason: null })).toBe(true);
    expect(minesPatterns({ quadrant: 'clickbait' }, 'follow', { role: 'case', exoReason: null })).toBe(false);
    expect(minesPatterns({ quadrant: 'ideal' }, 'follow', { role: null, exoReason: null })).toBe(false);
    expect(minesPatterns({ quadrant: 'ideal' }, 'follow', { role: 'case', exoReason: 'collab' })).toBe(false);
    expect(minesPatterns({ quadrant: 'ideal', exoAuto: true }, 'follow', { role: 'case', exoReason: null })).toBe(false);
  });
});

describe('reach, velocity, trajectory, quadrant', () => {
  test('reach uses the follower count in force at posting time', () => {
    const snaps = [
      { capturedAt: iso(0), followers: 1000 },
      { capturedAt: iso(10), followers: 2000 },
      { capturedAt: iso(20), followers: null },
    ];
    expect(followersAsOf(snaps, iso(5))).toEqual({ followers: 1000, kind: 'before' });
    expect(followersAsOf(snaps, iso(15))).toEqual({ followers: 2000, kind: 'before' });
    expect(followersAsOf(snaps, iso(-5))).toEqual({ followers: 1000, kind: 'backfill' }); // within 7 days after
    expect(followersAsOf(snaps, iso(-30))).toBeNull(); // v1 fell back at any distance; v2 does not (6.2)
    expect(followersAsOf([], iso(5))).toBeNull();
    expect(reach(3600, 2000)).toBeCloseTo(1.8);
    expect(reach(3600, null)).toBeNull();
    expect(reach(3600, 0)).toBeNull();
  });

  test('trajectory from snapshots: fast_flat, slow_sustained, consistent', () => {
    const posted = iso(0, 0);
    const at = (h: number) => new Date(Date.parse(posted) + h * 3_600_000).toISOString();
    expect(trajectory(posted, [{ capturedAt: at(12), views: 8000 }, { capturedAt: at(24), views: 9000 }, { capturedAt: at(240), views: 10_000 }])).toBe('fast_flat');
    expect(trajectory(posted, [{ capturedAt: at(12), views: 1000 }, { capturedAt: at(36), views: 3000 }, { capturedAt: at(240), views: 10_000 }])).toBe('slow_sustained');
    expect(trajectory(posted, [{ capturedAt: at(24), views: 5000 }, { capturedAt: at(240), views: 10_000 }])).toBe('consistent');
    expect(trajectory(posted, [{ capturedAt: at(24), views: 5000 }])).toBeNull(); // one read
    expect(trajectory(posted, [{ capturedAt: at(72), views: 5000 }, { capturedAt: at(200), views: 9000 }])).toBeNull(); // launch unknown
    expect(trajectory(null, [])).toBeNull();
  });

  test('quadrant splits at the niche medians', () => {
    const med = { depth: 0.05, breakout: 1 };
    expect(quadrant(0.08, 3, med)).toBe('ideal');
    expect(quadrant(0.08, 0.5, med)).toBe('loyal');
    expect(quadrant(0.02, 3, med)).toBe('clickbait');
    expect(quadrant(0.02, 0.5, med)).toBe('dud');
    expect(quadrant(null, 3, med)).toBeNull();
    expect(quadrant(0.08, 3, { depth: null, breakout: 1 })).toBeNull();
  });
});

describe('lift (Viral Profile)', () => {
  test('lift is the conditional rate over the base rate, with an interval', () => {
    // base rate 50/500 = .1; value 20/80 = .25 → lift 2.5
    const l = lift(20, 80, 50, 500);
    expect(l.lift).toBeCloseTo(2.5);
    expect(l.lo!).toBeLessThan(2.5);
    expect(l.hi!).toBeGreaterThan(2.5);
    expect(l.shown).toBe(true);
  });
  test('hidden below 8 breakouts, or when the interval spans 1.0', () => {
    expect(lift(7, 20, 50, 500).shown).toBe(false);
    expect(lift(9, 90, 50, 500).shown).toBe(false); // lift 1.0
  });
  test('an underperformer can show too (interval entirely below 1)', () => {
    const l = lift(8, 200, 100, 500); // .04 vs .2 → .2x
    expect(l.lift).toBeCloseTo(0.2);
    expect(l.hi!).toBeLessThan(1);
    expect(l.shown).toBe(true);
  });
  test('no posts or no base breakouts → null lift, not shown', () => {
    expect(lift(0, 0, 10, 100)).toMatchObject({ lift: null, shown: false });
    expect(lift(0, 10, 0, 100)).toMatchObject({ lift: null, shown: false });
  });
});

describe('bands, budgets, strands', () => {
  test('wpm, word budget and bands', () => {
    expect(wpmOf(124, 45)).toBeCloseTo(165.3, 1);
    expect(wpmOf(0, 45)).toBeNull();
    expect(wpmOf(100, null)).toBeNull();
    expect(wordBudget(45, 165)).toBe(124); // the spec's example
    expect(wpmBand(170)).toBe('160-185 wpm');
    expect(durationBand(45)).toBe('30-60 s');
    expect(durationBand(null)).toBeNull();
  });

  test('normalizeBeats sorts, clamps and removes overlap; marks find the hook and rehooks', () => {
    const beats = normalizeBeats([
      { type: 'demo', startPct: 20, endPct: 70, summary: '' },
      { type: 'hook', startPct: -5, endPct: 8, summary: '' },
      { type: 'reveal', startPct: 6, endPct: 22, summary: '' },
      { type: 'rehook', startPct: 70, endPct: 75, summary: '' },
      { type: 'cta', startPct: 90, endPct: 120, summary: '' },
    ]);
    expect(beats.map((b) => [b.type, b.startPct, b.endPct])).toEqual([
      ['hook', 0, 8],
      ['reveal', 8, 22],
      ['demo', 22, 70],
      ['rehook', 70, 75],
      ['cta', 90, 100],
    ]);
    expect(strandMarks(beats)).toEqual({ hook: { startPct: 0, endPct: 8 }, rehookTicks: [70] });
    expect(beatTemplate(beats)).toBe('hook → reveal → demo → rehook → cta');
  });
});

describe('trends: momentum and timing', () => {
  test('momentum is this week over the trailing 4-week median', () => {
    expect(momentum(10, [4, 5, 5, 6])).toBeCloseTo(2);
    expect(momentum(0, [0, 0, 0, 0])).toBe(0);
    expect(momentum(3, [0, 0, 0, 0])).toBeNull(); // brand new: no baseline
    expect(momentum(3, [])).toBeNull();
  });

  test('timing: early, open, closing, closed', () => {
    expect(timing({ current: 10, trailing4: [2, 2, 3, 2], creators: 3, sourceCount: 1, breakoutRate: 0.3, breakoutRatePrev: 0.2 })).toBe('early');
    expect(timing({ current: 20, trailing4: [6, 7, 8, 6], creators: 9, sourceCount: 5, breakoutRate: 0.3, breakoutRatePrev: 0.2 })).toBe('open');
    expect(timing({ current: 20, trailing4: [6, 7, 8, 6], creators: 21, sourceCount: 5, breakoutRate: 0.1, breakoutRatePrev: 0.3 })).toBe('closing');
    expect(timing({ current: 3, trailing4: [10, 12, 9, 11], creators: 6, sourceCount: 2, breakoutRate: 0, breakoutRatePrev: 0.1 })).toBe('closed');
    expect(timing({ current: 0, trailing4: [], creators: 0, sourceCount: 0, breakoutRate: null, breakoutRatePrev: null })).toBeNull();
  });
});
