import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { invalidateModeCache } from '@/lib/paths';
import { getDb } from '@/lib/data';
import { setTickSpawn } from '@/lib/lab/setup/run-now';
import { setLabFetchImpl } from '@/lib/lab/net';

/**
 * AC-09-27 (the schedule endpoint's validation), 09.7 (GET /api/lab/run?plan=1 returns the
 * estimate and marks the plan previewed; POST /api/lab/runs abort), and the caps endpoint.
 * A temp database and .env.local; no network (a throwing labFetch); Run now never spawns a real
 * process (an injected spawner records the args).
 */
const KEYS = ['GLADOS_DB', 'GLADOS_ENV_LOCAL', 'GLADOS_MODE_FILE', 'DEMO_MODE', 'LAB_DRY', 'GLADOS_AUTOMATION_DIR'] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
let envFile: string;
let spawned: string[][];

beforeAll(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-routes-'));
  for (const k of KEYS) delete process.env[k];
  process.env.GLADOS_DB = path.join(dir, 'test.db');
  envFile = path.join(dir, '.env.local');
  process.env.GLADOS_ENV_LOCAL = envFile;
  process.env.GLADOS_MODE_FILE = path.join(dir, '.glados-mode');
  process.env.GLADOS_AUTOMATION_DIR = path.join(dir, 'automation');
  process.env.DEMO_MODE = '0';
  invalidateModeCache();
  setLabFetchImpl(async () => {
    throw new Error('no network in route tests');
  });
});
afterAll(() => {
  for (const k of KEYS) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]));
  setTickSpawn(null);
  setLabFetchImpl(null);
  invalidateModeCache();
});
beforeEach(() => {
  fs.writeFileSync(envFile, 'APIFY_API_TOKEN=apify_api_TESTONLY\n');
  delete process.env.LAB_DRY;
  spawned = [];
  setTickSpawn((args) => void spawned.push(args));
});

const post = (url: string, body: unknown) => new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const schedule = async (body: unknown) => (await import('@/app/api/lab/setup/schedule/route')).POST(post('http://localhost/api/lab/setup/schedule', body));

describe('AC-09-27: POST /api/lab/setup/schedule validation', () => {
  test.each([
    ['everyMin 5', { job: 'snapshots', config: { mode: 'interval', everyMin: 5 } }],
    ['25 times', { job: 'sync', config: { mode: 'times', times: Array.from({ length: 25 }, (_, k) => `${String(k % 24).padStart(2, '0')}:00`) } }],
    ["'25:00'", { job: 'sync', config: { mode: 'times', times: ['25:00'] } }],
    ['an edit of advance other than pause', { job: 'advance', config: { mode: 'interval', everyMin: 60 } }],
    ['a sync param out of range', { job: 'sync', config: { params: { cycleDepth: 80 } } }],
    ['an unknown job', { job: 'nope', config: { paused: true } }],
  ])('rejects %s with 400', async (_name, body) => {
    expect((await schedule(body)).status).toBe(400);
  });

  test('a valid edit saves jobcfg and answers the row; pausing a free job is allowed', async () => {
    const res = await schedule({ job: 'sync', config: { mode: 'times', times: ['07:00', '19:00'], quiet: { from: '23:00', to: '06:00' } } });
    expect(res.status).toBe(200);
    const { row } = await res.json();
    expect(row).toMatchObject({ id: 'sync', editable: true, config: { mode: 'times', times: ['07:00', '19:00'] } });
    expect(row.config.history[0].summary).toMatch(/At 07:00, 19:00/);
    const saved = getDb().lab.priors.get('jobcfg:sync')!.value as { times: string[] };
    expect(saved.times).toEqual(['07:00', '19:00']);
    expect((await schedule({ job: 'advance', config: { paused: true } })).status).toBe(200);
  });

  test('Run now: dry is 409; over the cap is 402; inside the cap spawns a detached manual tick and answers 202 with a batch id', async () => {
    process.env.LAB_DRY = '1';
    const dry = await schedule({ job: 'discover', action: 'run_now' });
    expect(dry.status).toBe(409);
    expect(await dry.json()).toMatchObject({ detail: 'Run now makes paid calls, so it is off in dry runs.' });
    delete process.env.LAB_DRY;
    const ok = await schedule({ job: 'discover', action: 'run_now' });
    expect(ok.status).toBe(202);
    const { batchId } = await ok.json();
    expect(batchId).toMatch(/^lbat-[0-9a-f]{12}$/);
    expect(spawned).toEqual([['tick', '--only', 'discover', '--force', '--manual', '--batch', batchId]]);
    getDb().lab.spend.add({ runId: 'cap', provider: 'apify', line: 'apify.sync', units: 1, estUsd: null, actualUsd: 46, dry: false, at: new Date().toISOString() });
    const capped = await schedule({ job: 'discover', action: 'run_now' });
    expect(capped.status).toBe(402);
    expect(await capped.json()).toMatchObject({ scope: 'line', cap: 46 });
    expect((await schedule({ job: 'discover', action: 'run_now', override: true })).status).toBe(202);
    expect(spawned[1]).toContain('--override');
  });
});

describe('09.7: the run plan and Stop', () => {
  test('GET /api/lab/run?plan=1 prices the plan and marks it previewed', async () => {
    const lab = getDb().lab;
    lab.sources.upsert({ id: 'own-1', kind: 'owned', platform: 'instagram', handle: 'example.studio', url: null, displayName: 'Example Studio', status: 'active', addedAt: '2026-10-01T00:00:00Z', reason: null, score: null });
    const { GET } = await import('@/app/api/lab/run/route');
    const res = await GET(new Request('http://localhost/api/lab/run?plan=1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.estimate.perRun.length).toBeGreaterThan(0);
    expect(body.runs[0].estimate).toMatchObject({ actorId: 'apify/instagram-post-scraper', line: 'apify.sync' });
    expect(body.estimate.month.point).toBeGreaterThan(0);
    expect(lab.priors.get('checklist:plan_previewed')).toBeTruthy();
  });

  test('POST /api/lab/runs abort: 409 when nothing is running; 400 for an unknown action', async () => {
    const { POST } = await import('@/app/api/lab/runs/route');
    expect((await POST(post('http://localhost/api/lab/runs', { action: 'abort', batchId: 'lbat-000000000000' }))).status).toBe(409);
    expect((await POST(post('http://localhost/api/lab/runs', { action: 'pause' }))).status).toBe(400);
  });

  test('POST /api/lab/setup/caps writes the env, says which flag is off, and warns when line caps exceed the provider cap', async () => {
    const { POST } = await import('@/app/api/lab/setup/caps/route');
    const c = await POST(post('http://localhost/api/lab/setup/caps', { target: 'comments', usd: 10 }));
    expect(await c.json()).toMatchObject({ ok: true, env: 'LAB_COMMENTS_CAP_USD', flagOff: 'LAB_COMMENTS is still off. Turn it on to spend on this line.' });
    const a = await POST(post('http://localhost/api/lab/setup/caps', { target: 'apify', usd: 30 }));
    expect(await a.json()).toMatchObject({ warning: 'Line caps add to $98.00 but the Apify cap is $30.00. Lines stop when the Apify cap is reached.' });
    expect(fs.readFileSync(envFile, 'utf8')).toContain('LAB_APIFY_CAP_USD=30');
    expect((await POST(post('http://localhost/api/lab/setup/caps', { target: 'stt', usd: 1.234 }))).status).toBe(400);
    expect((await POST(post('http://localhost/api/lab/setup/caps', { target: 'llm', usd: 1 }))).status).toBe(400);
  });
});
