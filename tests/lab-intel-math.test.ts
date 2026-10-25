import { describe, expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { LAB_DDL } from '@/lib/db';
import { labStore, type LabStore } from '@/lib/lab/store';
import type { LabProfile } from '@/lib/schemas';
import { lift, wilson, timing, momentum } from '@/lib/lab/measures';
import { liftEvidence, profileSentences } from '@/lib/lab/distill';
import { mixContrast, voiceStats, type FamilyMix } from '@/lib/lab/dna';
import { assignClusters, cosine, embed, matchText, MATCH_THRESHOLD } from '@/lib/lab/clusters';
import { angleStats } from '@/lib/lab/trends';
import { dismissPenalty, fitScore } from '@/lib/lab/ideas';
import { PRIOR_THRESHOLDS, recomputePriors, effective } from '@/lib/lab/priors';
import { publishCandidates, recordOutcomes, textSimilarity } from '@/lib/lab/outcomes';

const fresh = (): LabStore => {
  const db = new Database(':memory:');
  db.exec(LAB_DDL);
  return labStore(db);
};
const NOW = new Date('2026-10-10T12:00:00.000Z');
const iso = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();

describe('lift with a Wilson interval (SPEC §4.7, AC3)', () => {
  test('Wilson 90% interval brackets the rate and narrows with n', () => {
    const [lo, hi] = wilson(8, 20)!;
    expect(lo).toBeLessThan(0.4);
    expect(hi).toBeGreaterThan(0.4);
    const [lo2, hi2] = wilson(80, 200)!;
    expect(hi2 - lo2).toBeLessThan(hi - lo);
    expect(wilson(0, 0)).toBeNull();
  });

  test('shows only with n >= 8 breakouts AND an interval clear of 1.0', () => {
    // base rate 10%: 8 of 20 with the value = 4x, interval well above 1
    expect(lift(8, 20, 50, 500)).toMatchObject({ n: 8, shown: true });
    // 7 breakouts: never shown, however strong
    expect(lift(7, 14, 50, 500).shown).toBe(false);
    // 9 of 80 = 1.1x: interval includes 1.0, not shown
    const weak = lift(9, 80, 50, 500);
    expect(weak.lo!).toBeLessThan(1);
    expect(weak.hi!).toBeGreaterThan(1);
    expect(weak.shown).toBe(false);
    // a reliably low value shows too (lists underperform here)
    const low = lift(8, 200, 100, 500);
    expect(low.hi!).toBeLessThan(1);
    expect(low.shown).toBe(true);
  });
});

describe('profile sentences', () => {
  const profile: LabProfile = {
    id: 'p', formatFamily: 'tutorial_walkthrough', label: 'AI tool tutorials', version: 3, windowDays: 90, postsN: 300, breakoutsN: 40,
    features: [
      { feature: 'hook_form', value: 'results_first', total: 60, n: 22, lift: 2.9, lo: 2.1, hi: 3.8, shown: true },
      { feature: 'hook_form', value: 'open_loop', total: 40, n: 9, lift: 1.7, lo: 1.1, hi: 2.4, shown: true },
      { feature: 'wpm', value: '160-185 wpm', total: 80, n: 20, lift: 1.9, lo: 1.3, hi: 2.6, shown: true },
      { feature: 'structure_type', value: 'listicle', total: 90, n: 8, lift: 0.6, lo: 0.4, hi: 0.85, shown: true },
      { feature: 'cta_type', value: 'link', total: 30, n: 7, lift: 3.1, lo: 1.5, hi: 4.4, shown: false },
    ],
    strand: [{ type: 'hook', startPct: 0, endPct: 10, summary: '' }, { type: 'demo', startPct: 10, endPct: 85, summary: '' }, { type: 'cta', startPct: 85, endPct: 100, summary: '' }],
    stats: { wpm: [160, 185], durationS: [35, 55] },
    createdAt: NOW.toISOString(),
  };
  const s = profileSentences(profile, (_f, v) => v.replaceAll('_', ' '));

  test('every statement quotes lift, n and the interval; hidden features never appear', () => {
    expect(s[0]).toBe('Breakouts open results first (2.9x, n 22, 90% 2.1x to 3.8x) and talk at 160-185 wpm (1.9x, n 20, 90% 1.3x to 2.6x).');
    expect(s.join(' ')).not.toMatch(/link CTA|3\.1x/);
    expect(s).toContain('Listicle structures underperform here (0.6x, n 8, 90% 0.4x to 0.9x).');
    expect(s).toContain('The usual shape is hook → demo → cta.');
  });

  test('one value per feature per sentence, no dashes', () => {
    expect(s[0]).not.toMatch(/open loop/);
    expect(s.join(' ')).not.toMatch(/[—–]/);
    expect(liftEvidence({ lift: 12.4, n: 9, lo: 10.2, hi: 15 })).toBe('(12x, n 9, 90% 10x to 15x)');
  });
});

describe('Your DNA: voice stats and format contrast', () => {
  test('sentence length, openers, transitions (no double count of "and so"), fillers', () => {
    const v = voiceStats([
      { text: 'So I built this. And so the bill dropped because the cache works. Um, now watch.', wpm: 170 },
      { text: 'So here is the setup. It is like five lines.', wpm: 160 },
    ]);
    expect(v.transcripts).toBe(2);
    expect(v.sentence.n).toBe(5);
    expect(v.wpm).toMatchObject({ median: 165, n: 2 });
    expect(v.openers[0]).toMatchObject({ word: 'so', n: 2 });
    const t = Object.fromEntries(v.transitions.map((x) => [x.phrase, x.n]));
    expect(t['and so']).toBe(1);
    expect(t.so).toBe(2);
    expect(t.because).toBe(1);
    expect(v.fillers.map((f) => f.phrase).sort()).toEqual(['like', 'um']);
    expect(v.fillerRate).toBeCloseTo((2 / 26) * 100, 1);
  });

  test('the contrast needs n >= 5 on both sides', () => {
    const m = (family: string, posts: number, rate: number): FamilyMix => ({ family, label: family === 'a' ? 'Tutorials' : 'Talking heads', posts, share: 0.5, breakouts: Math.round(posts * rate), breakoutRate: rate, baselineViews: 1000, baselineN: posts, medianDurationS: 40 });
    expect(mixContrast([m('a', 20, 0.24), m('b', 10, 0.1)])).toMatchObject({ best: 'a', worst: 'b', ratio: 2.4 });
    expect(mixContrast([m('a', 20, 0.24), m('b', 4, 0.1)])).toBeNull();
  });
});

describe('clusters persist by centroid matching (SPEC §4.10)', () => {
  test('the local embedding is deterministic and separates topics', () => {
    expect(Array.from(embed('agent memory')!)).toEqual(Array.from(embed('agent memory')!));
    expect(cosine(embed('agent memory')!, embed('memory for AI agents')!)).toBeGreaterThan(MATCH_THRESHOLD);
    expect(cosine(embed('agent memory')!, embed('voice cloning')!)).toBeLessThan(0.2);
    expect(embed('the and of')).toBeNull();
  });

  test('new topics create clusters, similar ones join them, a second run changes nothing, ids are stable', () => {
    const s = fresh();
    const add = (id: string, topic: string) => {
      s.sources.upsert({ id: 'src', kind: 'tracked', platform: 'tiktok', handle: 'x', url: null, displayName: 'x', status: 'active', addedAt: iso(30), reason: null, score: null });
      s.posts.upsert({ id, sourceId: 'src', platform: 'tiktok', externalId: id, url: `https://example.invalid/${id}`, postedAt: iso(1), caption: '', contentType: 'video', thumbnailUrl: null, mediaUrl: null, durationS: 40, isOwned: false });
      s.topics.replaceForPost(id, [{ postId: id, topic, angle: '', isPrimary: true, clusterId: null }]);
    };
    add('p1', 'agent memory');
    add('p2', 'voice cloning');
    add('p3', 'memory for AI agents');
    const r1 = assignClusters(s, { now: NOW });
    expect(r1.created).toHaveLength(2);
    expect(r1.assigned).toBe(3);
    const cl = new Map(s.topics.all().map((t) => [t.postId, t.clusterId]));
    expect(cl.get('p3')).toBe(cl.get('p1'));
    expect(cl.get('p2')).not.toBe(cl.get('p1'));
    expect(s.clusters.centroid(cl.get('p1')!)).not.toBeNull();
    expect(s.topics.embedding('p1', 'agent memory')).not.toBeNull();
    expect(assignClusters(s, { now: NOW })).toMatchObject({ assigned: 0, created: [] });
    add('p4', 'cloning your voice');
    assignClusters(s, { now: NOW });
    expect(s.topics.forPost('p4')[0].clusterId).toBe(cl.get('p2'));
    expect(matchText(s, 'Show HN: a memory layer for AI agents', 0.35)?.id).toBe(cl.get('p1'));
  });
});

describe('angle exhaustion, momentum, timing', () => {
  test('exhausted = 5+ tries and nothing at 3x; whitespace = tried at most twice with a breakout', () => {
    const rows = [
      ...Array.from({ length: 6 }, () => ({ angle: 'the launch recap', breakout: 1.2, isBreakout: false })),
      { angle: 'the cost breakdown', breakout: 6.1, isBreakout: true },
    ];
    const a = angleStats(rows);
    expect(a[0]).toMatchObject({ angle: 'the cost breakdown', whitespace: true, exhausted: false, best: 6.1 });
    expect(a[1]).toMatchObject({ angle: 'the launch recap', posts: 6, exhausted: true, whitespace: false });
  });

  test('momentum is this week over the trailing 4-week median; timing reads early, open, closing, closed', () => {
    expect(momentum(12, [4, 6, 6, 8])).toBe(2);
    expect(timing({ current: 12, trailing4: [3, 3, 4, 4], creators: 3, sourceCount: 1, breakoutRate: 0.3, breakoutRatePrev: 0.2 })).toBe('early');
    expect(timing({ current: 12, trailing4: [3, 3, 4, 4], creators: 8, sourceCount: 4, breakoutRate: 0.3, breakoutRatePrev: 0.2 })).toBe('open');
    expect(timing({ current: 10, trailing4: [10, 11, 10, 9], creators: 15, sourceCount: 4, breakoutRate: 0.1, breakoutRatePrev: 0.2 })).toBe('closing');
    expect(timing({ current: 2, trailing4: [10, 11, 10, 9], creators: 3, sourceCount: 1, breakoutRate: 0, breakoutRatePrev: 0.1 })).toBe('closed');
  });
});

describe('fit and dismissal ranking (SPEC §4.11)', () => {
  test('fit rewards your main format, your pillar, an uncovered topic and an early window', () => {
    const best = fitScore({ familyShare: 0.6, maxFamilyShare: 0.6, pillarOverlap: 1, covered: false, coveredBeat: null, timing: 'early', penalty: 0 });
    expect(best).toBe(1);
    const late = fitScore({ familyShare: 0.6, maxFamilyShare: 0.6, pillarOverlap: 1, covered: true, coveredBeat: true, timing: 'closed', penalty: 0 });
    expect(late).toBe(0.66);
    expect(fitScore({ familyShare: 0, maxFamilyShare: 0.6, pillarOverlap: 0, covered: false, coveredBeat: null, timing: null, penalty: 0.5 })).toBe(0);
  });

  test('dismiss reasons cost the cluster and, for "not my format", the family', () => {
    const d = [{ clusterId: 'c1', formatFamily: 'skit', dismissReason: 'not my format' }, { clusterId: 'c1', formatFamily: 'talking_head', dismissReason: 'Window closed' }];
    expect(dismissPenalty(d, 'c1', 'skit')).toBe(0.38);
    expect(dismissPenalty(d, 'c2', 'skit')).toBe(0.12);
    expect(dismissPenalty(d, 'c2', 'tutorial_walkthrough')).toBe(0);
  });
});

describe('priors replace the niche default only past their thresholds (SPEC §4.13)', () => {
  const seedOwn = (s: LabStore, n: number, opts: { form?: string; withTranscripts?: number } = {}) => {
    s.sources.upsert({ id: 'own', kind: 'owned', platform: 'tiktok', handle: 'me', url: null, displayName: 'me', status: 'active', addedAt: iso(200), reason: null, score: null });
    for (let i = 0; i < n; i++) {
      const id = `o${i}`;
      s.posts.upsert({ id, sourceId: 'own', platform: 'tiktok', externalId: id, url: `https://example.invalid/${id}`, postedAt: iso(i + 1), caption: 'agent memory setup', contentType: 'video', thumbnailUrl: null, mediaUrl: null, durationS: 40 + i, isOwned: true });
      s.dissections.upsert({ postId: id, format: 'tutorial_walkthrough', hookForm: (opts.form ?? 'results_first') as 'results_first', emotionalTrigger: 'curiosity', hookChannel: 'spoken', hookText: 'x', firstFrameText: '', structureType: 'tutorial', beats: [], pacing: 'conversational', pillar: 'educational', ctaType: 'follow', tension: null, confidences: {}, qualityNotes: '', modelId: 'm', promptVersion: 'v', analysedAt: iso(0) });
      s.measures.upsert({ postId: id, depth: 0.05, breakout: i % 3 === 0 ? 4 : 1, breakoutLo: null, breakoutHi: null, baselineN: 12, baselineConfidence: 'ok', reach: null, velocity: null, trajectory: null, quadrant: 'ideal', isBreakout: i % 3 === 0, computedAt: iso(0) });
      if (i < (opts.withTranscripts ?? n)) s.transcripts.upsert({ postId: id, text: 'So here is the setup.', wordCount: 5, wpm: 165 + (i % 3), provider: 'test', costUsd: 0, status: 'done' });
    }
  };

  test('wpm supersedes at n 5, not at n 4', () => {
    const a = fresh();
    seedOwn(a, 4);
    expect(recomputePriors(a, { now: NOW }).find((p) => p.key === 'yours:wpm')).toMatchObject({ n: 4, supersedesDefault: false });
    expect(effective(a, 'yours:wpm', { value: 172, n: 30 }, 160)).toEqual({ value: 172, source: 'niche', n: 30 });
    const b = fresh();
    seedOwn(b, 5);
    expect(recomputePriors(b, { now: NOW }).find((p) => p.key === 'yours:wpm')).toMatchObject({ n: 5, supersedesDefault: true });
    expect(effective(b, 'yours:wpm', { value: 172, n: 30 }, 160).source).toBe('prior');
  });

  test('hook lift needs n 5 for the form AND 20 hooks in total; duration needs n 15 in the format', () => {
    const a = fresh();
    seedOwn(a, 19);
    const pa = recomputePriors(a, { now: NOW });
    expect(pa.find((p) => p.key === 'yours:hook_lift:results_first')).toMatchObject({ n: 19, supersedesDefault: false });
    expect(pa.find((p) => p.key === 'yours:duration:tutorial_walkthrough')).toMatchObject({ n: 19, supersedesDefault: true });
    const b = fresh();
    seedOwn(b, 20);
    expect(recomputePriors(b, { now: NOW }).find((p) => p.key === 'yours:hook_lift:results_first')?.supersedesDefault).toBe(true);
    const c = fresh();
    seedOwn(c, 14);
    expect(recomputePriors(c, { now: NOW }).find((p) => p.key === 'yours:duration:tutorial_walkthrough')?.supersedesDefault).toBe(false);
    expect(PRIOR_THRESHOLDS).toEqual({ wpm: 5, hookLiftPerForm: 5, hookLiftTotal: 20, durationPerFormat: 15 });
  });

  test('outcomes append only when the published post has a newer read; candidates rank by similarity', () => {
    const s = fresh();
    seedOwn(s, 3);
    s.ideas.upsert({ id: 'i', title: 'Agent memory', clusterId: null, angle: 'the cost', tension: null, formatFamily: 'tutorial_walkthrough', strand: [], hookRecs: [], evidence: [], timing: null, fit: 0.5, thin: true, status: 'open', dismissReason: null, createdAt: iso(10), actedOnAt: null });
    s.scripts.upsert({ id: 's', ideaId: 'i', title: 't', status: 'draft', publishedPostId: null, createdAt: iso(10) });
    s.scripts.addVersion({ scriptId: 's', version: 1, body: { durationS: 40, wpm: 160, hooks: [{ form: 'results_first', trigger: 'curiosity', spoken: 'Here is the agent memory setup', onScreen: '', words: 6 }], hookChoice: 0, sections: [{ type: 'demo', startPct: 0, endPct: 100, spoken: 'So here is the setup.', onScreen: '', visualNote: '' }], cta: '', caption: '', titles: [] }, gate: { passed: true, checks: [], scores: null }, createdAt: iso(10), editDiff: null });
    const cands = publishCandidates(s, 's');
    expect(cands.length).toBe(3);
    expect(cands[0].similarity).toBeGreaterThan(0);
    expect(textSimilarity('agent memory setup', 'voice cloning')).toBe(0);
    s.scripts.markPublished('s', 'o0');
    expect(recordOutcomes(s)).toHaveLength(0); // no read yet
    s.metrics.add({ postId: 'o0', capturedAt: iso(0.5), views: 900, likes: 50, comments: 3, shares: 1, saves: 2 });
    expect(recordOutcomes(s)).toHaveLength(1);
    expect(recordOutcomes(s)).toHaveLength(0); // same read
    s.metrics.add({ postId: 'o0', capturedAt: iso(0.1), views: 1500, likes: 80, comments: 4, shares: 1, saves: 3 });
    expect(recordOutcomes(s)).toEqual([expect.objectContaining({ scriptId: 's', postId: 'o0', breakout: 4 })]);
  });
});
