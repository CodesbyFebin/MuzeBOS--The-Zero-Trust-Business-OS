import { describe, expect, test } from 'vitest';
import { benjaminiHochberg, controlProbability, drawControl, mantelHaenszel, profileGate, weightedLift } from '@/lib/lab/measure/case-control';

/** 04 5.3 worked example (AC-04-19). */
const STRATA = [
  { a: 4, b: 6, c: 5, d: 25, pi: 0.1 },
  { a: 3, b: 5, c: 3, d: 17, pi: 0.12 },
  { a: 2, b: 2, c: 2, d: 8, pi: 0.25 },
];

describe('04 5.3 estimators (AC-04-19)', () => {
  test('Mantel-Haenszel: OR 3.48, 90% 1.39 to 8.69, z 2.24, p 0.0253', () => {
    const r = mantelHaenszel(STRATA);
    expect(r.or!).toBeCloseTo(3.48, 2);
    expect(r.se!).toBeCloseTo(0.557, 3);
    expect(r.lo!).toBeCloseTo(1.39, 2);
    expect(r.hi!).toBeCloseTo(8.69, 1);
    expect(r.z!).toBeCloseTo(2.24, 2);
    expect(r.p!).toBeCloseTo(0.0253, 3);
    expect(r).toMatchObject({ casesWith: 9, controlsWith: 10, cases: 22, strata: 3 });
  });
  test('inverse-weighted lift 2.35', () => {
    expect(weightedLift(STRATA)!).toBeCloseTo(2.35, 2);
  });
  test('Benjamini-Hochberg q vector', () => {
    const q = benjaminiHochberg([0.0253, 0.004, 0.03, 0.08, 0.2, 0.62]);
    const want = [0.06, 0.024, 0.06, 0.12, 0.24, 0.62];
    q.forEach((x, i) => expect(x).toBeCloseTo(want[i], 3));
  });
  test('a stratum without cases or controls is skipped; nothing estimable gives null', () => {
    expect(mantelHaenszel([{ a: 3, b: 0, c: 0, d: 0 }]).or).toBeNull();
    expect(mantelHaenszel([{ a: 0, b: 4, c: 0, d: 4 }]).or).toBeNull();
  });
});

describe('04 5.2 the draw (AC-04-20)', () => {
  test('deterministic for a seed and post id; share near pi over 10,000 ids', () => {
    expect(drawControl('seed-a', 'p1', 0.5)).toBe(drawControl('seed-a', 'p1', 0.5));
    let n = 0;
    for (let i = 0; i < 10_000; i++) if (drawControl('seed-a', `post-${i}`, 0.08)) n++;
    expect(n / 10_000).toBeGreaterThanOrEqual(0.07);
    expect(n / 10_000).toBeLessThanOrEqual(0.09);
  });
  test('control probability: 40 judged with 3 cases gives 0.081; thin history uses 0.05; clamps', () => {
    expect(controlProbability(3 / 40, 40)).toBeCloseTo(0.081, 3);
    expect(controlProbability(0.4, 10)).toBeCloseTo(0.05 / 0.95, 6);
    expect(controlProbability(0.001, 50)).toBe(0.05);
    expect(controlProbability(0.6, 50)).toBe(0.5);
  });
  test('drawControl takes only seed, post id and pi (AC-04-29, type level)', () => {
    expect(drawControl.length).toBe(3);
  });
});

describe('04 5.4 the gate (AC-04-22, value part)', () => {
  test('a = 9, interval excluding 1, q 0.12 is hidden; q 0.06 is shown', () => {
    const r = mantelHaenszel(STRATA);
    expect(profileGate(r, 0.12)).toBe(false);
    expect(profileGate(r, 0.06)).toBe(true);
    expect(profileGate({ ...r, controlsWith: 2 }, 0.06)).toBe(false);
    expect(profileGate({ ...r, casesWith: 7 }, 0.06)).toBe(false);
  });
});

describe('owned-set agreement (AC-04-21, prediction-science F5)', () => {
  test('MH from the full set and from a pi 0.1 case-control subsample agree within their 90% intervals', () => {
    // 8 creators x 400 posts; value v triples the breakout odds; deterministic draws from the hash
    const u = (k: string) => (drawControl('u', k, 0.5) ? 0.5 : 0) + (drawControl('w', k, 0.5) ? 0.25 : 0) + (drawControl('z', k, 0.5) ? 0.125 : 0) + (drawControl('q', k, 0.5) ? 0.0625 : 0) + (drawControl('r', k, 0.5) ? 0.03125 : 0);
    const full: { a: number; b: number; c: number; d: number }[] = [];
    const sub: { a: number; b: number; c: number; d: number }[] = [];
    for (let cr = 0; cr < 8; cr++) {
      const f = { a: 0, b: 0, c: 0, d: 0 };
      const s = { a: 0, b: 0, c: 0, d: 0 };
      for (let i = 0; i < 400; i++) {
        const id = `c${cr}-p${i}`;
        const hasV = u(`${id}|v`) < 0.4;
        const isCase = u(`${id}|y`) < (hasV ? 0.18 : 0.06);
        if (isCase) {
          if (hasV) { f.a++; s.a++; } else { f.b++; s.b++; }
        } else {
          if (hasV) f.c++;
          else f.d++;
          if (drawControl('seed-f5', id, 0.1)) {
            if (hasV) s.c++;
            else s.d++;
          }
        }
      }
      full.push(f);
      sub.push(s);
    }
    const a = mantelHaenszel(full);
    const b = mantelHaenszel(sub);
    expect(b.casesWith).toBeGreaterThanOrEqual(8);
    expect(a.lo!).toBeLessThanOrEqual(b.hi!);
    expect(b.lo!).toBeLessThanOrEqual(a.hi!);
    expect(a.or!).toBeGreaterThanOrEqual(b.lo!);
    expect(a.or!).toBeLessThanOrEqual(b.hi!);
  });
});

describe('a family under 8 cases writes no profile version (AC-04-22, family part)', () => {
  test('7 cases and 20 controls: distillProfiles stores nothing', async () => {
    const { distillProfiles } = await import('@/lib/lab/distill');
    const { emptyStore } = await import('./helpers/lab-measure-world');
    const { store } = emptyStore();
    const now = new Date('2026-10-10T12:00:00.000Z');
    store.sources.upsert({ id: 's', kind: 'tracked', platform: 'tiktok', handle: 's', url: null, displayName: 's', status: 'active', addedAt: now.toISOString(), reason: null, score: null });
    for (let i = 0; i < 27; i++) {
      const id = `p${i}`;
      const postedAt = new Date(now.getTime() - (10 + i) * 86_400_000).toISOString();
      store.posts.upsert({ id, sourceId: 's', platform: 'tiktok', externalId: id, url: 'u', postedAt, caption: '', contentType: 'video', thumbnailUrl: null, mediaUrl: null, durationS: 30, isOwned: false });
      store.dissections.upsert({ postId: id, format: 'tutorial_walkthrough', hookForm: 'results_first', emotionalTrigger: 'curiosity', hookChannel: 'spoken', hookText: 'x', firstFrameText: '', structureType: 'tutorial', beats: [], pacing: 'punchy', pillar: 'educational', ctaType: 'follow', tension: null, confidences: {}, qualityNotes: '', modelId: 'm', promptVersion: 'v', analysedAt: postedAt });
      store.measures.upsert({ postId: id, depth: 0.05, breakout: i < 7 ? 4 : 1, breakoutLo: null, breakoutHi: null, baselineN: 12, baselineConfidence: 'ok', reach: null, velocity: null, trajectory: null, quadrant: 'ideal', isBreakout: i < 7, computedAt: now.toISOString() });
      store.controls.upsert({ postId: id, role: i < 7 ? 'case' : 'control', stratum: `s|${postedAt.slice(0, 7)}`, samplingProb: i < 7 ? 1 : 0.1, eligibleN: 20, drawnN: 20, seed: 'x', verdictAgeH: 168, verdictRatio: 1, drawnAt: postedAt, status: 'dissected', measureVersion: 'measure-v2' });
    }
    expect(distillProfiles(store, { now })).toEqual([]);
    expect(store.profiles.latest()).toEqual([]);
  });
});
