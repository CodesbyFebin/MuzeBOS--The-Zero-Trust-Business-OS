import { describe, expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { LAB_DDL } from '@/lib/db';
import { labStore, type LabStore } from '@/lib/lab/store';
import { LaunchAngleSchema, type LabEvent, type LabEventCoverage } from '@/lib/schemas';
import { newEvent } from '@/lib/lab/radar/events';
import { activeTrackedCount, coverageShare, familyVersionMatch, matchCoverage } from '@/lib/lab/radar/coverage';
import { ALL_TAKEN_COPY, ANGLE_PRIOR_ORDER, angleByRule, angleMap, angleOwnStats, recommendAngle, takenAngles, type AngleOwnStats } from '@/lib/lab/radar/angles';
import { leadTimeTable } from '@/lib/lab/radar/leadtime';
import { eventSheetView, radarView, windowCardView } from '@/lib/lab/radar/view';

const fresh = () => {
  const db = new Database(':memory:');
  db.exec(LAB_DDL);
  return labStore(db);
};
const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
const OPTS = { dry: false, sample: false, paused: null, tz: 'UTC', apifyConfigured: false, githubToken: false, phToken: false, env: {} };

/** n tracked creators, each with one post at `postedH[i]` hours after t0 and caption `caption(i)`. */
function world(s: LabStore, t0: number, n: number, opts: { postedH: (i: number) => number; caption: (i: number) => string; ratio?: (i: number) => number | null; owned?: boolean }) {
  for (let i = 0; i < n; i++) {
    const sid = `src-${i}`;
    s.sources.upsert({ id: sid, kind: 'tracked', platform: 'youtube', handle: `creator${i}`, url: null, displayName: `Creator ${i}`, status: 'active', addedAt: iso(t0 - 90 * 24 * H), reason: null, score: null });
    const pid = `post-${i}`;
    const postedAt = iso(t0 + opts.postedH(i) * H);
    s.posts.upsert({ id: pid, sourceId: sid, platform: 'youtube', externalId: pid, url: '', postedAt, caption: opts.caption(i), contentType: 'video', thumbnailUrl: null, mediaUrl: null, durationS: 60, isOwned: false });
    const r = opts.ratio?.(i) ?? null;
    if (r !== null) s.measures.upsert({ postId: pid, depth: null, breakout: r, breakoutLo: null, breakoutHi: null, baselineN: 8, baselineConfidence: 'ok', reach: null, velocity: null, trajectory: null, quadrant: null, isBreakout: r >= 3, computedAt: iso(t0 + (opts.postedH(i) + 24) * H) });
  }
}

function confirmed(s: LabStore, name: string, t0: number, over: Partial<LabEvent> = {}): LabEvent {
  const e = newEvent(name, iso(t0), new Date(t0), {
    status: 'confirmed', t0: iso(t0), confirmedAt: iso(t0 + H), windowState: 'open', windowOpensAt: iso(t0), windowClosingAt: iso(t0 + 72 * H), windowClosesAt: iso(t0 + 168 * H),
    windowLog: [{ at: iso(t0), from: null, to: 'open', reason: 'confirmed' }], ...over,
  });
  s.events.upsert(e);
  return e;
}

describe('AC-05-23, AC-05-24 matchCoverage', () => {
  const t0 = Date.parse('2026-10-01T09:00:00Z');
  test('C1 and C2 make high rows; C3 makes low rows excluded from share and rank until confirmed', () => {
    const s = fresh();
    world(s, t0, 3, { postedH: (i) => 10 + i, caption: (i) => ['Sample Model 7 first look', 'I tested the model 7 from sample all day', 'my take on the news'][i] });
    const e = confirmed(s, 'Sample Model 7', t0, { clusterId: 'cl-1' });
    s.topics.replaceForPost('post-2', [{ postId: 'post-2', topic: 'ai news', angle: 'news', isPrimary: true, clusterId: 'cl-1' }]);
    matchCoverage(s, new Date(t0 + 48 * H));
    const rows = s.eventCoverage.forEvent(e.id);
    const by = new Map(rows.map((r) => [r.postId, r]));
    expect(by.get('post-0')).toMatchObject({ matchRule: 'name', confidence: 'high', angle: 'first_look' });
    expect(by.get('post-1')).toMatchObject({ matchRule: 'family_version', confidence: 'high' });
    expect(by.get('post-2')).toMatchObject({ matchRule: 'cluster', confidence: 'low', confirmed: null, creatorRank: null });
    expect(coverageShare(rows, 3).creators).toBe(2);
    // Brody confirms the low row: it now counts
    s.eventCoverage.upsert({ ...by.get('post-2')!, confirmed: true });
    matchCoverage(s, new Date(t0 + 49 * H));
    expect(coverageShare(s.eventCoverage.forEvent(e.id), 3).creators).toBe(3);
  });

  test('wave position and creator rank: pre before t0, first while open, follow after', () => {
    const s = fresh();
    world(s, t0, 4, { postedH: (i) => [-5, 3, 20, 100][i], caption: () => 'Sample Model 7 is here' });
    const e = confirmed(s, 'Sample Model 7', t0, { windowLog: [{ at: iso(t0), from: null, to: 'open', reason: 'confirmed' }, { at: iso(t0 + 72 * H), from: 'open', to: 'closing', reason: 'clock' }] });
    matchCoverage(s, new Date(t0 + 120 * H));
    const rows = new Map(s.eventCoverage.forEvent(e.id).map((r) => [r.postId, r]));
    expect([0, 1, 2, 3].map((i) => rows.get(`post-${i}`)!.wavePosition)).toEqual(['pre', 'first', 'first', 'follow']);
    expect([0, 1, 2, 3].map((i) => rows.get(`post-${i}`)!.creatorRank)).toEqual([1, 2, 3, 4]);
    expect(rows.get('post-0')!.hoursSinceT0).toBe(-5);
  });

  test('family_version needs every token within 40 characters', () => {
    expect(familyVersionMatch('the new gpt 6 astra is out', 'gpt-6-astra')).toBe(true);
    expect(familyVersionMatch('gpt is great. ' + 'x'.repeat(60) + ' version 6 astra', 'gpt-6-astra')).toBe(false);
  });
});

describe('AC-05-25 angleByRule (12.2 table)', () => {
  test.each([
    ['I Spent 100 Hours With GPT-6 Astra', 'hours_spent'],
    ['Claude 5 vs GPT-6: which is better?', 'comparison'],
    ["How I'd make money with Astra", 'money'],
    ['Jev is HERE. How to use it', 'how_to'],
    ['28 Insane Things Astra Can Do', 'real_examples'],
    ['GPT-6 Astra: first look', 'first_look'],
    ['Astra changes everything', 'other'],
  ])('%s', (title, angle) => expect(angleByRule(title)).toBe(angle));
});

describe('AC-05-26 recommendAngle', () => {
  const none = new Set<never>();
  const allN = (n: number, medians: Partial<Record<string, number>> = {}): AngleOwnStats => Object.fromEntries(ANGLE_PRIOR_ORDER.map((a) => [a, { median: medians[a] ?? 1, n }]));
  test('follows ANGLE_PRIOR_ORDER; own order only when all 7 have n >= 5', () => {
    expect(recommendAngle({ taken: none, windowState: 'open', own: {} }).angle).toBe('real_examples');
    expect(recommendAngle({ taken: none, windowState: 'open', own: { ...allN(5, { money: 3 }), drama: { median: 9, n: 4 } } }).angle).toBe('real_examples');
    expect(recommendAngle({ taken: none, windowState: 'open', own: allN(5, { money: 3 }) }).angle).toBe('money');
  });
  test('skips taken angles; how_to first when closing or closed', () => {
    expect(recommendAngle({ taken: new Set(['real_examples', 'first_look']), windowState: 'open', own: {} }).angle).toBe('hours_spent');
    expect(recommendAngle({ taken: none, windowState: 'closing', own: {} }).angle).toBe('how_to');
    expect(recommendAngle({ taken: none, windowState: 'closed', own: {} }).angle).toBe('how_to');
  });
  test('all taken and no own n 5: first_look with the all-taken copy; never other or null', () => {
    const r = recommendAngle({ taken: new Set(ANGLE_PRIOR_ORDER), windowState: 'open', own: {} });
    expect(r).toEqual({ angle: 'first_look', allTaken: true, copy: ALL_TAKEN_COPY });
    expect(recommendAngle({ taken: new Set(ANGLE_PRIOR_ORDER), windowState: 'open', own: { comparison: { median: 2, n: 6 } } }).angle).toBe('comparison');
  });
});

describe('AC-05-26b one angle end to end (the parts lane R owns)', () => {
  test('Event sheet recommended angle, Window card event and recommendAngle agree; howto is not an angle', () => {
    const s = fresh();
    const t0 = Date.parse('2026-10-11T00:00:00Z');
    world(s, t0, 6, { postedH: (i) => 2 + i, caption: (i) => (i < 3 ? 'Sample Model 7: real examples' : 'Sample Model 7 first look') });
    const e = confirmed(s, 'Sample Model 7', t0);
    s.priors.set({ key: 'job:radar.hn', value: { lastAt: iso(t0), lastOkAt: iso(t0), lastDetail: '', fails: 0, skippedReason: null }, n: 0, supersedesDefault: false, updatedAt: iso(t0) });
    const now = new Date(t0 + 12 * H);
    matchCoverage(s, now);
    const sheet = eventSheetView(s, e.id, now, OPTS)!;
    const rec = recommendAngle({ taken: takenAngles(s.eventCoverage.forEvent(e.id)), windowState: 'open', own: angleOwnStats(s, now) });
    expect(sheet.recommendedAngle).toBe(rec.angle);
    expect(sheet.recommendedAngle).toBe('hours_spent');
    expect(sheet.angles.find((a) => a.recommended)!.angle).toBe('hours_spent');
    const card = windowCardView(s, now, OPTS);
    expect(card.kind).toBe('open');
    expect(card.kind === 'open' && card.eventId).toBe(e.id);
    expect(LaunchAngleSchema.safeParse('howto').success).toBe(false);
  });
});

describe('AC-05-27 view numbers under n 5 render not enough yet', () => {
  test('angle cells, lead time and wave lift', () => {
    const s = fresh();
    const t0 = Date.parse('2026-10-11T00:00:00Z');
    world(s, t0, 3, { postedH: (i) => 8 + i, caption: () => 'Sample Model 7 first look', ratio: () => 4 });
    const e = confirmed(s, 'Sample Model 7', t0);
    const now = new Date(t0 + 40 * H);
    matchCoverage(s, now);
    const sheet = eventSheetView(s, e.id, now, OPTS)!;
    const fl = sheet.angles.find((a) => a.angle === 'first_look')!;
    expect(fl.n).toBe(3);
    expect(fl.medianRatio).toBeNull();
    expect(sheet.noveltyPrior).toBe('Prior: not enough yet');
    const rv = radarView(s, now, OPTS);
    expect(rv.leadTime.rows.every((r) => r.n >= 5 || (r.label === 'not enough yet' && r.medianLeadH === null))).toBe(true);
    expect(rv.leadTime.firedBeforePct).toBeNull();
    expect(rv.waveLift.label).toBe('not enough yet');
    expect(rv.waveLift.firstMedian).toBeNull();
    expect(rv.leadTime.classRecord).toBe('Class rule: 13 of 13 on seed events, not enough yet on your events');
  });
});

describe('AC-05-28 leadTimeTable', () => {
  test('median lead and share leading on 6 events; under n 5 not enough yet', () => {
    const s = fresh();
    const base = Date.parse('2026-09-01T00:00:00Z');
    // 6 events; hn first seen 10 h before the first creator post on 5 of them, 2 h after on 1
    for (let k = 0; k < 6; k++) {
      const t0 = base + k * 72 * H;
      const e = confirmed(s, `Sample Launch ${k + 1}`, t0);
      const lead = k === 5 ? -2 : 10;
      s.eventPings.upsert({ id: `hn:${k}`, source: 'hn', family: 'hn', externalId: String(k), eventId: e.id, matchRule: 'key', name: null, nameKey: null, title: '', url: '', author: null, vendor: null, sourceTime: null, firstSeenAt: iso(t0 + (12 - lead) * H), lastSeenAt: iso(t0), prevSeenAt: null, metricFirst: null, metricPrev: null, metricLast: null, rank: null, velocityPerH: null, robustZ: null, isLaunch: false, isBaseline: false, qualifies: true, qualifyReason: null, fakeStar: null, fakeStarInfo: null, lexicon: true, dry: false });
      if (k < 2) s.eventPings.upsert({ id: `vendor:${k}`, source: 'vendor', family: 'vendor', externalId: String(k), eventId: e.id, matchRule: 'key', name: null, nameKey: null, title: '', url: '', author: null, vendor: null, sourceTime: null, firstSeenAt: iso(t0), lastSeenAt: iso(t0), prevSeenAt: null, metricFirst: null, metricPrev: null, metricLast: null, rank: null, velocityPerH: null, robustZ: null, isLaunch: true, isBaseline: false, qualifies: true, qualifyReason: null, fakeStar: null, fakeStarInfo: null, lexicon: true, dry: false });
      const cov: LabEventCoverage = { eventId: e.id, postId: `p${k}`, sourceId: `s${k}`, platform: 'youtube', isOwned: false, postedAt: iso(t0 + 12 * H), hoursSinceT0: 12, waveN: 1, wavePosition: 'first', creatorRank: 1, matchRule: 'name', confidence: 'high', confirmed: null, angle: 'first_look', angleSource: 'rule', ratio: 4, ratioAgeH: 24, isBreakout: true, computedAt: iso(t0) };
      s.eventCoverage.upsert(cov);
    }
    const t = leadTimeTable(s, new Date(base + 30 * 24 * H));
    const hn = t.rows.find((r) => r.family === 'hn')!;
    expect(hn).toMatchObject({ n: 6, medianLeadH: 10, shareLeading: 0.83 });
    expect(hn.label).toBe('10h ahead, leads 83% (n 6)');
    const vendor = t.rows.find((r) => r.family === 'vendor')!;
    expect(vendor).toMatchObject({ n: 2, label: 'not enough yet' });
    expect(t.firedBeforeN).toBe(6);
    expect(t.firedBeforePct).toBe(100);
  });
});

describe('active tracked count', () => {
  test('tracked, active, a post in the last 30 days', () => {
    const s = fresh();
    const t0 = Date.parse('2026-10-11T00:00:00Z');
    world(s, t0, 3, { postedH: (i) => (i === 2 ? -40 * 24 : 1), caption: () => '' });
    s.sources.setStatus('src-1', 'paused');
    expect(activeTrackedCount(s, new Date(t0 + 2 * H))).toBe(1);
    expect(angleMap({ windowState: 'open' }, [], {})).toHaveLength(7);
  });
});
