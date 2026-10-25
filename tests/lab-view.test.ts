import { beforeAll, describe, expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { LAB_DDL } from '@/lib/db';
import { labStore, type LabStore } from '@/lib/lab/store';
import { FIXTURE_IDS, FIXTURE_MARKER, ensureFilmingFixtures, seedLabFixtures } from '@/lib/lab/fixtures';
import { LAB_TABS, buildLabView, buildLegacyScriptSheet, buildSpecimen, type BuildOpts, type LabView } from '@/lib/lab/view';

const NOW = new Date('2026-10-10T15:00:00.000Z');
const fresh = () => {
  const db = new Database(':memory:');
  db.exec(LAB_DDL);
  return labStore(db);
};
const FLAGS: BuildOpts = { configured: true, setupHref: '/integrations#apify', now: NOW };

let world: LabStore;
let view: LabView;
beforeAll(() => {
  world = fresh();
  seedLabFixtures(world, NOW);
  view = buildLabView(world, { ...FLAGS, tab: 'all', sample: true, fixtureName: 'sample', post: FIXTURE_IDS.firstPost, script: FIXTURE_IDS.script, idea: FIXTURE_IDS.idea });
});

describe('the fixture world is large enough for every tab and every threshold', () => {
  test('30 creators, ~1000 posts with snapshots, 8 clusters over 12 weeks, 3 families, 8 ideas, 3 scripts, runs and spend', () => {
    const c = world.counts();
    const creators = world.sources.all().filter((s) => s.kind !== 'feed');
    expect(creators.length).toBeGreaterThanOrEqual(30);
    expect(c.lab_posts).toBeGreaterThanOrEqual(900);
    expect(c.lab_post_metrics).toBeGreaterThan(c.lab_posts * 3);
    expect(world.clusters.all()).toHaveLength(8);
    expect(new Set(world.trendSnapshots.all().map((s) => s.day)).size).toBe(84);
    expect(world.profiles.latest()).toHaveLength(3);
    expect(world.ideas.all()).toHaveLength(12); // v2 world: the 8 v1 ideas plus 4 launch ideas (08.7.2)
    expect(world.scripts.all()).toHaveLength(3);
    expect(world.scripts.versions(FIXTURE_IDS.script).length).toBe(3);
    expect(c.lab_runs).toBeGreaterThan(100);
    expect(c.lab_spend).toBeGreaterThan(50);
    expect(world.priors.get(FIXTURE_MARKER)).not.toBeNull();
  });

  test('the real measures find breakouts, all four quadrants, and every timing', () => {
    const ms = world.measures.all();
    expect(ms.filter((m) => m.isBreakout).length).toBeGreaterThanOrEqual(50);
    expect(new Set(ms.map((m) => m.quadrant))).toEqual(new Set(['ideal', 'loyal', 'clickbait', 'dud', null]));
    const timings = new Map<string, string | null>();
    for (const s of world.trendSnapshots.all()) timings.set(s.clusterId, s.timing);
    expect(new Set(timings.values())).toEqual(new Set(['early', 'open', 'closing', 'closed']));
  });

  test('the tutorial profile shows features that pass the case-control gate; the others stay honest (04 5.4)', () => {
    const latest = world.profiles.latest();
    expect(latest.find((p) => p.formatFamily === 'tutorial_walkthrough')!.features.some((f) => f.shown)).toBe(true);
    for (const p of latest) {
      expect(p.method).toBe('case_control_mh_v1');
      expect(p.breakoutsN).toBeGreaterThanOrEqual(8);
      expect(p.controlsN).toBeGreaterThanOrEqual(8);
      for (const f of p.features.filter((x) => x.shown)) {
        expect(f.n).toBeGreaterThanOrEqual(8);
        expect(f.controlsWith).toBeGreaterThanOrEqual(3);
        expect(f.lo! > 1 || f.hi! < 1).toBe(true);
        expect(f.q!).toBeLessThanOrEqual(0.1);
      }
    }
  });

  test('deterministic for the same anchor hour', () => {
    const again = fresh();
    seedLabFixtures(again, new Date(NOW.getTime() + 20 * 60_000));
    expect(again.counts()).toEqual(world.counts());
    expect(again.measures.get(FIXTURE_IDS.firstPost)).toEqual(world.measures.get(FIXTURE_IDS.firstPost));
  });

  test('saves are honest-or-absent in the fixtures too: Instagram and YouTube carry null saves', () => {
    const byId = new Map(world.posts.all().map((p) => [p.id, p]));
    for (const [id, m] of world.metrics.latest()) {
      const p = byId.get(id)!;
      if (p.platform !== 'tiktok') expect(m.saves, id).toBeNull();
    }
  });
});

describe('buildLabView: states', () => {
  test('not configured: the frame and the setup href, no tab payloads', () => {
    const v = buildLabView(fresh(), { ...FLAGS, configured: false, tab: 'all' });
    expect(v.mode.state).toBe('not_configured');
    expect(v.mode.setupHref).toBe('/integrations#apify');
    for (const t of LAB_TABS) expect(v[t.id as keyof LabView], t.id).toBeUndefined();
    expect(v.runStrip).toBeNull();
  });

  test('configured but empty: Sources opens first and says "Add your accounts"', () => {
    const v = buildLabView(fresh(), { ...FLAGS, tab: 'all' });
    expect(v.mode.state).toBe('empty');
    expect(v.mode.defaultTab).toBe('sources');
    expect(v.sources?.emptyHint).toBe('Add your accounts');
    expect(v.today?.newBreakouts).toEqual([]);
    expect(v.today?.field.enough).toBe(false);
  });

  test('thin: a handful of posts renders, with numbers marked not enough', () => {
    const s = fresh();
    s.sources.upsert({ id: 's1', kind: 'owned', platform: 'tiktok', handle: 'me', url: null, displayName: 'Me', status: 'active', addedAt: '2026-09-01T00:00:00.000Z', reason: null, score: null });
    s.posts.upsert({ id: 'p1', sourceId: 's1', platform: 'tiktok', externalId: 'e1', url: 'https://example.com/1', postedAt: '2026-10-08T00:00:00.000Z', caption: 'hi', contentType: 'video', thumbnailUrl: null, mediaUrl: null, durationS: 30, isOwned: true });
    s.measures.upsert({ postId: 'p1', depth: 0.05, breakout: 4, breakoutLo: 2, breakoutHi: 8, baselineN: 3, baselineConfidence: 'low', reach: null, velocity: null, trajectory: null, quadrant: null, isBreakout: false, computedAt: NOW.toISOString() });
    const v = buildLabView(s, { ...FLAGS, tab: 'all', post: 'p1' });
    expect(v.mode.state).toBe('thin');
    expect(v.focus.post?.ladder).toMatchObject({ enough: false, label: 'not enough yet', ratio: null, index: 0 });
    expect(v.focus.post?.metrics.saves).toBeNull();
  });

  test('sample and Filming without a token still render (the badge is the UI’s job via fixtureName)', () => {
    const v = buildLabView(world, { ...FLAGS, configured: false, sample: true, fixtureName: 'F', tab: 'today' });
    expect(v.mode).toMatchObject({ state: 'ready', sample: true, fixtureName: 'F' });
    expect(v.today).toBeDefined();
    expect(v.breakouts).toBeUndefined(); // only the requested tab is built
  });
});

describe('buildLabView: the contract the UI lanes build on', () => {
  test('plain JSON: survives a round trip unchanged', () => {
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });

  test('Today: Field, profile hero, new breakouts, open trends, top 3 ideas, run strip', () => {
    const t = view.today!;
    expect(t.field.enough).toBe(true);
    expect(t.field.points.every((p) => p.x > 0 && p.y > 0 && p.r >= 0 && p.r <= 1)).toBe(true);
    expect(t.field.points.some((p) => p.owned)).toBe(true);
    expect(t.field.medians.breakout).not.toBeNull();
    expect(t.heroProfile?.headline).toMatch(/· n \d+/);
    expect(t.newBreakouts.length).toBeGreaterThan(0);
    expect(t.newBreakouts.every((s) => s.isNew && s.isBreakout && s.ladder.enough)).toBe(true);
    expect(t.openTrends.every((r) => r.timing === 'early' || r.timing === 'open')).toBe(true);
    expect(t.nextIdeas).toHaveLength(3);
    expect(view.runStrip?.lanes.map((l) => l.id)).toEqual(expect.arrayContaining(['instagram', 'tiktok', 'youtube', 'transcribe', 'dissect', 'distill']));
  });

  test('Strand: beats carry token names and percentages, the hook span and rehook ticks', () => {
    const withRehook = view.breakouts!.specimens.map((s) => s.strand).find((s) => s && s.rehookTicks.length > 0) ?? view.profile!.profiles.map((p) => p.strand).find((s) => s && s.rehookTicks.length);
    const strand = view.today!.newBreakouts[0].strand!;
    expect(strand.beats[0]).toMatchObject({ type: 'hook', startPct: 0, token: '--lab-beat-hook' });
    expect(strand.hook).toEqual({ startPct: 0, endPct: strand.beats[0].endPct });
    expect(strand.beats[strand.beats.length - 1].endPct).toBe(100);
    if (withRehook) expect(withRehook.rehookTicks[0]).toBeGreaterThan(0);
  });

  test('Ladder: AC2, nothing below baseline n 5 shows a ratio', () => {
    const cards = [...view.breakouts!.specimens, ...view.today!.newBreakouts];
    for (const c of cards) expect(c.ladder.n).toBeGreaterThanOrEqual(5);
    for (const p of world.posts.all().slice(0, 300)) {
      const sheet = buildSpecimen(world, p.id, { now: NOW })!;
      if (sheet.ladder.n < 5) expect(sheet.ladder).toMatchObject({ enough: false, text: null, label: 'not enough yet' });
      else if (sheet.ladder.ratio !== null) expect(sheet.ladder.label).toMatch(/x · (none|notable|strong|exceptional)$/);
    }
  });

  test('Viral profile: AC3, sentences quote lift and n; only shown features in the sentences and gaps', () => {
    for (const p of view.profile!.profiles) {
      expect(p.sentences.length).toBeGreaterThan(0);
      expect(p.sentences.join(' ')).not.toMatch(/—|–/);
      for (const g of p.gaps) expect(g.nicheLift).toBeGreaterThan(1);
      expect(p.versions.map((v) => v.version)).toEqual([4, 3, 2, 1]);
      expect(p.yoursVsNiche.map((y) => y.key)).toEqual(['breakout_rate', 'wpm', 'duration']);
    }
    const tut = view.profile!.profiles.find((p) => p.family === 'tutorial_walkthrough')!;
    expect(tut.label).toBe('AI tool tutorials · 30-60 s');
    // AC3: lift, n and the 90% interval on every statement
    expect(tut.sentences[0]).toMatch(/\(\d+(\.\d)?x the odds, n \d+, 90% \d+(\.\d)?x to \d+(\.\d)?x\)/);
  });

  test('Trends: 12 weeks, one series per cluster, rows with timing, coverage and angle exhaustion', () => {
    const tr = view.trends!;
    expect(tr.weeks).toHaveLength(12);
    expect(tr.series).toHaveLength(8);
    expect(tr.series.every((s) => s.values.length === 12 && s.cat >= 1 && s.cat <= 11)).toBe(true);
    expect(tr.rows).toHaveLength(8);
    expect(tr.rows.some((r) => r.coverage.covered)).toBe(true);
    expect(tr.rows.flatMap((r) => r.angles).length).toBeGreaterThan(8);
    expect(tr.feedItems.length).toBeGreaterThan(0);
  });

  test('Ideas: AC4, every card cites at least two real posts; an idea citing unknown ids is dropped', () => {
    const all = [...view.ideas!.open, ...view.ideas!.used, ...view.ideas!.dismissed];
    expect(all).toHaveLength(12); // v2 world: 8 v1 ideas plus 4 launch ideas (08.7.2)
    for (const i of all) expect(i.evidence.length).toBeGreaterThanOrEqual(2);
    const s = fresh();
    seedLabFixtures(s, NOW);
    const bad = s.ideas.get('fx-idea-2')!;
    s.ideas.upsert({ ...bad, evidence: [{ postId: 'nope-1', why: 'x' }, { postId: bad.evidence[0].postId, why: 'y' }] });
    const v = buildLabView(s, { ...FLAGS, tab: 'ideas' });
    expect(v.ideas!.open.map((i) => i.id)).not.toContain('fx-idea-2');
  });

  test('Scripts and the script sheet: budgets, deltas, failing checks on the offending section, profile strand', () => {
    expect(view.scripts!.rows).toHaveLength(3);
    const sheet = view.focus.script!;
    expect(sheet.version).toBe(3);
    expect(sheet.evidence.budget).toEqual({ durationS: 45, words: 124, wpm: 165 });
    const over = sheet.sections.filter((s) => s.over);
    expect(over.length).toBeGreaterThan(0);
    expect(over[0].deltaText).toMatch(/^\+\d+%$/);
    expect(over[0].failing.length).toBeGreaterThan(0);
    expect(sheet.gate.passed).toBe(false);
    expect(sheet.profileStrand).not.toBeNull();
    expect(sheet.hooks.filter((h) => h.chosen)).toHaveLength(1);
    const published = buildLegacyScriptSheet(world, 'fx-script-3', { now: NOW })!;
    expect(published.status).toBe('published');
    expect(published.publishedPost?.creator.owned).toBe(true);
    expect(published.outcomes.length).toBe(3);
    // mark published picks from your own posts since the draft (none once it is published)
    expect(published.publishCandidates).toEqual([]);
    expect(sheet.publishCandidates.length).toBeLessThanOrEqual(6);
    for (const c of sheet.publishCandidates) expect(c.creator.owned).toBe(true);
    expect(sheet.strand.beats.find((b) => b.type === 'cta')?.label).toBe('CTA');
  });

  test('Specimen sheet: transcript cut by beats, snapshots, why it worked', () => {
    const breakout = view.today!.newBreakouts[0];
    const sheet = buildSpecimen(world, breakout.postId, { now: NOW })!;
    expect(sheet.dissection?.hookFormLabel).toBeTruthy();
    expect(sheet.snapshots.length).toBeGreaterThan(0);
    if (sheet.transcript?.status === 'done') {
      expect(sheet.transcript.segments.map((s) => s.type)).toEqual(sheet.strand!.beats.map((b) => b.type));
    }
    for (const w of sheet.why) expect(w.lift).toBeGreaterThan(1);
    expect(buildSpecimen(world, 'no-such-post')).toBeNull();
  });

  test('Sources: owned, tracked, suggested with reasons, feeds, runs with cost, the spend meter and schedule', () => {
    const s = view.sources!;
    expect(s.owned).toHaveLength(4); // v2 (04 8): the owned X account joins the three v1 accounts
    expect(s.tracked.length).toBeGreaterThanOrEqual(24);
    expect(s.suggested.every((x) => x.reason && x.score !== null)).toBe(true);
    expect(s.feeds.length).toBe(4);
    // v2 world: the newest run is the pending one (no cost yet); every finished run carries its cost
    expect(s.runs.find((r) => r.costText !== null)).toMatchObject({ costText: expect.stringMatching(/^\$|^dry$|null/) });
    expect(s.spend.lines.map((l) => l.provider)).toEqual(['apify', 'stt', 'llm']);
    expect(s.schedule.agent).toBe('glados.agent.lab');
    expect(s.emptyHint).toBeNull();
  });

  test('Breakouts filters narrow the field and the list', () => {
    const v = buildLabView(world, { ...FLAGS, tab: 'breakouts', filters: { platform: 'tiktok', windowDays: 90 } });
    expect(v.breakouts!.applied).toMatchObject({ platform: 'tiktok', windowDays: 90 });
    expect(v.breakouts!.specimens.every((s) => s.platform === 'tiktok')).toBe(true);
    expect(v.breakouts!.field.points.every((p) => p.platform === 'tiktok')).toBe(true);
  });
});

describe('Filming seeding (ensureFilmingFixtures)', () => {
  test('seeds an empty store, keeps a fresh world, refreshes a stale one', () => {
    const s = fresh();
    expect(ensureFilmingFixtures(s, NOW)).toBe('seeded');
    expect(ensureFilmingFixtures(s, new Date(NOW.getTime() + 3_600_000))).toBe('kept');
    expect(ensureFilmingFixtures(s, new Date(NOW.getTime() + 3 * 86_400_000))).toBe('refreshed');
    expect(s.counts().lab_posts).toBeGreaterThan(900);
  });

  test('never touches lab data that is not a fixture world', () => {
    const s = fresh();
    s.sources.upsert({ id: 'mine', kind: 'owned', platform: 'tiktok', handle: 'someone', url: null, displayName: 'x', status: 'active', addedAt: '2026-01-01T00:00:00.000Z', reason: null, score: null });
    expect(ensureFilmingFixtures(s, NOW)).toBe('kept');
    expect(s.counts().lab_posts).toBe(0);
  });
});

describe('Breakouts numbers agree with each other', () => {
  test('the tab count is the default 30-day total (owned included), and each quadrant chip matches its Field corner', () => {
    const b = view.breakouts!;
    expect(b.applied.windowDays).toBe(30);
    expect(view.tabs.find((t) => t.id === 'breakouts')!.count).toBe(b.total);
    for (const q of b.filters.quadrants) expect(q.n).toBe(b.field.counts[q.id]);
  });
});
