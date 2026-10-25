import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { LAB_DDL } from '@/lib/db';
import { labStore, type LabStore } from '@/lib/lab/store';
import type { LabSource } from '@/lib/schemas';
import { invalidateModeCache } from '@/lib/paths';
import { CapError } from '@/lib/lab/spend';
import type { ApifyClient, ApifyRun } from '@/lib/lab/apify-client';
import { advanceRuns, chargeCeiling, depthFor, describePlan, fetchAllItems, ingestPosts, ingestRun, lastScrapedAt, planScrape, postIdFor, startPlan } from '@/lib/lab/sync';
import { dryPostItems, dryProfileItems, dryViewsAt } from '@/lib/lab/dry-items';

/**
 * The scrape cycle (lib/lab/sync.ts): planning, ingest, the gate, advance-on-read.
 * Live paths run against a fake Apify client only; nothing here touches the network.
 */
const KEYS = ['LAB_DRY', 'LAB_APIFY_CAP_USD', 'GLADOS_ENV_LOCAL', 'GLADOS_MODE_FILE', 'DEMO_MODE'] as const;
let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-sync-'));
  process.env.GLADOS_ENV_LOCAL = path.join(dir, '.env.local');
  process.env.GLADOS_MODE_FILE = path.join(dir, '.glados-mode');
  process.env.DEMO_MODE = '0';
  invalidateModeCache();
});
afterEach(() => {
  for (const k of KEYS) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]));
  invalidateModeCache();
});

const NOW = new Date('2026-10-10T12:00:00.000Z');
const fresh = (): LabStore => {
  const db = new Database(':memory:');
  db.exec(LAB_DDL);
  return labStore(db);
};
const src = (id: string, kind: LabSource['kind'], platform: LabSource['platform'], handle: string, status: LabSource['status'] = 'active'): LabSource => ({ id, kind, platform, handle, url: null, displayName: handle, status, addedAt: NOW.toISOString(), reason: null, score: null });

describe('depthFor (SPEC §4.2 defaults)', () => {
  const f = (posts: number, youngPosts = 0, lastScrapedAt: string | null = null) => ({ posts, youngPosts, lastScrapedAt });
  test('first scrape reads 50, then 15 a cycle', () => {
    expect(depthFor({ kind: 'owned' }, f(0), NOW)).toBe(50);
    expect(depthFor({ kind: 'owned' }, f(40, 3), NOW)).toBe(15);
  });
  test('an accepted suggestion with only its 10-post sample gets its first full read', () => {
    expect(depthFor({ kind: 'tracked' }, f(10), NOW)).toBe(50);
  });
  test('re-sampling: depth grows to cover every post younger than 14 days, capped at 50', () => {
    expect(depthFor({ kind: 'owned' }, f(60, 20), NOW)).toBe(21);
    expect(depthFor({ kind: 'owned' }, f(200, 80), NOW)).toBe(50);
  });
  test('owned every cycle; tracked once a day unless forced; suggestions once at 10; feeds never', () => {
    const recent = new Date(NOW.getTime() - 3 * 3_600_000).toISOString();
    const yesterday = new Date(NOW.getTime() - 21 * 3_600_000).toISOString();
    expect(depthFor({ kind: 'owned' }, f(40, 0, recent), NOW)).toBe(15);
    expect(depthFor({ kind: 'tracked' }, f(40, 0, recent), NOW)).toBeNull();
    expect(depthFor({ kind: 'tracked' }, f(40, 0, recent), NOW, true)).toBe(15);
    expect(depthFor({ kind: 'tracked' }, f(40, 0, yesterday), NOW)).toBe(15);
    expect(depthFor({ kind: 'suggested' }, f(0), NOW)).toBe(10);
    expect(depthFor({ kind: 'suggested' }, f(10), NOW)).toBeNull();
    expect(depthFor({ kind: 'feed' }, f(0), NOW)).toBeNull();
  });
});

describe('planScrape', () => {
  test('one run per platform and depth; paused, dismissed and feeds skipped; Instagram gets a profile run', () => {
    const store = fresh();
    store.sources.upsert(src('a', 'owned', 'tiktok', 'one'));
    store.sources.upsert(src('b', 'tracked', 'tiktok', 'two'));
    store.sources.upsert(src('c', 'suggested', 'tiktok', 'three'));
    store.sources.upsert(src('d', 'owned', 'instagram', 'four'));
    store.sources.upsert(src('e', 'tracked', 'youtube', 'five', 'paused'));
    store.sources.upsert(src('f', 'feed', 'reddit', 'localllama'));
    store.sources.upsert(src('g', 'tracked', 'twitter', 'six', 'dismissed'));
    const plan = planScrape(store, NOW);
    expect(plan.scrapes.map((g) => [g.platform, g.limit, g.sources.map((s) => s.handle)])).toEqual([
      ['tiktok', 50, ['one', 'two']],
      ['tiktok', 10, ['three']],
      ['instagram', 50, ['four']],
    ]);
    expect(plan.scrapes[0].actorInput).toMatchObject({ profiles: ['one', 'two'], resultsPerPage: 50, shouldDownloadVideos: false });
    expect(plan.profiles).toEqual([expect.objectContaining({ platform: 'instagram', actorId: 'apify/instagram-profile-scraper', actorInput: { usernames: ['four'] } })]);
    expect(describePlan(plan)[0]).toMatchObject({ actor: 'clockworks/tiktok-scraper', handles: ['one', 'two'], limit: 50, maxItems: 100 });
    expect(planScrape(store, NOW, { platforms: ['instagram'] }).scrapes).toHaveLength(1);
  });

  test('lastScrapedAt reads the run log by source id', () => {
    const store = fresh();
    store.runs.insert({ id: 'r1', kind: 'scrape', apifyRunId: null, datasetId: null, actor: 'x', input: { platform: 'tiktok', sourceIds: ['a'] }, status: 'succeeded', items: 1, costUsd: 0, dry: true, startedAt: '2026-10-10T08:00:00.000Z', finishedAt: null, error: null });
    store.runs.insert({ id: 'r2', kind: 'scrape', apifyRunId: null, datasetId: null, actor: 'x', input: { platform: 'tiktok', sourceIds: ['b'] }, status: 'failed', items: 1, costUsd: 0, dry: true, startedAt: '2026-10-10T09:00:00.000Z', finishedAt: null, error: null });
    expect([...lastScrapedAt(store, NOW)]).toEqual([['a', '2026-10-10T08:00:00.000Z']]);
  });
});

describe('ingest', () => {
  test('new posts land once; a re-read appends a metrics row and never a second post; followers from the author block', () => {
    const store = fresh();
    const s = src('a', 'owned', 'tiktok', 'one');
    store.sources.upsert(s);
    const first = ingestPosts(store, 'tiktok', [s], dryPostItems('tiktok', [{ handle: 'one', existing: [] }], 5, NOW), NOW);
    expect(first).toMatchObject({ items: 5, posts: 5, newPosts: 5, metrics: 5, snapshots: 1, unmatched: 0 });
    const posts = store.posts.bySource('a');
    expect(posts.every((p) => p.isOwned && p.id.startsWith('lp-tiktok-'))).toBe(true);
    const later = new Date(NOW.getTime() + 6 * 3_600_000);
    const existing = posts.map((p) => ({ ...p, latestViews: store.metrics.latest().get(p.id)?.views ?? null }));
    const second = ingestPosts(store, 'tiktok', [s], dryPostItems('tiktok', [{ handle: 'one', existing }], 15, later), later);
    expect(second).toMatchObject({ posts: 5, newPosts: 0, metrics: 5 });
    expect(store.posts.count()).toBe(5);
    for (const p of posts) {
      const reads = store.metrics.forPost(p.id);
      expect(reads).toHaveLength(2);
      expect(reads[1].views!).toBeGreaterThanOrEqual(reads[0].views!);
    }
    expect(store.creatorSnapshots.forSource('a')).toHaveLength(2);
  });

  test('items by an author the run did not ask for are counted, not stored', () => {
    const store = fresh();
    const a = src('a', 'tracked', 'tiktok', 'one');
    const b = src('b', 'tracked', 'tiktok', 'two');
    const items = dryPostItems('tiktok', [{ handle: 'stranger', existing: [] }], 3, NOW);
    expect(ingestPosts(store, 'tiktok', [a, b], items, NOW)).toMatchObject({ posts: 0, unmatched: 3 });
  });

  test('YouTube subtitles are kept free at ingest with their WPM; Instagram saves stay null', () => {
    const store = fresh();
    const y = src('y', 'owned', 'youtube', 'chan');
    const i = src('i', 'owned', 'instagram', 'gram');
    ingestPosts(store, 'youtube', [y], dryPostItems('youtube', [{ handle: 'chan', existing: [] }], 3, NOW), NOW);
    const t = store.transcripts.all();
    expect(t).toHaveLength(3);
    expect(t[0]).toMatchObject({ provider: 'youtube-subtitles', costUsd: 0, status: 'done' });
    expect(t[0].wpm).toBeGreaterThan(100);
    ingestPosts(store, 'instagram', [i], dryPostItems('instagram', [{ handle: 'gram', existing: [] }], 2, NOW), NOW);
    const igPost = store.posts.bySource('i')[0];
    expect(store.metrics.forPost(igPost.id)[0].saves).toBeNull();
  });

  test('ingestRun routes a profile run to creator snapshots by the recorded source ids', () => {
    const store = fresh();
    store.sources.upsert(src('i', 'owned', 'instagram', 'gram'));
    const r = ingestRun(store, { kind: 'profile', input: { platform: 'instagram', sourceIds: ['i'] } }, dryProfileItems(['gram', 'other']), NOW);
    expect(r).toMatchObject({ snapshots: 1, unmatched: 1 });
    expect(store.creatorSnapshots.forSource('i')[0].followers).toBeGreaterThan(0);
  });

  test('dry views follow a saturating curve and never go negative', () => {
    expect(dryViewsAt(1000, 0)).toBe(0);
    expect(dryViewsAt(1000, 36)).toBeLessThan(dryViewsAt(1000, 72));
    expect(dryViewsAt(1000, 10_000)).toBe(1000);
    expect(postIdFor('tiktok', 'a/b?c')).toBe('lp-tiktok-abc');
  });
});

/* ── the gate: dry and live ──────────────────────────────────────────── */

function fakeClient(over: Partial<{ start: (actor: string, input: unknown, o: unknown) => ApifyRun; run: (id: string) => ApifyRun; items: (id: string, o: { offset?: number; limit?: number }) => unknown[] }> = {}) {
  const calls: { method: string; args: unknown[] }[] = [];
  const base: ApifyRun = { id: 'apify-1', actId: null, status: 'RUNNING', startedAt: null, finishedAt: null, defaultDatasetId: 'ds-1', usageTotalUsd: null, chargedEventCounts: null, statusMessage: null, runTimeSecs: null, maxTotalChargeUsd: null };
  const client = {
    async startRun(actor: string, input: unknown, o: unknown) {
      calls.push({ method: 'startRun', args: [actor, input, o] });
      return over.start ? over.start(actor, input, o) : base;
    },
    async getRun(id: string) {
      calls.push({ method: 'getRun', args: [id] });
      return over.run ? over.run(id) : base;
    },
    async datasetItems(id: string, o: { offset?: number; limit?: number } = {}) {
      calls.push({ method: 'datasetItems', args: [id, o] });
      return over.items ? over.items(id, o) : [];
    },
    async datasetInfo(id: string) {
      calls.push({ method: 'datasetInfo', args: [id] });
      return { itemCount: null };
    },
    async me() {
      throw new Error('not used');
    },
  } as unknown as ApifyClient;
  return { client, calls };
}

describe('startPlan through the gate', () => {
  test('dry: fixture items ingested at once, a 0-cost dry run and ledger row per group, measures computed, no client', async () => {
    process.env.LAB_DRY = '1';
    const store = fresh();
    store.sources.upsert(src('a', 'owned', 'tiktok', 'one'));
    store.sources.upsert(src('i', 'owned', 'instagram', 'gram'));
    const out = await startPlan({ store, client: null, now: NOW }, planScrape(store, NOW));
    expect(out.map((r) => [r.run.kind, r.run.status, r.run.dry, r.run.costUsd])).toEqual([
      ['scrape', 'succeeded', true, 0],
      ['scrape', 'succeeded', true, 0],
      ['profile', 'succeeded', true, 0],
    ]);
    expect(out[0].run.input).toMatchObject({ platform: 'tiktok', sourceIds: ['a'], limit: 50, actorInput: { profiles: ['one'] } });
    expect(store.posts.count()).toBe(100);
    expect(store.spend.all().every((s) => s.dry && s.actualUsd === 0)).toBe(true);
    expect(store.measures.all()).toHaveLength(100);
  });

  test('live: Apify accepts the run; it stays running with its run id, an item ceiling and a charge ceiling; the ledger waits on the actual', async () => {
    const store = fresh();
    store.sources.upsert(src('a', 'owned', 'tiktok', 'one'));
    const { client, calls } = fakeClient();
    const out = await startPlan({ store, client, now: NOW }, planScrape(store, NOW));
    expect(out[0].run).toMatchObject({ status: 'running', apifyRunId: 'apify-1', datasetId: 'ds-1', dry: false, costUsd: null });
    expect(calls[0]).toEqual({ method: 'startRun', args: ['clockworks/tiktok-scraper', expect.objectContaining({ profiles: ['one'] }), { maxItems: 50, maxTotalChargeUsd: 3 }] }); // v2 reserve: min(LAB_RUN_MAX_USD 3, apify.sync 46, apify 98)
    expect(store.spend.all()).toEqual([expect.objectContaining({ provider: 'apify', dry: false, actualUsd: null })]);
  });

  test('scheduled past the cap: a blocked run, nothing started', async () => {
    process.env.LAB_APIFY_CAP_USD = '1';
    const store = fresh();
    store.sources.upsert(src('a', 'owned', 'tiktok', 'one'));
    store.spend.add({ runId: null, provider: 'apify', units: 1, estUsd: null, actualUsd: 1.5, dry: false, at: NOW.toISOString() });
    const { client, calls } = fakeClient();
    await expect(startPlan({ store, client, now: NOW, scheduled: true }, planScrape(store, NOW))).rejects.toBeInstanceOf(CapError);
    expect(calls).toHaveLength(0);
    expect(store.runs.recent()[0]).toMatchObject({ status: 'blocked' });
  });

  test('chargeCeiling splits the headroom across the runs ahead; none when overriding', () => {
    process.env.LAB_APIFY_CAP_USD = '10';
    const store = fresh();
    store.spend.add({ runId: null, provider: 'apify', units: 1, estUsd: null, actualUsd: 4, dry: false, at: NOW.toISOString() });
    expect(chargeCeiling(store, 3, NOW)).toBe(2);
    expect(chargeCeiling(store, 3, NOW, true)).toBeNull();
  });
});

describe('advance on read', () => {
  async function started(store: LabStore, client: ApifyClient) {
    store.sources.upsert(src('a', 'owned', 'tiktok', 'one'));
    return (await startPlan({ store, client, now: NOW }, planScrape(store, NOW)))[0].run;
  }

  test('a run younger than 15 s is not polled; a running one stays open', async () => {
    const store = fresh();
    const { client, calls } = fakeClient();
    await started(store, client);
    expect((await advanceRuns(store, client, { now: new Date(NOW.getTime() + 5_000) })).checked).toBe(0);
    const r = await advanceRuns(store, client, { now: new Date(NOW.getTime() + 60_000) });
    expect(r).toMatchObject({ checked: 1, finished: 0 });
    expect(calls.filter((c) => c.method === 'getRun')).toHaveLength(1);
    expect(store.runs.open()).toHaveLength(1);
  });

  test('SUCCEEDED: the dataset is ingested, measures computed, and the actual usageTotalUsd settles the ledger', async () => {
    const store = fresh();
    const items = dryPostItems('tiktok', [{ handle: 'one', existing: [] }], 12, NOW);
    const { client } = fakeClient({ run: () => ({ id: 'apify-1', actId: null, status: 'SUCCEEDED', startedAt: null, finishedAt: null, defaultDatasetId: 'ds-1', usageTotalUsd: 0.0204, chargedEventCounts: null, statusMessage: null, runTimeSecs: null, maxTotalChargeUsd: null }), items: () => items });
    const run = await started(store, client);
    const r = await advanceRuns(store, client, { now: new Date(NOW.getTime() + 60_000) });
    expect(r).toMatchObject({ finished: 1, items: 12 });
    expect(store.posts.count()).toBe(12);
    expect(store.measures.all()).toHaveLength(12);
    expect(store.runs.get(run.id)).toMatchObject({ status: 'succeeded', costUsd: 0.0204, items: 12 });
    expect(store.spend.all()[0]).toMatchObject({ actualUsd: 0.0204, units: 12 });
    // a second read does nothing: the run is closed
    expect((await advanceRuns(store, client, { now: new Date(NOW.getTime() + 120_000) })).checked).toBe(0);
  });

  test('SUCCEEDED without a reported charge: the run closes, the ledger row stays unsettled', async () => {
    const store = fresh();
    const { client } = fakeClient({ run: () => ({ id: 'apify-1', actId: null, status: 'SUCCEEDED', startedAt: null, finishedAt: null, defaultDatasetId: 'ds-1', usageTotalUsd: null, chargedEventCounts: null, statusMessage: null, runTimeSecs: null, maxTotalChargeUsd: null }) });
    const run = await started(store, client);
    await advanceRuns(store, client, { now: new Date(NOW.getTime() + 60_000) });
    expect(store.runs.get(run.id)?.status).toBe('succeeded');
    expect(store.spend.all()[0].actualUsd).toBeNull();
  });

  test('TIMED-OUT closes the run with the charge Apify reports, keeping what its dataset holds (09.4.3)', async () => {
    const store = fresh();
    const { client } = fakeClient({ run: () => ({ id: 'apify-1', actId: null, status: 'TIMED-OUT', startedAt: null, finishedAt: null, defaultDatasetId: 'ds-1', usageTotalUsd: 0.01, chargedEventCounts: null, statusMessage: null, runTimeSecs: null, maxTotalChargeUsd: null }) });
    const run = await started(store, client);
    const r = await advanceRuns(store, client, { now: new Date(NOW.getTime() + 60_000) });
    expect(r.failed).toBe(1);
    expect(store.runs.get(run.id)).toMatchObject({ status: 'timed_out', error: 'Apify run timed-out, 0 items kept', costUsd: 0.01 });
  });

  test('a poll error leaves the run open and is reported, never thrown', async () => {
    const store = fresh();
    const { client } = fakeClient({
      run: () => {
        throw new Error('Apify GET /actor-runs answered 500');
      },
    });
    await started(store, client);
    const r = await advanceRuns(store, client, { now: new Date(NOW.getTime() + 60_000) });
    expect(r.errors[0]).toMatch(/answered 500/);
    expect(store.runs.open()).toHaveLength(1);
  });

  test('fetchAllItems pages until a short page', async () => {
    const pages = [Array(3).fill({}), Array(3).fill({}), [{}]];
    const { client, calls } = fakeClient({ items: (_id, o) => pages[(o.offset ?? 0) / 3] ?? [] });
    expect(await fetchAllItems(client, 'ds', 3)).toHaveLength(7);
    expect(calls.map((c) => (c.args[1] as { offset: number }).offset)).toEqual([0, 3, 6]);
  });
});

describe('advance on read: the intel lane Google Trends run', () => {
  test('a finished apify/google-trends-scraper run is read into trend items, not posts', async () => {
    const { GOOGLE_TRENDS_ACTOR } = await import('@/lib/lab/feeds');
    const store = fresh();
    store.runs.insert({ id: 'gt-1', kind: 'search', apifyRunId: 'apify-gt', datasetId: 'ds-gt', actor: GOOGLE_TRENDS_ACTOR, input: { searchTerms: ['claude code'] }, status: 'running', items: null, costUsd: null, dry: false, startedAt: NOW.toISOString(), finishedAt: null, error: null });
    const items = [{ searchTerm: 'claude code', relatedQueries_rising: [{ query: 'claude code hooks', value: 450 }, { query: 'claude code agents', value: 120 }] }];
    const { client } = fakeClient({ run: () => ({ id: 'apify-gt', actId: null, status: 'SUCCEEDED', startedAt: null, finishedAt: null, defaultDatasetId: 'ds-gt', usageTotalUsd: 0.01, chargedEventCounts: null, statusMessage: null, runTimeSecs: null, maxTotalChargeUsd: null }), items: (_id, o) => ((o.offset ?? 0) === 0 ? items : []) });
    const r = await advanceRuns(store, client, { now: new Date(NOW.getTime() + 60_000) });
    expect(r).toMatchObject({ finished: 1 });
    expect(store.posts.count()).toBe(0);
    expect(store.trendItems.all().map((t) => t.title).sort()).toEqual(['claude code agents', 'claude code hooks']);
  });
});
