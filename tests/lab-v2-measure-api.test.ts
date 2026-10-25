import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { invalidateModeCache } from '@/lib/paths';
import { getDb } from '@/lib/data';
import { advanceJob, snapshotsJob, verdictsJob } from '@/lib/lab/measure/jobs';

/**
 * Section 04's routes and job bodies: a temp database, a blank Apify token, Filming off. Writes run
 * only under LAB_DRY=1 (fixtures, no network); without a token and not dry they refuse.
 */
const KEYS = ['GLADOS_DB', 'GLADOS_ENV_LOCAL', 'GLADOS_MODE_FILE', 'DEMO_MODE', 'LAB_DRY', 'APIFY_API_TOKEN', 'GLADOS_TZ'] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

beforeAll(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-measure-api-'));
  for (const k of KEYS) delete process.env[k];
  process.env.GLADOS_DB = path.join(dir, 'test.db');
  fs.writeFileSync(path.join(dir, '.env.local'), 'APIFY_API_TOKEN=\n');
  process.env.GLADOS_ENV_LOCAL = path.join(dir, '.env.local');
  process.env.GLADOS_MODE_FILE = path.join(dir, '.glados-mode');
  process.env.DEMO_MODE = '0';
  process.env.GLADOS_TZ = 'UTC';
  invalidateModeCache();
});
afterAll(() => {
  for (const k of KEYS) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]));
  invalidateModeCache();
});
beforeEach(() => {
  delete process.env.LAB_DRY;
});

const post = (url: string, body: unknown) => new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('/api/lab/snapshots and /api/lab/verify-actors', () => {
  test('GET answers on a blank install: nothing due, no hit rate, the next tick', async () => {
    const { GET } = await import('@/app/api/lab/snapshots/route');
    const res = await GET(new Request('http://localhost/api/lab/snapshots'));
    expect(res.status).toBe(200);
    const b = (await res.json()) as { due: unknown[]; hitRate: { rate: number | null }; nextTickAt: string; thinned: boolean };
    expect(b.due).toEqual([]);
    expect(b.hitRate.rate).toBeNull();
    expect(b.thinned).toBe(false);
    expect(Date.parse(b.nextTickAt)).toBeGreaterThan(Date.now());
  });

  test('without a token and not dry, writes refuse with the setup link; sample is read-only', async () => {
    const { POST } = await import('@/app/api/lab/snapshots/route');
    const v = await import('@/app/api/lab/verify-actors/route');
    expect((await POST(post('http://localhost/api/lab/snapshots', {}))).status).toBe(409);
    expect((await v.POST(post('http://localhost/api/lab/verify-actors', {}))).status).toBe(409);
    expect((await POST(post('http://localhost/api/lab/snapshots?sample=1', {}))).status).toBe(409);
    expect((await POST(post('http://localhost/api/lab/snapshots', { preview: 'yes' }))).status).toBe(400);
  });

  test('dry: verify-actors files reports on the apify.verify line; a snapshot preview starts nothing', async () => {
    process.env.LAB_DRY = '1';
    const store = getDb().lab;
    store.sources.upsert({ id: 'own-tt', kind: 'owned', platform: 'tiktok', handle: 'studio.one', url: null, displayName: 'Studio', status: 'active', addedAt: new Date().toISOString(), reason: null, score: null });
    const v = await import('@/app/api/lab/verify-actors/route');
    const res = await v.POST(post('http://localhost/api/lab/verify-actors', {}));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runs: { kind: string }[]; pending: number; reports: Record<string, { status: string }> };
    expect(body.pending).toBe(0);
    expect(body.runs.length).toBeGreaterThan(0);
    expect(body.reports['clockworks/tiktok-scraper']).toBeDefined();
    expect(store.runs.recent().every((r) => r.line === 'apify.verify' && r.dry)).toBe(true);
    const before = store.runs.recent().length;
    const { POST } = await import('@/app/api/lab/snapshots/route');
    const preview = await POST(post('http://localhost/api/lab/snapshots', { preview: true }));
    expect(preview.status).toBe(200);
    expect(((await preview.json()) as { spend: { line: string } }).spend.line).toBe('apify.snapshots');
    expect(store.runs.recent().length).toBe(before);
  });

  test('job bodies: dry advance has nothing to do; verdicts and snapshots report', async () => {
    process.env.LAB_DRY = '1';
    const store = getDb().lab;
    const now = new Date('2026-10-10T08:05:00.000Z');
    expect(await advanceJob({ store, now, scheduled: true, dry: true })).toMatchObject({ ok: true, items: 0 });
    expect((await verdictsJob({ store, now, scheduled: true, dry: true })).ok).toBe(true);
    const s = await snapshotsJob({ store, now, scheduled: true, dry: true });
    expect(s.ok).toBe(true);
    expect(s.detail).toMatch(/1 discovery/);
    expect(store.runs.recent().some((r) => r.kind === 'snapshot' && r.job === 'snapshots' && r.scheduled)).toBe(true);
  });
});
