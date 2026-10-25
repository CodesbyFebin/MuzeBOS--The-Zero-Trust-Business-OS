import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { LAB_DDL } from '@/lib/db';
import { labStore } from '@/lib/lab/store';
import { invalidateModeCache } from '@/lib/paths';
import { seedLabFixtures } from '@/lib/lab/fixtures';
import { DryNetworkError, labFetch, setLabFetchImpl } from '@/lib/lab/net';
import { runTick } from '@/lib/lab/setup/jobs';
import { setBinProbe } from '@/lib/lab/setup/health';

/**
 * AC-08-17: with LAB_DRY=1 a full forced tick over the `full` fixture world makes zero fetch calls
 * (spy through labFetch and on the global) and no DryNetworkError; a direct labFetch to Apify
 * throws; no file under lib/lab/** or app/api/lab/** calls the global fetch directly.
 */
const KEYS = ['LAB_DRY', 'GLADOS_DATA_DIR', 'GBRAIN_STORE', 'GLADOS_ENV_LOCAL', 'GLADOS_MODE_FILE', 'DEMO_MODE', 'GLADOS_AUTOMATION_DIR'] as const;
let saved: Record<string, string | undefined>;
let calls: string[];
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-net-'));
  process.env.LAB_DRY = '1';
  process.env.GLADOS_DATA_DIR = path.join(tmp, 'data');
  process.env.GBRAIN_STORE = path.join(tmp, 'real-brain');
  process.env.GLADOS_ENV_LOCAL = path.join(tmp, '.env.local');
  process.env.GLADOS_MODE_FILE = path.join(tmp, '.glados-mode');
  process.env.GLADOS_AUTOMATION_DIR = path.join(tmp, 'automation');
  invalidateModeCache();
  calls = [];
  setLabFetchImpl(async (u) => {
    calls.push(String(u));
    return new Response('{}');
  });
  vi.stubGlobal('fetch', async (u: unknown) => {
    calls.push(`global:${String(u)}`);
    return new Response('{}');
  });
  setBinProbe(() => true);
});
afterEach(() => {
  for (const k of KEYS) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]));
  setLabFetchImpl(null);
  vi.unstubAllGlobals();
  setBinProbe(null);
  invalidateModeCache();
});

describe('AC-08-17: the dry network guard', () => {
  test('a forced tick over the full fixture world makes zero fetch calls and raises no DryNetworkError', async () => {
    const db = new Database(':memory:');
    db.exec(LAB_DDL);
    const store = labStore(db);
    seedLabFixtures(store, new Date('2026-10-12T03:00:00Z'));
    const res = await runTick(store, { now: new Date('2026-10-12T04:00:00Z'), dry: true, force: true, lockFile: null });
    expect(calls).toEqual([]);
    const details = Object.values(res.ran).map((r) => r!.detail);
    expect(details.some((d) => /Dry run: no network call/.test(d))).toBe(false);
    // the jobs whose bodies are this lane's or v1's ran clean in dry
    for (const id of ['advance', 'health', 'sync', 'discover'] as const) expect(res.ran[id]?.ok, `${id}: ${res.ran[id]?.detail}`).toBe(true);
    expect(store.spend.all().filter((s) => s.at >= '2026-10-12T04:00:00Z').every((s) => s.dry && s.actualSource === 'dry')).toBe(true);
  }, 60_000);

  test('a direct labFetch to Apify in dry throws DryNetworkError; localhost is allowed', async () => {
    await expect(labFetch('https://api.apify.com/v2/users/me')).rejects.toBeInstanceOf(DryNetworkError);
    await expect(labFetch('http://localhost:4315/api/lab')).resolves.toBeInstanceOf(Response);
  });

  test('no file under lib/lab/** or app/api/lab/** calls the global fetch directly', () => {
    const bad: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name) && p !== path.join(process.cwd(), 'lib/lab/net.ts')) {
          const src = fs.readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
          if (/(^|[^.\w])fetch\s*\(/.test(src)) bad.push(path.relative(process.cwd(), p));
          // every Apify client built outside apify-client.ts carries an explicit fetch (labFetch via apify-live.ts)
          for (const m of src.matchAll(/createApifyClient\(\{([^}]*)\}\)/g)) if (!/fetch/.test(m[1]) && !p.endsWith('apify-client.ts')) bad.push(`${path.relative(process.cwd(), p)}: createApifyClient without fetch`);
        }
      }
    };
    walk(path.join(process.cwd(), 'lib/lab'));
    walk(path.join(process.cwd(), 'app/api/lab'));
    expect(bad).toEqual([]);
  });
});
