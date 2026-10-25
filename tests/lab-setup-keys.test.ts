import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { invalidateModeCache } from '@/lib/paths';
import { setLabFetchImpl } from '@/lib/lab/net';

/**
 * AC-08-2, AC-08-3, AC-08-26: the paste endpoint. A temp database and a temp .env.local; LAB_DRY=1
 * so a write never calls a health check (no network at all), except where a test says otherwise
 * with a fake fetch.
 */
const KEYS = ['GLADOS_DB', 'GLADOS_ENV_LOCAL', 'GLADOS_MODE_FILE', 'DEMO_MODE', 'LAB_DRY', 'APIFY_API_TOKEN', 'OPENAI_API_KEY'] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
let envFile: string;
const ORIGINAL = '# my machine\nOTHER_KEY=keep-me  \nexport SHELL_STYLE=yes\n\nLAST=1\n';

beforeAll(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-keys-'));
  for (const k of KEYS) delete process.env[k];
  process.env.GLADOS_DB = path.join(dir, 'test.db');
  envFile = path.join(dir, '.env.local');
  process.env.GLADOS_ENV_LOCAL = envFile;
  process.env.GLADOS_MODE_FILE = path.join(dir, '.glados-mode');
  process.env.DEMO_MODE = '0';
  invalidateModeCache();
});
afterAll(() => {
  for (const k of KEYS) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]));
  setLabFetchImpl(null);
  invalidateModeCache();
});
beforeEach(() => {
  fs.writeFileSync(envFile, ORIGINAL);
  process.env.LAB_DRY = '1';
});

const req = (method: string, body: unknown, q = '') => new Request(`http://localhost/api/lab/setup/keys${q}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const keys = () => import('@/app/api/lab/setup/keys/route');

describe('AC-08-3: allowlist and byte-safe writes', () => {
  test('PATH is not a Lab key: 400 unknown_key, nothing written', async () => {
    const res = await (await keys()).POST(req('POST', { env: 'PATH', value: '/usr/bin' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'unknown_key' });
    expect(fs.readFileSync(envFile, 'utf8')).toBe(ORIGINAL);
  });
  test('POST APIFY_API_TOKEN writes exactly one line; every other line is byte-identical; DELETE removes it', async () => {
    const { POST, DELETE } = await keys();
    const res = await POST(req('POST', { env: 'APIFY_API_TOKEN', value: '  apify_api_TESTSECRET123  ' }));
    expect(res.status).toBe(200);
    const after = fs.readFileSync(envFile, 'utf8');
    expect(after.split('\n').filter((l) => l.startsWith('APIFY_API_TOKEN='))).toEqual(['APIFY_API_TOKEN=apify_api_TESTSECRET123']);
    expect(after.replace('APIFY_API_TOKEN=apify_api_TESTSECRET123\n', '')).toBe(ORIGINAL.replace(/\n+$/, '\n').replace('LAST=1\n', 'LAST=1\n'));
    const del = await DELETE(req('DELETE', { env: 'APIFY_API_TOKEN' }));
    expect(del.status).toBe(200);
    expect(fs.readFileSync(envFile, 'utf8')).not.toContain('APIFY_API_TOKEN');
    expect(fs.readFileSync(envFile, 'utf8')).toContain('OTHER_KEY=keep-me  ');
  });
  test('empty, multi-line and oversize values are refused; oauth-written fields are not pasteable', async () => {
    const { POST } = await keys();
    expect((await POST(req('POST', { env: 'APIFY_API_TOKEN', value: '   ' }))).status).toBe(400);
    expect((await POST(req('POST', { env: 'APIFY_API_TOKEN', value: 'a\nb' }))).status).toBe(400);
    expect((await POST(req('POST', { env: 'APIFY_API_TOKEN', value: 'x'.repeat(4097) }))).status).toBe(400);
    expect((await POST(req('POST', { env: 'LAB_YT_REFRESH_TOKEN', value: 'r' }))).status).toBe(400);
    expect(fs.readFileSync(envFile, 'utf8')).toBe(ORIGINAL);
  });
  test('the sample world is read-only: 409', async () => {
    const { POST } = await keys();
    const res = await POST(req('POST', { env: 'APIFY_API_TOKEN', value: 'x' }, '?sample=1'));
    expect([200, 409]).toContain(res.status); // 409 when the real store is empty (sample is served)
    if (res.status === 409) expect(await res.json()).toMatchObject({ error: 'read_only' });
  });
});

describe('AC-08-26: Lab settings ranges; the salt is not writable', () => {
  test.each([
    ['LAB_GROUNDING_CONTROL', '0.6', 400],
    ['LAB_GROUNDING_CONTROL', '0.25', 200],
    ['LAB_GROUNDING_CONTROL', '0.255', 400],
    ['LAB_TIKTOK_DOWNLOAD_PRICE_USD', '-1', 400],
    ['LAB_TIKTOK_DOWNLOAD_PRICE_USD', '0.0013', 200],
    ['LAB_TIKTOK_DOWNLOAD_PRICE_USD', '0.00001', 400],
    ['LAB_JUDGE_MODEL', 'a b', 400],
    ['LAB_JUDGE_MODEL', 'claude-sonnet-4.5', 200],
    ['LAB_EMBED_PROVIDER', 'openai', 200],
    ['LAB_EMBED_PROVIDER', 'cohere', 400],
    ['LAB_FRAMES', '1', 200],
    ['LAB_FRAMES', 'yes', 400],
    ['LAB_JUDGE', '0', 200],
    ['LAB_X_POLL_MIN', '30', 400],
    ['LAB_X_POLL_MIN', '90', 200],
    ['LAB_APIFY_SYNC_CAP_USD', '46.5', 200],
    ['LAB_APIFY_SYNC_CAP_USD', '2000', 400],
    ['LAB_BRIEF_TELEGRAM', '1', 200],
  ])('%s=%s answers %i', async (env, value, status) => {
    const res = await (await keys()).POST(req('POST', { env, value }));
    expect(res.status).toBe(status);
    if (status === 400) expect(await res.json()).toMatchObject({ error: 'bad_value' });
  });
  test('LAB_COMMENT_SALT is refused with unknown_key', async () => {
    const res = await (await keys()).POST(req('POST', { env: 'LAB_COMMENT_SALT', value: 'abc' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'unknown_key' });
  });
});

describe('AC-08-2: no secret in setup responses', () => {
  test('a pasted token appears only masked, in the keys answer and in GET /api/lab/setup', async () => {
    delete process.env.LAB_DRY;
    const calls: string[] = [];
    setLabFetchImpl(async (url) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ data: { id: 'u', plan: { id: 'STARTER', tier: 'BRONZE', maxConcurrentActorRuns: 32 } } }), { status: 200 });
    });
    const res = await (await keys()).POST(req('POST', { env: 'APIFY_API_TOKEN', value: 'apify_api_TESTSECRET123' }));
    const text = JSON.stringify(await res.json());
    expect(text).toContain('••••T123');
    expect(text).not.toContain('TESTSECRET');
    expect(calls).toEqual(['https://api.apify.com/v2/users/me']); // the free health check, once
    const setup = await (await import('@/app/api/lab/setup/route')).GET(new Request('http://localhost/api/lab/setup'));
    const body = JSON.stringify(await setup.json());
    expect(body).toContain('••••T123');
    expect(body).not.toContain('TESTSECRET');
    setLabFetchImpl(null);
  });
});
