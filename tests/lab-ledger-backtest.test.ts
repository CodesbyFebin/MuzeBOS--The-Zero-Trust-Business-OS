import { describe, expect, test, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

vi.mock('@/lib/lab/ledger/deps', async (importOriginal) => (await import('./helpers/lab-measure-ref')).withMeasureFallback(await importOriginal()));

import { asOfView } from '@/lib/lab/measure/asof';
import { REPLAYS, narrowAsOf, origins, runBacktest } from '@/lib/lab/ledger/backtest';
import { fitSh } from '@/lib/lab/ledger/forecast';
import { ledgerBaseline, viewsAtAge } from '@/lib/lab/ledger/outcome';
import { computeEvals } from '@/lib/lab/ledger/evals';
import { draftPrediction, seal } from '@/lib/lab/ledger/freeze';
import { DAY, H, addHistory, addPost, addSource, forecastWorld, iso } from './helpers/lab-ledger-world';

const NOW = Date.parse('2026-10-11T12:00:00.000Z'); // a Sunday
const T = Date.parse('2026-08-31T00:00:00.000Z'); // a Monday origin

function world() {
  return forecastWorld(120, { start: NOW - 9 * DAY });
}
const targetAt = (s: ReturnType<typeof world>, from: number) => s.posts.all().filter((p) => Date.parse(p.postedAt!) >= from && Date.parse(p.postedAt!) < from + 7 * DAY).sort((a, b) => (a.postedAt! < b.postedAt! ? -1 : 1))[0];
const replay = (s: ReturnType<typeof world>, id: string, post: NonNullable<ReturnType<typeof targetAt>>, ref = 24) =>
  REPLAYS[id](asOfView(s, iso(T)), { post, reference: id === 'creator_median' ? null : asOfView(s, iso(Date.parse(post.postedAt!) + ref * 1.25 * H)) });

describe('origins (06 7.1)', () => {
  test('AC-06-23 at most 26 Mondays, the last at least 8 days old, a week apart', () => {
    const os = origins(new Date(NOW));
    expect(os.length).toBeLessThanOrEqual(26);
    expect(os.length).toBeGreaterThanOrEqual(25);
    for (const o of os) expect(new Date(`${o}T00:00:00Z`).getUTCDay()).toBe(1);
    expect(NOW - Date.parse(`${os[os.length - 1]}T00:00:00Z`)).toBeGreaterThanOrEqual(8 * DAY);
    expect(os[os.length - 1]).toBe('2026-09-28');
    for (let i = 1; i < os.length; i++) expect(Date.parse(os[i]) - Date.parse(os[i - 1])).toBe(7 * DAY);
    expect(origins(new Date('2026-10-06T00:00:00Z')).at(-1)).toBe('2026-09-28'); // exactly 8 days
  });
});

describe('as-of reconstruction (06 7.2)', () => {
  test('narrowAsOf(asOfView(now), T) equals asOfView(T)', () => {
    const s = world();
    const a = narrowAsOf(asOfView(s, iso(NOW)), iso(T));
    const b = asOfView(s, iso(T));
    expect(a.posts).toEqual(b.posts);
    expect([...a.metrics.entries()]).toEqual([...b.metrics.entries()]);
    expect([...a.creatorSnapshots.entries()]).toEqual([...b.creatorSnapshots.entries()]);
  });
});

describe('leakage L1 to L7 (06 7.5, AC-06-22)', () => {
  test('L1 a read captured after the as-of time changes nothing', () => {
    const s = world();
    const post = targetAt(s, T)!;
    const before = { cm: replay(s, 'creator_median', post), sh: replay(s, 'sh_24h', post) };
    expect(before.cm).not.toBeNull();
    expect(before.sh).not.toBeNull();
    // a post about 157 h old at T + 1 h: a 10x read then would sit right by its 168 h value
    const earlier = s.posts.all().find((p) => Date.parse(p.postedAt!) > T - 7 * DAY && Date.parse(p.postedAt!) < T - 6 * DAY)!;
    s.metrics.add({ postId: earlier.id, capturedAt: iso(T + H), views: 10_000_000, likes: null, comments: null, shares: null, saves: null });
    // and the target's own read just after its reference window
    s.metrics.add({ postId: post.id, capturedAt: iso(Date.parse(post.postedAt!) + 31 * H), views: 10_000_000, likes: null, comments: null, shares: null, saves: null });
    // sanity: seen from later, the leaked read does change that post's 168 h value
    expect(viewsAtAge(asOfView(s, iso(T + 2 * H)), earlier, 168)!.views).toBeGreaterThan(5 * viewsAtAge(asOfView(s, iso(T)), earlier, 168)!.views);
    expect(replay(s, 'creator_median', post)).toEqual(before.cm);
    expect(replay(s, 'sh_24h', post)).toEqual(before.sh);
  });

  test('L2 a later post with huge views does not move creator_median', () => {
    const s = world();
    const post = targetAt(s, T)!;
    const before = replay(s, 'creator_median', post);
    addPost(s, { id: 'later', source: 'own', postedAt: Date.parse(post.postedAt!) + H, reads: { 24: 9e6, 170: 9e7 } });
    expect(replay(s, 'creator_median', post)).toEqual(before);
  });

  test('L3 a post published T - 5 d is not in the sh training set at T', () => {
    const s = world();
    const fit = fitSh(asOfView(s, iso(T)), 'instagram', 24)!;
    const recent = s.posts.all().filter((p) => Date.parse(p.postedAt!) > T - 7.5 * DAY && Date.parse(p.postedAt!) < T).map((p) => p.id);
    expect(recent.length).toBeGreaterThan(0);
    for (const id of recent) expect([...fit.trainIds, ...fit.calIds]).not.toContain(id);
  });

  test('L4 followers as of posting: a later snapshot changes nothing; a backfill post is not a target', () => {
    const s = world();
    const post = targetAt(s, T)!;
    s.creatorSnapshots.add({ sourceId: 'own', capturedAt: iso(NOW - 300 * DAY), followers: 10_000, following: null, postCount: null });
    const before = replay(s, 'creator_median', post);
    s.creatorSnapshots.add({ sourceId: 'own', capturedAt: iso(T + 2 * DAY), followers: 50_000, following: null, postCount: null });
    expect(replay(s, 'creator_median', post)).toEqual(before);

    // a second creator whose target post has no snapshot before it and one 2 days after: backfill
    const withTarget = (snapshot: boolean) => {
      const b = world();
      addSource(b, 'b2');
      const postT = T + DAY;
      addHistory(b, 'b2', postT, [10_000, 12_000, 9_000, 11_000, 13_000, 10_500]);
      addPost(b, { id: 'b2-target', source: 'b2', postedAt: postT, reads: { 24: 5_000, 150: 11_000, 190: 12_000 } });
      if (snapshot) b.creatorSnapshots.add({ sourceId: 'b2', capturedAt: iso(postT + 2 * DAY), followers: 10_000, following: null, postCount: null });
      runBacktest(b, { now: new Date(NOW), dry: false });
      return b.predictions.list({ origin: 'backtest', postId: 'b2-target' }).length;
    };
    expect(withTarget(false)).toBeGreaterThan(0); // a target when its followers are known or absent
    expect(withTarget(true)).toBe(0);
  });

  test('L5 replays take only AsOfData, never the store', () => {
    const src = readFileSync(path.join(process.cwd(), 'lib/lab/ledger/backtest.ts'), 'utf8');
    for (const m of src.matchAll(/export function (replay\w*)\(([^)]*)\)/g)) {
      expect(m[2], m[1]).toMatch(/data: AsOfData, target: TargetPost/);
      expect(m[2], m[1]).not.toMatch(/LabStore/);
    }
    expect(src).toMatch(/REPLAYS: Record<string, \(data: AsOfData, target: TargetPost\) => PredictionDraft \| null>/);
    expect(src).toMatch(/narrowAsOf\(dataNow,/);
  });

  test('L6 targets of origin T never sit in the calibration set used at T', () => {
    const s = forecastWorld(150, { start: NOW - 9 * DAY });
    const fit = fitSh(asOfView(s, iso(T)), 'instagram', 24)!;
    expect(fit.nCal).toBeGreaterThanOrEqual(20);
    const targets = s.posts.all().filter((p) => { const t = Date.parse(p.postedAt!) + 24 * H; return t >= T && t < T + 7 * DAY; }).map((p) => p.id);
    expect(targets.length).toBeGreaterThan(0);
    for (const id of targets) expect(fit.calIds).not.toContain(id);
  });

  test('L7 a same-creator post on another surface does not move the baseline', () => {
    const s = world();
    const post = targetAt(s, T)!;
    const data = () => asOfView(s, iso(T));
    const before = ledgerBaseline(data(), post);
    addPost(s, { id: 'carousel', source: 'own', postedAt: T - 20 * DAY, contentType: 'carousel', reads: { 160: 9e7, 175: 9e7 } });
    expect(ledgerBaseline(data(), post)).toEqual(before);
  });
});

describe('the nightly harness (06 7.3, 7.4)', () => {
  test('AC-06-24 backtest rows are replaced, live rows are untouched', () => {
    const s = world();
    const live = seal(draftPrediction({ id: 'lpr-live', predictor: 'creator_median', predictorVersion: 'cm-1', kind: 'pre_post', asOf: iso(NOW), frozenAt: iso(NOW), sourceId: 'own' }));
    s.predictions.insert(live);
    const r1 = runBacktest(s, { now: new Date(NOW), dry: false });
    expect(r1.origins).toBeGreaterThan(20);
    expect(r1.rows.creator_median).toBeGreaterThan(50);
    expect(r1.rows.sh_24h).toBeGreaterThan(50);
    const ids1 = s.predictions.list({ origin: 'backtest', limit: 1e6 }).map((p) => p.id).sort();
    const r2 = runBacktest(s, { now: new Date(NOW), dry: false });
    const ids2 = s.predictions.list({ origin: 'backtest', limit: 1e6 }).map((p) => p.id).sort();
    expect(ids2).toEqual(ids1);
    expect(r2.rows).toEqual(r1.rows);
    expect(s.predictions.list({ origin: 'live', limit: 1e6 })).toEqual([s.predictions.get('lpr-live')]);
    expect(s.predictions.get('lpr-live')).toEqual(live);
    // graded backtest rows feed the evals; sh beats a noisy baseline on this world or at least gets a verdict
    computeEvals(s, { now: new Date(NOW), dry: false, abstained: r2.abstained, origins: r2.origins, B: 200 });
    const e = s.evals.latest('sh_24h', 'backtest', 'all', 'all', 12)!;
    expect(e.nPosts).toBeGreaterThan(20);
    expect(e.verdictForecast).not.toBeNull();
    expect(e.origins).toBe(r2.origins);
  });
});

describe('AC-06-52 the backtest uses 04\'s as-of view', () => {
  test('AsOfData is imported from lib/lab/measure/asof and never declared in lib/lab/ledger', () => {
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : [path.join(d, f)]));
    for (const f of walk(path.join(process.cwd(), 'lib/lab/ledger'))) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/type AsOfData\s*=/);
      expect(src, f).not.toMatch(/asOfStore/);
    }
    for (const f of ['backtest.ts', 'forecast.ts', 'outcome.ts']) {
      expect(readFileSync(path.join(process.cwd(), 'lib/lab/ledger', f), 'utf8'), f).toMatch(/import \{ asOfView, type AsOfData \} from '@\/lib\/lab\/measure\/asof';/);
    }
  });
});
