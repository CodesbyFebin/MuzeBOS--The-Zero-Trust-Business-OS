import { describe, expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { LAB_DDL } from '@/lib/db';
import { labStore, type LabStore } from '@/lib/lab/store';
import type { LabRun } from '@/lib/schemas';
import { abortRuns, activeBatch, batchProgress, pollRunProgress, rowFill, RateLimitedError, type ProgressSource } from '@/lib/lab/setup/progress';
import { freezeForecast } from '@/lib/lab/setup/forecast-rows';

const fresh = () => {
  const db = new Database(':memory:');
  db.exec(LAB_DDL);
  return labStore(db);
};
const T0 = new Date('2026-10-12T02:00:00.000Z');
const BATCH = 'lbat-0123456789ab';
const ACTORS = ['apify/instagram-post-scraper', 'clockworks/tiktok-scraper', 'streamers/youtube-scraper'];

function batch(store: LabStore, o: { scheduled?: boolean; job?: string | null; known?: boolean[] } = {}) {
  ACTORS.forEach((actor, k) => {
    const run: LabRun = { id: `run-${k}`, kind: 'scrape', apifyRunId: `apify-${k}`, datasetId: `ds-${k}`, actor, input: { platform: ['instagram', 'tiktok', 'youtube'][k], sourceIds: ['a', 'b', 'c'].slice(0, k + 1) }, status: 'queued', items: null, costUsd: null, dry: false, startedAt: T0.toISOString(), finishedAt: null, error: null, line: 'apify.sync', job: o.job ?? null, scheduled: Boolean(o.scheduled), batchId: BATCH, progress: null };
    store.runs.insert(run);
    freezeForecast(store, { kind: 'run_cost', subject: run.id, inputs: { actorId: actor, known: o.known?.[k] ?? k !== 2 }, predicted: 0.3, lo: 0.2, hi: 0.4, expectedItems: 150, now: T0, dry: false });
    store.spend.add({ runId: run.id, provider: 'apify', line: 'apify.sync', units: 0, estUsd: 0.3, actualUsd: null, reservedUsd: 0.5, dry: false, at: T0.toISOString() });
  });
}

/** A fake Apify: per run, a scripted status and counts; records every call. */
function fakeSource(script: Record<string, { status: string; counts: Record<string, number> | null; usd: number | null }>, datasetItems = 0) {
  const calls: string[] = [];
  const src: ProgressSource = {
    async getRun(id) {
      calls.push(`run:${id}`);
      const s = script[id];
      return { status: s.status, chargedEventCounts: s.counts, usageTotalUsd: s.usd, statusMessage: s.status === 'RUNNING' ? 'Scraping profile 2 of 5' : null, defaultDatasetId: id.replace('apify', 'ds') };
    },
    async datasetItemCount(id) {
      calls.push(`ds:${id}`);
      return datasetItems;
    },
  };
  return { src, calls };
}

describe('AC-09-15: a 3-run batch moves queued to running to succeeded', () => {
  test('items from chargedEventCounts, the dataset fallback, and the 3 s throttle', async () => {
    const store = fresh();
    batch(store);
    expect(batchProgress(store, BATCH, T0)!.rows.map((r) => r.state)).toEqual(['queued', 'queued', 'queued']);
    const script = {
      'apify-0': { status: 'RUNNING', counts: { post: 108, 'post-details': 108 }, usd: 0.25 },
      'apify-1': { status: 'RUNNING', counts: {}, usd: null },
      'apify-2': { status: 'READY', counts: null, usd: null },
    };
    const a = fakeSource(script, 54);
    const t1 = new Date(T0.getTime() + 10_000);
    const p1 = await pollRunProgress(store, store.runs.byBatch(BATCH), a.src, t1);
    expect(a.calls).toEqual(['run:apify-0', 'run:apify-1', 'ds:ds-1', 'run:apify-2', 'ds:ds-2']);
    expect(p1.calls).toBe(5);
    const b1 = batchProgress(store, BATCH, t1)!;
    expect(b1.rows.map((r) => r.state)).toEqual(['running', 'running', 'queued']);
    expect(b1.rows[0]).toMatchObject({ items: { sofar: 108, expected: 150, known: true }, usd: { sofar: 0.25, estimate: 0.3, ceiling: 0.5 }, statusMessage: 'Scraping profile 2 of 5', canStop: true });
    expect(b1.rows[1].items.sofar).toBe(54);
    expect(b1.state).toBe('running');
    // a second poll inside 3 s makes no Apify call
    const again = fakeSource(script);
    expect((await pollRunProgress(store, store.runs.byBatch(BATCH), again.src, new Date(t1.getTime() + 2_000))).calls).toBe(0);
    expect(again.calls).toEqual([]);
    // advance settles each run (lane D's terminal path; simulated here)
    for (const id of ['run-0', 'run-1', 'run-2']) store.runs.update(id, { status: 'succeeded', items: 140, costUsd: 0.31, finishedAt: new Date(t1.getTime() + 60_000).toISOString() });
    const done = batchProgress(store, BATCH, new Date(t1.getTime() + 61_000))!;
    expect(done.rows.map((r) => r.state)).toEqual(['succeeded', 'succeeded', 'succeeded']);
    expect(done.overall).toMatchObject({ finished: 3, total: 3, items: 420, estimateUsd: 0.9 });
    expect(['stages', 'done']).toContain(done.state);
  });

  test('a 429 backs off: 500 to 1000 ms first, doubled each time, and no call until the wait passes', async () => {
    const store = fresh();
    batch(store);
    const failing: ProgressSource = {
      async getRun() {
        throw new RateLimitedError();
      },
      async datasetItemCount() {
        return 0;
      },
    };
    await pollRunProgress(store, [store.runs.get('run-0')!], failing, T0, () => 0);
    const p = store.runs.get('run-0')!.progress!;
    expect(Date.parse(p.backoffUntil!) - T0.getTime()).toBe(500);
    // a long backoff (8 s after several 429s) holds past the 3 s throttle
    store.runs.update('run-0', { progress: { ...p, polledAt: T0.toISOString(), backoffUntil: new Date(T0.getTime() + 4_000).toISOString() } });
    const t = new Date(T0.getTime() + 3_500);
    const probe = fakeSource({ 'apify-0': { status: 'RUNNING', counts: null, usd: null } });
    expect((await pollRunProgress(store, [store.runs.get('run-0')!], probe.src, t)).calls).toBe(0);
    await pollRunProgress(store, [store.runs.get('run-0')!], failing, new Date(T0.getTime() + 4_500), () => 0);
    const q = store.runs.get('run-0')!.progress!;
    expect(Date.parse(q.backoffUntil!) - Date.parse(q.polledAt!)).toBe(8_000);
  });
});

describe('AC-09-16: no fake progress', () => {
  test('a determinate row never fills past 0.99 before terminal; an indeterminate row has no expected count and no percentage', () => {
    const store = fresh();
    batch(store);
    store.runs.update('run-0', { status: 'running', progress: { items: 400, usd: 0.5, statusMessage: null, polledAt: T0.toISOString() } });
    store.runs.update('run-2', { status: 'running', progress: { items: 54, usd: 0.16, statusMessage: null, polledAt: T0.toISOString() } });
    const b = batchProgress(store, BATCH, T0)!;
    expect(rowFill(b.rows[0])).toBe(0.99);
    expect(b.rows[2].items).toEqual({ sofar: 54, expected: null, known: false });
    expect(rowFill(b.rows[2])).toBeNull();
    expect(JSON.stringify(b)).not.toContain('%');
    store.runs.update('run-0', { status: 'succeeded', items: 142, finishedAt: T0.toISOString() });
    expect(rowFill(batchProgress(store, BATCH, T0)!.rows[0])).toBe(1);
  });
});

describe('AC-09-18: scheduled batches', () => {
  test('activeBatch returns a batch a tick started; batchProgress labels it origin schedule', () => {
    const store = fresh();
    batch(store, { scheduled: true, job: 'sync' });
    expect(activeBatch(store, T0)).toBe(BATCH);
    expect(batchProgress(store, BATCH, T0)).toMatchObject({ origin: 'schedule', job: 'sync' });
    expect(activeBatch(store, new Date(T0.getTime() + 7 * 3_600_000))).toBeNull();
  });
});

describe('09.4.5: Stop', () => {
  test('abort calls Apify for each stoppable run and marks it Stopping; nothing stoppable answers null', async () => {
    const store = fresh();
    batch(store);
    store.runs.update('run-1', { status: 'running' });
    const aborted: string[] = [];
    const b = await abortRuns(store, { batchId: BATCH }, { now: T0, abort: async (id) => void aborted.push(id) });
    expect(aborted).toEqual(['apify-0', 'apify-1', 'apify-2']);
    expect(b!.rows.every((r) => r.statusMessage === 'Stopping' && r.state === (r.runId === 'run-1' ? 'finishing' : 'queued'))).toBe(true);
    for (const id of ['run-0', 'run-1', 'run-2']) store.runs.update(id, { status: 'aborted', items: 40, costUsd: 0.1, finishedAt: T0.toISOString() });
    expect(await abortRuns(store, { batchId: BATCH }, { now: T0, abort: async () => {} })).toBeNull();
    expect(batchProgress(store, BATCH, T0)!.state).toBe('stopped');
  });
});
