import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import childProcess from 'node:child_process';
import Database from 'better-sqlite3';
import { LAB_DDL } from '@/lib/db';
import { labStore, type LabStore } from '@/lib/lab/store';
import { invalidateModeCache } from '@/lib/paths';
import type { JobConfig, LabJobId } from '@/lib/schemas';
import { LAB_JOBS, runTick, type JobResult, type LabJob } from '@/lib/lab/setup/jobs';
import { isDueWithConfig, jobConfig, nextRuns, zonedInstant, localClock, activePreset, JOB_PRESETS } from '@/lib/lab/setup/schedule';
import { lineOffReason } from '@/lib/lab/spend';
import { syncBody } from '@/lib/lab/setup/job-bodies';

const fresh = () => {
  const db = new Database(':memory:');
  db.exec(LAB_DDL);
  return labStore(db);
};
const KEYS = ['LAB_DRY', 'GLADOS_ENV_LOCAL', 'GLADOS_MODE_FILE', 'DEMO_MODE', 'GLADOS_TZ', 'APIFY_API_TOKEN', 'LAB_APIFY_SYNC_CAP_USD', 'LAB_APIFY_CAP_USD'] as const;
let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-sched-'));
  process.env.GLADOS_ENV_LOCAL = path.join(dir, '.env.local');
  fs.writeFileSync(process.env.GLADOS_ENV_LOCAL, 'APIFY_API_TOKEN=apify_api_TESTONLY\n');
  process.env.GLADOS_MODE_FILE = path.join(dir, '.glados-mode');
  process.env.DEMO_MODE = '0';
  invalidateModeCache();
});
afterEach(() => {
  for (const k of KEYS) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]));
  invalidateModeCache();
  vi.restoreAllMocks();
});

const SYD = 'Australia/Sydney';
const syd = (day: number, h: number, m = 0, month = 9) => zonedInstant(2026, month + 1, day, h, m, SYD);
const cfg = (c: Partial<JobConfig>): JobConfig => ({ v: 1, paused: false, mode: 'default', updatedAt: '2026-10-01T00:00:00Z', history: [], ...c });
const setCfg = (store: LabStore, id: LabJobId, c: JobConfig) => store.priors.set({ key: `jobcfg:${id}`, value: c, n: 0, supersedesDefault: false, updatedAt: c.updatedAt });

function fakeJobs(calls: LabJobId[]): LabJob[] {
  return LAB_JOBS.map((j) => ({ ...j, run: async (): Promise<JobResult> => (calls.push(j.id), { ok: true, detail: 'fake', items: 0 }) }));
}
async function ticks(store: LabStore, job: LabJobId, starts: Date, n: number, o: { force?: boolean; manual?: boolean } = {}): Promise<string[]> {
  const out: string[] = [];
  for (let k = 0; k < n; k++) {
    const at = new Date(starts.getTime() + k * 15 * 60_000);
    const calls: LabJobId[] = [];
    await runTick(store, { now: at, dry: false, jobs: fakeJobs(calls), only: [job], force: o.force, manual: o.manual, lockFile: null, exists: () => false, env: { ...process.env, GLADOS_TZ: SYD, GLADOS_AUTOMATION_DIR: '/auto' } });
    if (calls.includes(job)) {
      const c = localClock(at, SYD);
      out.push(`${c.d} ${String(c.hh).padStart(2, '0')}:${String(c.mm).padStart(2, '0')}`);
    }
  }
  return out;
}
const seedOwned = (store: LabStore) => store.sources.upsert({ id: 'own-1', kind: 'owned', platform: 'instagram', handle: 'example.studio', url: null, displayName: 'Example Studio', status: 'active', addedAt: '2026-10-01T00:00:00Z', reason: null, score: null });

describe('AC-09-21: times, interval, quiet hours, paused, Run now (Sydney clock)', () => {
  test("times ['07:00','19:00'] run at the first ticks at or after 07:00 and 19:00 only", async () => {
    const store = fresh();
    seedOwned(store);
    setCfg(store, 'sync', cfg({ mode: 'times', times: ['07:00', '19:00'] }));
    store.priors.set({ key: 'job:sync', value: { lastAt: syd(13, 23, 0).toISOString(), lastOkAt: null, lastDetail: '', fails: 0, skippedReason: null }, n: 0, supersedesDefault: false, updatedAt: '' });
    expect(await ticks(store, 'sync', syd(14, 0, 0), 96)).toEqual(['14 07:00', '14 19:00']);
  });
  test('interval 120 runs every 8th tick', async () => {
    const store = fresh();
    seedOwned(store);
    setCfg(store, 'snapshots', cfg({ mode: 'interval', everyMin: 120 }));
    const ran = await ticks(store, 'snapshots', syd(14, 6, 0), 24);
    expect(ran).toEqual(['14 06:00', '14 08:00', '14 10:00']);
  });
  test('quiet 23:00 to 06:00 moves the 00:00 slot to 06:00, once', async () => {
    const store = fresh();
    seedOwned(store);
    setCfg(store, 'sync', cfg({ quiet: { from: '23:00', to: '06:00' } }));
    store.priors.set({ key: 'job:sync', value: { lastAt: syd(13, 18, 0).toISOString(), lastOkAt: null, lastDetail: '', fails: 0, skippedReason: null }, n: 0, supersedesDefault: false, updatedAt: '' });
    expect(await ticks(store, 'sync', syd(13, 22, 0), 40)).toEqual(['14 06:00']);
    expect(nextRuns(cfg({ quiet: { from: '23:00', to: '06:00' } }), 'sync', syd(13, 19, 0), SYD, 3).map((s) => localClock(new Date(s), SYD).hh)).toEqual([6, 12, 18]);
  });
  test('paused never runs; Run now (--only --force --manual) runs a paused job, recorded unscheduled', async () => {
    const store = fresh();
    seedOwned(store);
    setCfg(store, 'sync', cfg({ paused: true }));
    expect(await ticks(store, 'sync', syd(14, 0, 0), 96)).toEqual([]);
    expect(await ticks(store, 'sync', syd(15, 9, 7), 1, { force: true, manual: true })).toEqual(['15 09:07']);
    expect(nextRuns(cfg({ paused: true }), 'sync', syd(14, 0, 0), SYD, 3)).toEqual([]);
  });
  test('presets match their configs', () => {
    expect(activePreset(cfg({}), 'sync')).toBe('default');
    expect(activePreset(cfg({ mode: 'times', times: ['07:00', '19:00'] }), 'sync')).toBe('twice');
    expect(activePreset(cfg({ mode: 'times', times: ['08:00'] }), 'sync')).toBeNull();
    expect(JOB_PRESETS.sync.map((p) => p.label)).toEqual(['Four times a day (default)', 'Twice a day (07:00, 19:00)', 'Once a day (07:00)', 'Every 2 hours']);
  });
});

describe('AC-09-22: missed slots and DST', () => {
  test('a 9-hour gap with three missed slots runs once', async () => {
    const store = fresh();
    seedOwned(store);
    setCfg(store, 'sync', cfg({ mode: 'times', times: ['01:00', '04:00', '07:00'] }));
    store.priors.set({ key: 'job:sync', value: { lastAt: syd(14, 0, 0).toISOString(), lastOkAt: null, lastDetail: '', fails: 0, skippedReason: null }, n: 0, supersedesDefault: false, updatedAt: '' });
    // the machine slept from 00:00 to 09:00: the first tick is 09:00
    expect(await ticks(store, 'sync', syd(14, 9, 0), 4)).toEqual(['14 09:00']);
  });
  test('spring forward (4 Oct 2026, 02:00 to 03:00): a 02:30 time runs once, at the first tick after the gap', async () => {
    const store = fresh();
    seedOwned(store);
    const gapEnd = zonedInstant(2026, 10, 4, 2, 30, SYD);
    expect(localClock(gapEnd, SYD)).toMatchObject({ d: 4, hh: 3, mm: 0 });
    setCfg(store, 'sync', cfg({ mode: 'times', times: ['02:30'] }));
    store.priors.set({ key: 'job:sync', value: { lastAt: zonedInstant(2026, 10, 3, 2, 30, SYD).toISOString(), lastOkAt: null, lastDetail: '', fails: 0, skippedReason: null }, n: 0, supersedesDefault: false, updatedAt: '' });
    const start = zonedInstant(2026, 10, 4, 0, 0, SYD);
    expect(await ticks(store, 'sync', start, 16)).toEqual(['4 03:00']);
  });
});

describe('AC-09-23: an edit between two ticks applies on the second, with no launchctl', () => {
  test('the config written in Setup is read by the next tick', async () => {
    const spy = vi.spyOn(childProcess, 'execFile');
    const spawn = vi.spyOn(childProcess, 'spawn');
    const store = fresh();
    seedOwned(store);
    store.priors.set({ key: 'job:snapshots', value: { lastAt: syd(14, 9, 45).toISOString(), lastOkAt: null, lastDetail: '', fails: 0, skippedReason: null }, n: 0, supersedesDefault: false, updatedAt: '' });
    expect(await ticks(store, 'snapshots', syd(14, 10, 0), 1)).toEqual([]); // 15 min after the last: not due at 30 min
    setCfg(store, 'snapshots', cfg({ mode: 'interval', everyMin: 15 }));
    expect(jobConfig(store, 'snapshots').everyMin).toBe(15);
    expect(await ticks(store, 'snapshots', syd(14, 10, 15), 1)).toEqual(['14 10:15']);
    expect(spy).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });
});

describe('AC-09-24: a scheduled run at the line cap', () => {
  test('writes one blocked run and no spend; the config is unchanged', async () => {
    const store = fresh();
    seedOwned(store);
    const c = cfg({ mode: 'times', times: ['07:00'] });
    setCfg(store, 'sync', c);
    const now = new Date();
    store.spend.add({ runId: 'old', provider: 'apify', line: 'apify.sync', units: 1, estUsd: null, actualUsd: 46, dry: false, at: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 1)).toISOString() });
    const spendBefore = store.spend.all().length;
    const jobs = LAB_JOBS.map((j) => (j.id === 'sync' ? { ...j, run: syncBody } : j));
    const res = await runTick(store, { now, dry: false, jobs, only: ['sync'], force: true, lockFile: null, exists: () => false, env: { ...process.env, GLADOS_AUTOMATION_DIR: '/auto' } });
    expect(res.ran.sync?.ok).toBe(false);
    const blocked = store.runs.recent(50).filter((r) => r.status === 'blocked');
    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toMatchObject({ line: 'apify.sync', scheduled: true, job: 'sync' });
    expect(store.spend.all()).toHaveLength(spendBefore);
    expect(jobConfig(store, 'sync')).toEqual(c);
  });
});

describe('AC-09-25: the X single-run guard and the Free plan', () => {
  test('an open tweet-scraper run defers radar.x (no run row, reason set); it runs on the tick after that run finishes', async () => {
    const store = fresh();
    store.sources.upsert({ id: 'w-1', kind: 'watch', platform: 'x', handle: 'sample_lab', url: null, displayName: 'Sample Lab', status: 'active', addedAt: '2026-10-01T00:00:00Z', reason: null, score: null });
    store.runs.insert({ id: 'open-x', kind: 'snapshot', apifyRunId: 'a1', datasetId: null, actor: 'apidojo/tweet-scraper', input: {}, status: 'running', items: null, costUsd: null, dry: false, startedAt: syd(14, 9, 50).toISOString(), finishedAt: null, error: null, line: 'apify.x', job: 'snapshots', scheduled: true, batchId: null, progress: null });
    const calls: LabJobId[] = [];
    const run = (at: Date) => runTick(store, { now: at, dry: false, jobs: fakeJobs(calls), only: ['radar.x'], lockFile: null, exists: () => false, env: { ...process.env, GLADOS_TZ: SYD, GLADOS_AUTOMATION_DIR: '/auto' } });
    const runsBefore = store.runs.recent(50).length;
    const r1 = await run(syd(14, 10, 0));
    expect(r1.skipped['radar.x']).toBe('Waiting for the other X run to finish');
    expect(calls).toEqual([]);
    expect(store.runs.recent(50)).toHaveLength(runsBefore);
    expect((store.priors.get('job:radar.x')!.value as { skippedReason: string }).skippedReason).toBe('Waiting for the other X run to finish');
    store.runs.update('open-x', { status: 'succeeded', finishedAt: syd(14, 10, 5).toISOString() });
    await run(syd(14, 10, 15));
    expect(calls).toEqual(['radar.x']);
  });
  test("on apify:plan tier 'FREE' both X lines refuse with the Free-plan copy", () => {
    const store = fresh();
    store.priors.set({ key: 'apify:plan', value: { tier: 'FREE', planId: 'FREE', maxConcurrentActorRuns: 25, checkedAt: '' }, n: 0, supersedesDefault: false, updatedAt: '' });
    const copy = "The X scraper allows 5 runs a month on Apify's Free plan. X reads are off until you upgrade.";
    expect(lineOffReason('apify.x', { store, env: {} })).toBe(copy);
    expect(lineOffReason('apify.radar_x', { store, env: {} })).toBe(copy);
    expect(lineOffReason('apify.sync', { store, env: {} })).toBeNull();
  });
});

describe('isDueWithConfig', () => {
  test('mode default answers true (the job cadence decides); paused false; weekdays limit interval mode', () => {
    const st = { lastAt: null, lastOkAt: null, lastDetail: '', fails: 0, skippedReason: null };
    expect(isDueWithConfig(cfg({}), st, syd(14, 3), SYD)).toBe(true);
    expect(isDueWithConfig(cfg({ paused: true }), st, syd(14, 3), SYD)).toBe(false);
    // 14 Oct 2026 is a Wednesday (3)
    expect(isDueWithConfig(cfg({ mode: 'interval', everyMin: 60, weekdays: [1] }), st, syd(14, 3), SYD)).toBe(false);
    expect(isDueWithConfig(cfg({ mode: 'interval', everyMin: 60, weekdays: [3] }), st, syd(14, 3), SYD)).toBe(true);
  });
});
