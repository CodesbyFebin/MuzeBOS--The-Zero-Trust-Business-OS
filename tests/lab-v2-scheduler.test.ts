import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { LabPost, LabSource } from '@/lib/schemas';
import { invalidateModeCache } from '@/lib/paths';
import { LAB_DDL } from '@/lib/db';
import { labStore } from '@/lib/lab/store';
import { dueReads, planSnapshots, snapshotHitRate, startSnapshots, tolerance } from '@/lib/lab/measure/scheduler';
import { seedLabFixtures } from '@/lib/lab/fixtures';
import { emptyStore } from './helpers/lab-measure-world';

/** 04 4 fixed-age snapshots (AC-04-14 to AC-04-17; AC-04-10's scheduler part). Clocks in UTC. */
const KEYS = ['LAB_DRY', 'GLADOS_ENV_LOCAL', 'GLADOS_MODE_FILE', 'DEMO_MODE', 'GLADOS_TZ', 'LAB_APIFY_SNAPSHOTS_CAP_USD'] as const;
let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-snap-'));
  process.env.GLADOS_ENV_LOCAL = path.join(dir, '.env.local');
  process.env.GLADOS_MODE_FILE = path.join(dir, '.glados-mode');
  process.env.DEMO_MODE = '0';
  process.env.GLADOS_TZ = 'UTC';
  invalidateModeCache();
});
afterEach(() => {
  for (const k of KEYS) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]));
  invalidateModeCache();
});

const D = '2026-10-10';
const t = (hhmm: string, dayOffset = 0) => new Date(Date.parse(`${D}T${hhmm}:00.000Z`) + dayOffset * 86_400_000);
const src = (id: string, platform: LabSource['platform'], handle: string): LabSource => ({ id, kind: 'owned', platform, handle, url: null, displayName: handle, status: 'active', addedAt: '2026-01-01T00:00:00.000Z', reason: null, score: null });
const post = (id: string, sourceId: string, platform: LabPost['platform'], postedAt: string): LabPost => ({ id, sourceId, platform, externalId: id, url: `https://example.test/${id}`, postedAt, caption: '', contentType: platform === 'instagram' ? 'reel' : 'video', thumbnailUrl: null, mediaUrl: null, durationS: 30, isOwned: true });

describe('the due rule (AC-04-14)', () => {
  test('an owned IG post at 10:00: due for 3h at 13:10; nothing at 13:40 after a 13:05 read; nothing at 12:20', () => {
    const { store } = emptyStore();
    store.sources.upsert(src('ig', 'instagram', 'studio'));
    store.posts.upsert(post('p', 'ig', 'instagram', t('10:00').toISOString()));
    expect(dueReads(store, t('13:10'))).toEqual([{ postId: 'p', platform: 'instagram', targetH: 3, ageH: 3.17 }]);
    store.metrics.add({ postId: 'p', capturedAt: t('13:05').toISOString(), views: 1, likes: 0, comments: 0, shares: null, saves: null });
    expect(dueReads(store, t('13:40'))).toEqual([]);
    expect(dueReads(store, t('12:20'))).toEqual([]);
  });
  test('tolerances', () => {
    expect(tolerance(1)).toEqual({ pre: 0.25, post: 0.25 });
    expect(tolerance(24)).toEqual({ pre: 0.5, post: 2.4 });
    expect(tolerance(6)).toEqual({ pre: 0.5, post: 1 });
    expect(tolerance(168)).toEqual({ pre: 2, post: 3 });
  });
});

describe('owned X (AC-04-15, AC-04-10)', () => {
  test('dense reads at 10:30, 11:00, 11:30, 12:00, then the hourly query; nothing after 48h', () => {
    const { store } = emptyStore();
    store.sources.upsert(src('x', 'twitter', 'studio'));
    store.posts.upsert(post('tw', 'x', 'twitter', t('10:00').toISOString()));
    const xReads = (now: Date) => planSnapshots(store, now).reads.find((r) => r.platform === 'twitter')?.posts.filter((d) => d.postId === 'tw').map((d) => d.targetH) ?? null;
    const read = (now: Date) => store.metrics.add({ postId: 'tw', capturedAt: now.toISOString(), views: 1, likes: 0, comments: 0, shares: null, saves: null });
    for (const [hhmm, target] of [['10:30', 0.5], ['11:00', 1], ['11:30', 1.5], ['12:00', 2]] as const) {
      expect(xReads(t(hhmm))).toEqual([target]);
      read(t(hhmm));
    }
    // 12:30 is no hourly slot and no dense target: no X query at all
    expect(planSnapshots(store, t('12:30')).reads.find((r) => r.platform === 'twitter')).toBeUndefined();
    // from here the hourly query carries the reads (the 2h read already covers the 3h target's tolerance)
    expect(xReads(t('13:00'))).toEqual([]);
    expect(xReads(t('16:00'))).toEqual([6]);
    // after 48h: the hourly query still runs (discovery) but never plans this tweet
    for (const h of [3, 6, 12, 24, 48]) store.metrics.add({ postId: 'tw', capturedAt: new Date(t('10:00').getTime() + h * 3_600_000).toISOString(), views: 1, likes: 0, comments: 0, shares: null, saves: null });
    expect(xReads(t('11:00', 2))).toEqual([]);
    expect(xReads(t('13:00', 3))).toEqual([]);
    expect(dueReads(store, t('10:00', 5)).filter((d) => d.platform === 'twitter')).toEqual([]);
  });
  test('the X query asks for 50 tweets without replies', () => {
    const { store } = emptyStore();
    store.sources.upsert(src('x', 'twitter', 'studio'));
    expect(planSnapshots(store, t('13:00')).reads[0].actorInput).toEqual({ searchTerms: ['from:studio -filter:replies'], maxItems: 50, sort: 'Latest' });
  });
});

describe('thinning and discovery (AC-04-16)', () => {
  test('at 80% of the line cap the plan is thinned: no 3h or 12h target', () => {
    process.env.LAB_APIFY_SNAPSHOTS_CAP_USD = '10';
    const { store } = emptyStore();
    store.sources.upsert(src('ig', 'instagram', 'studio'));
    store.posts.upsert(post('a', 'ig', 'instagram', t('10:00').toISOString()));
    store.posts.upsert(post('b', 'ig', 'instagram', t('01:00').toISOString()));
    expect(planSnapshots(store, t('13:10')).reads[0].posts.map((d) => d.targetH)).toEqual([3, 12]);
    store.spend.add({ runId: null, provider: 'apify', line: 'apify.snapshots', units: 1, estUsd: null, actualUsd: 8, dry: false, at: t('09:00').toISOString() });
    const plan = planSnapshots(store, t('13:10'));
    expect(plan.thinned).toBe(true);
    expect(plan.reads.flatMap((r) => r.posts.map((d) => d.targetH))).not.toContain(3);
    expect(plan.reads.flatMap((r) => r.posts.map((d) => d.targetH))).not.toContain(12);
    store.spend.add({ runId: null, provider: 'apify', line: 'apify.snapshots', units: 1, estUsd: null, actualUsd: 2, dry: false, at: t('09:00').toISOString() });
    expect(planSnapshots(store, t('13:10')).skipped).toEqual([{ reason: 'cap', platform: 'instagram' }]);
  });
  test('discovery every 2 h from 06:00 local, newest 3 per account, both YouTube tabs; never at 04:00 or :30', () => {
    const { store } = emptyStore();
    store.sources.upsert(src('yt', 'youtube', 'chan'));
    expect(planSnapshots(store, t('08:00')).discover).toEqual([{ platform: 'youtube', sourceIds: ['yt'], actorInput: expect.objectContaining({ maxResults: 3, maxResultsShorts: 3, startUrls: [{ url: 'https://www.youtube.com/@chan/videos' }, { url: 'https://www.youtube.com/@chan/shorts' }] }) }]);
    expect(planSnapshots(store, t('04:00')).discover).toEqual([]);
    expect(planSnapshots(store, t('08:30')).discover).toEqual([]);
    expect(planSnapshots(store, t('09:00')).discover).toEqual([]);
  });
  test('paused plans nothing', () => {
    const { store } = emptyStore();
    store.sources.upsert(src('ig', 'instagram', 'studio'));
    expect(planSnapshots(store, t('08:00'), { paused: true })).toMatchObject({ discover: [], reads: [], skipped: [{ reason: 'paused', platform: 'instagram' }] });
  });
});

describe('dry start (no network)', () => {
  test('a dry tick re-reads fixtures and writes snapshot rows with read_kind and target_age_h', async () => {
    process.env.LAB_DRY = '1';
    const { store } = emptyStore();
    store.sources.upsert(src('tt', 'tiktok', 'studio'));
    store.posts.upsert(post('v', 'tt', 'tiktok', t('10:00').toISOString()));
    const runs = await startSnapshots(store, null, planSnapshots(store, t('16:40')), { scheduled: true, now: t('16:40') });
    expect(runs.map((r) => [r.kind, r.line, r.job, r.dry])).toEqual([['snapshot', 'apify.snapshots', 'snapshots', true]]);
    expect(store.metrics.forPost('v')).toEqual([expect.objectContaining({ readKind: 'snapshot', targetAgeH: 6 })]);
  });
});

describe('the X single-run guard (04 4.3, 09.5.3)', () => {
  test('with another tweet-scraper run open, the X read defers: no Apify call, no run row, no spend', async () => {
    const { store } = emptyStore();
    store.sources.upsert(src('x', 'twitter', 'studio'));
    store.sources.upsert(src('ig', 'instagram', 'studio'));
    store.posts.upsert(post('tw', 'x', 'twitter', t('10:00').toISOString()));
    store.posts.upsert(post('p', 'ig', 'instagram', t('10:00').toISOString()));
    store.runs.insert({ id: 'radar-x', kind: 'radar', apifyRunId: 'ar-x', datasetId: null, actor: 'apidojo/tweet-scraper', input: {}, status: 'running', items: null, costUsd: null, dry: false, startedAt: t('10:20').toISOString(), finishedAt: null, error: null, line: 'apify.radar_x' });
    const started: string[] = [];
    const client = { async startRun(actor: string) { started.push(actor); return { id: `ar-${started.length}`, actId: null, status: 'RUNNING', startedAt: null, finishedAt: null, defaultDatasetId: 'ds', usageTotalUsd: null, chargedEventCounts: null, statusMessage: null, runTimeSecs: null, maxTotalChargeUsd: null }; } } as unknown as Parameters<typeof startSnapshots>[1];
    const plan = planSnapshots(store, t('10:30'));
    expect(plan.reads.map((r) => r.platform).sort()).toEqual(['twitter']);
    const deferred: string[] = [];
    const runs = await startSnapshots(store, client, plan, { scheduled: true, now: t('10:30'), onDefer: (_p, why) => deferred.push(why) });
    expect(runs).toEqual([]);
    expect(started).toEqual([]);
    expect(deferred).toEqual(['Waiting for the other X run to finish']);
    expect(store.runs.recent().map((r) => r.id)).toEqual(['radar-x']);
    expect(store.spend.all()).toEqual([]);
    // the Instagram read at 13:10 is not held by the X guard
    const later = await startSnapshots(store, client, planSnapshots(store, t('13:10')), { scheduled: true, now: t('13:10') });
    expect(started).toEqual(['apify/instagram-post-scraper']);
    expect(later[0]).toMatchObject({ kind: 'snapshot', line: 'apify.snapshots', status: 'running' });
  });
});

describe('the hit rate (AC-04-17)', () => {
  test('10 posts with 2 missed 6h reads give byTarget[6] = 8 of 10', () => {
    const { store } = emptyStore();
    store.sources.upsert(src('ig', 'instagram', 'studio'));
    const now = t('12:00');
    for (let i = 0; i < 10; i++) {
      const posted = now.getTime() - (12 + i * 14) * 3_600_000;
      store.posts.upsert(post(`h${i}`, 'ig', 'instagram', new Date(posted).toISOString()));
      for (const h of [2, 3, 6, 12]) {
        if (h === 6 && (i === 3 || i === 7)) continue;
        if (posted + h * 3_600_000 > now.getTime()) continue;
        store.metrics.add({ postId: `h${i}`, capturedAt: new Date(posted + h * 3_600_000).toISOString(), views: 1, likes: 0, comments: 0, shares: null, saves: null });
      }
    }
    expect(snapshotHitRate(store, now).byTarget[6]).toEqual({ hits: 8, due: 10 });
  });
  test('the full fixture world gives byTarget[6] = 8 of 10 (AC-08-15)', () => {
    const db = new Database(':memory:');
    db.exec(LAB_DDL);
    const store = labStore(db);
    const now = new Date('2026-10-10T12:00:00Z');
    seedLabFixtures(store, now);
    expect(snapshotHitRate(store, now).byTarget[6]).toEqual({ hits: 8, due: 10 });
    for (const m of store.metrics.byPost().values()) for (const r of m) expect(['cycle', 'snapshot', 'dense', 'discover', 'manual']).toContain(r.readKind);
    // 04 8: the fixture world carries every measure case the pages draw
    const ms = store.measures.all();
    expect(ms.every((m) => m.measureVersion === 'measure-v2')).toBe(true);
    expect(ms.filter((m) => m.dualHigh).length).toBeGreaterThanOrEqual(3);
    expect(ms.some((m) => m.baselineSource === 'projected' && m.breakout !== null)).toBe(true);
    expect(ms.some((m) => m.metricBasis === 'x_action' && m.breakout !== null)).toBe(true);
    expect(store.posts.all().some((p) => p.epoch === 'yt_shorts_pre_2025_03_31')).toBe(true);
    expect(store.posts.all().some((p) => p.exoReason)).toBe(true);
    expect(store.controls.all().every((c) => c.measureVersion === 'measure-v2')).toBe(true);
  }, 60_000);
});
