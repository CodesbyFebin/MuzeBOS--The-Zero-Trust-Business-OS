import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { LAB_DDL } from '@/lib/db';
import { labStore } from '@/lib/lab/store';
import { invalidateModeCache } from '@/lib/paths';
import { NETWORK_CHECKS, healthResults, runNetworkCheck, setBinProbe, type NetworkCheckId } from '@/lib/lab/setup/health';
import { clearGoogleTokenCache, type OAuthFetch } from '@/lib/lab/setup/oauth-google';

/**
 * AC-08-8: each network check maps 200, 401 and 500 (fake fetch) to its state; in dry no fetch is
 * called and every network check is `dry`. AC-08-9 for the page render is in
 * tests/lab-setup-view.test.ts (a throwing fetch).
 */
const fresh = () => {
  const db = new Database(':memory:');
  db.exec(LAB_DDL);
  return labStore(db);
};
const KEYS = ['LAB_DRY', 'GLADOS_ENV_LOCAL', 'GLADOS_MODE_FILE', 'DEMO_MODE'] as const;
let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-health-'));
  process.env.GLADOS_ENV_LOCAL = path.join(dir, '.env.local');
  fs.writeFileSync(process.env.GLADOS_ENV_LOCAL, [
    'APIFY_API_TOKEN=apify_api_TESTONLY', 'OPENAI_API_KEY=sk-test', 'LAB_YT_CLIENT_ID=c', 'LAB_YT_CLIENT_SECRET=s', 'LAB_YT_REFRESH_TOKEN=r', 'LAB_YT_CHANNEL_ID=UC1',
    'LAB_IG_ACCESS_TOKEN=ig', `LAB_IG_TOKEN_EXPIRES_AT=${new Date(Date.now() + 30 * 86_400_000).toISOString()}`, 'PRODUCTHUNT_TOKEN=ph', 'GITHUB_TOKEN=gh',
  ].join('\n') + '\n');
  process.env.GLADOS_MODE_FILE = path.join(dir, '.glados-mode');
  process.env.DEMO_MODE = '0';
  invalidateModeCache();
  clearGoogleTokenCache();
  setBinProbe(() => true);
});
afterEach(() => {
  for (const k of KEYS) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]));
  setBinProbe(null);
  invalidateModeCache();
});

const BODY: Record<number, unknown> = {
  200: { data: { id: 'u', plan: { id: 'STARTER', tier: 'BRONZE', maxConcurrentActorRuns: 32 } }, items: [{ id: 'UC1' }], access_token: 'at', expires_in: 3600, resources: { search: { limit: 30 } }, user_id: '1' },
};
const fake = (status: number, calls: string[]): OAuthFetch => async (url) => {
  calls.push(url);
  const body = status === 200 ? BODY[200] : status === 401 && url.includes('graph.instagram.com') ? { error: { type: 'OAuthException', code: 190 } } : status === 401 && url.includes('oauth2.googleapis.com/token') ? { error: 'invalid_grant' } : { error: 'x' };
  // Google answers invalid_grant with 400
  const s = status === 401 && url.includes('oauth2.googleapis.com/token') ? 400 : status;
  return { ok: s >= 200 && s < 300, status: s, json: async () => body, text: async () => JSON.stringify(body) };
};

const EXPECT: Record<NetworkCheckId, Record<200 | 401 | 500, [string, RegExp]>> = {
  'apify.auth': { 200: ['ok', /Connected on the BRONZE tier/], 401: ['fail', /^Apify refused the token\.$/], 500: ['fail', /^Apify did not answer \(HTTP 500\)\.$/] },
  'apify.prices': { 200: ['fail', /recorded/], 401: ['fail', /recorded/], 500: ['fail', /recorded/] },
  'openai.auth': { 200: ['ok', /Connected/], 401: ['fail', /^OpenAI refused the key\.$/], 500: ['fail', /HTTP 500/] },
  'youtube.token': { 200: ['ok', /Connected/], 401: ['fail', /invalid_grant.*7 days/], 500: ['fail', /500/] },
  'instagram.token': { 200: ['ok', /Connected/], 401: ['fail', /^Instagram refused the token\. Reconnect\.$/], 500: ['fail', /HTTP 500/] },
  'producthunt.auth': { 200: ['ok', /Connected/], 401: ['fail', /Product Hunt refused the token/], 500: ['fail', /HTTP 500/] },
  'github.auth': { 200: ['ok', /Connected/], 401: ['fail', /^GitHub refused the token\.$/], 500: ['fail', /HTTP 500/] },
};

describe('AC-08-8: network check state mapping', () => {
  for (const id of NETWORK_CHECKS) {
    for (const status of [200, 401, 500] as const) {
      test(`${id} on HTTP ${status}`, async () => {
        clearGoogleTokenCache();
        const store = fresh();
        const calls: string[] = [];
        const r = await runNetworkCheck(store, id, { fetch: fake(status, calls), now: new Date() });
        const [state, detail] = EXPECT[id][status];
        if (id === 'apify.prices' && status === 200) {
          // the fake answers 200 with no pricingInfos: no book can be parsed, so every actor failed
          expect(r.state).toBe('fail');
        } else expect(r.state).toBe(state);
        expect(r.detail).toMatch(detail);
        expect(calls.length).toBeGreaterThan(0);
        expect((store.priors.get(`health:${id}`)!.value as { state: string }).state).toBe(r.state);
      });
    }
  }
  test('apify.auth stores apify:plan from users/me (09.2.2)', async () => {
    const store = fresh();
    await runNetworkCheck(store, 'apify.auth', { fetch: fake(200, []) });
    expect(store.priors.get('apify:plan')!.value).toMatchObject({ tier: 'BRONZE', planId: 'STARTER', maxConcurrentActorRuns: 32 });
  });
});

describe('AC-08-8: dry makes no calls', () => {
  test('LAB_DRY=1: every network check is dry and the fake fetch is never called', async () => {
    process.env.LAB_DRY = '1';
    const store = fresh();
    const calls: string[] = [];
    for (const id of NETWORK_CHECKS) expect((await runNetworkCheck(store, id, { fetch: fake(200, calls) })).state).toBe('dry');
    expect(calls).toEqual([]);
    expect(healthResults(store).filter((h) => h.network).every((h) => h.state === 'dry')).toBe(true);
  });
});

describe('local checks', () => {
  test('a stale tick lock, the heartbeat, unsettled spend, the schema version, the brain target', () => {
    const store = fresh();
    const now = new Date();
    store.priors.set({ key: 'job:tick', value: { lastAt: now.toISOString(), lastOkAt: new Date(now.getTime() - 3 * 3_600_000).toISOString(), lastDetail: '', fails: 0, skippedReason: null }, n: 0, supersedesDefault: false, updatedAt: '' });
    store.spend.add({ runId: 'r', provider: 'apify', line: 'apify.sync', units: 0, estUsd: null, actualUsd: null, reservedUsd: 0.5, dry: false, at: new Date(now.getTime() - 30 * 3_600_000).toISOString() });
    const h = Object.fromEntries(healthResults(store, { now }).map((x) => [x.id, x]));
    expect(h['schedule.heartbeat'].state).toBe('warn');
    expect(h['spend.unsettled']).toMatchObject({ state: 'warn', detail: '1 charges not settled. The cap counts their reserve.' });
    expect(h['db.schema']).toMatchObject({ state: 'ok', detail: 'Schema version 2.' }); // labStore() runs migrateLabV2
    expect(h['brain.target'].state).toBe('ok');
    expect(h['radar.x'].state).toBe('not_configured');
  });
});
