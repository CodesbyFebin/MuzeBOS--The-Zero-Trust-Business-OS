import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { invalidateModeCache } from '@/lib/paths';
import { readEnvLocal } from '@/lib/creds';
import { setLabFetchImpl } from '@/lib/lab/net';
import { clearGoogleTokenCache, googleAccessToken, InvalidGrantError } from '@/lib/lab/setup/oauth-google';
import { finishOAuth, startOAuth } from '@/lib/lab/setup/oauth-flow';

/**
 * AC-08-4 and AC-08-5. Every network call goes to a fake fetch (setLabFetchImpl); no real
 * Google or Meta endpoint is reached. Client ids and secrets are test strings.
 */
const KEYS = ['GLADOS_DB', 'GLADOS_ENV_LOCAL', 'GLADOS_MODE_FILE', 'DEMO_MODE', 'LAB_DRY', 'PORT'] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
let envFile: string;
const BASE = 'LAB_YT_CLIENT_ID=yt-client\nLAB_YT_CLIENT_SECRET=yt-secret\nLAB_IG_APP_ID=ig-app\nLAB_IG_APP_SECRET=ig-secret\nUNRELATED=1\n';

beforeAll(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-oauth-'));
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

type Call = { url: string; body?: string };
let calls: Call[];
beforeEach(() => {
  fs.writeFileSync(envFile, BASE);
  calls = [];
  clearGoogleTokenCache();
  setLabFetchImpl(async (url, init) => {
    const u = String(url);
    calls.push({ url: u, body: typeof init?.body === 'string' ? init.body : undefined });
    const ok = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
    if (u === 'https://oauth2.googleapis.com/token') {
      if (init?.body && String(init.body).includes('refresh_token=dead')) return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
      return ok({ access_token: 'at-1', expires_in: 3600, refresh_token: 'rt-1' });
    }
    if (u.startsWith('https://www.googleapis.com/youtube/v3/channels')) return ok({ items: [{ id: 'UC-test' }] });
    if (u.startsWith('https://oauth2.googleapis.com/revoke')) return ok({});
    if (u === 'https://api.instagram.com/oauth/access_token') return ok({ access_token: 'ig-short', user_id: 7 });
    if (u.startsWith('https://graph.instagram.com/access_token')) return ok({ access_token: 'ig-long', expires_in: 5_184_000 });
    if (u.startsWith('https://graph.instagram.com/me')) return ok({ user_id: '17841', username: 'example.studio' });
    return new Response('{}', { status: 404 });
  });
});

const oauthFields = () => Object.keys(readEnvLocal()).filter((k) => /^LAB_(YT|IG)_/.test(k)).sort();

describe('AC-08-4: state, writes, disconnect, smoke', () => {
  test('start sets a state cookie and an authorize URL with PKCE; dry answers 409', () => {
    const out = startOAuth('youtube', { port: 4315, readOnly: false });
    expect(out.status).toBe(200);
    if (out.status !== 200) return;
    const u = new URL(out.url);
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('redirect_uri')).toBe('http://localhost:4315/api/lab/oauth/youtube/callback');
    expect(out.cookie.split('.')[0]).toBe(u.searchParams.get('state'));
    process.env.LAB_DRY = '1';
    expect(startOAuth('youtube', { port: 4315, readOnly: false })).toEqual({ status: 409, error: 'dry' });
    delete process.env.LAB_DRY;
    expect(startOAuth('instagram', { port: 4315, readOnly: true })).toEqual({ status: 409, error: 'read_only' });
  });

  test('a state mismatch writes nothing and makes no call', async () => {
    const out = startOAuth('youtube', { port: 4315, readOnly: false });
    if (out.status !== 200) throw new Error('start failed');
    const res = await finishOAuth('youtube', new URLSearchParams({ code: 'c', state: 'not-the-state' }), out.cookie, { port: 4315 });
    expect(res).toBe('error');
    expect(calls).toEqual([]);
    expect(oauthFields()).toEqual(['LAB_YT_CLIENT_ID', 'LAB_YT_CLIENT_SECRET', 'LAB_IG_APP_ID', 'LAB_IG_APP_SECRET'].sort());
    expect(await finishOAuth('youtube', new URLSearchParams({ code: 'c', state: 'x' }), null, { port: 4315 })).toBe('error');
  });

  test('a good YouTube callback writes exactly the oauth fields; disconnect removes them and revokes', async () => {
    const out = startOAuth('youtube', { port: 4315, readOnly: false });
    if (out.status !== 200) throw new Error('start failed');
    const state = out.cookie.split('.')[0];
    expect(await finishOAuth('youtube', new URLSearchParams({ code: 'the-code', state }), out.cookie, { port: 4315 })).toBe('ok');
    const env = readEnvLocal();
    expect(env.LAB_YT_REFRESH_TOKEN).toBe('rt-1');
    expect(env.LAB_YT_CHANNEL_ID).toBe('UC-test');
    expect(env.LAB_YT_CONNECTED_AT).toBeTruthy();
    expect(env.UNRELATED).toBe('1');
    expect(calls[0].body).toContain('code_verifier=');
    const { POST } = await import('@/app/api/lab/oauth/[provider]/disconnect/route');
    const res = await POST(new Request('http://localhost/api/lab/oauth/youtube/disconnect', { method: 'POST' }), { params: { provider: 'youtube' } });
    expect(res.status).toBe(200);
    expect(calls.some((c) => c.url.startsWith('https://oauth2.googleapis.com/revoke'))).toBe(true);
    expect(readEnvLocal().LAB_YT_REFRESH_TOKEN).toBeUndefined();
    expect(readEnvLocal().LAB_YT_CLIENT_ID).toBe('yt-client');
    expect(JSON.stringify(await res.json())).not.toContain('rt-1');
  });

  test('a good Instagram callback: short then long-lived token, the user id and the expiry', async () => {
    const out = startOAuth('instagram', { port: 4315, readOnly: false });
    if (out.status !== 200) throw new Error('start failed');
    expect(await finishOAuth('instagram', new URLSearchParams({ code: 'c', state: out.cookie }), out.cookie, { port: 4315, now: new Date('2026-10-12T00:00:00Z') })).toBe('ok');
    const env = readEnvLocal();
    expect(env.LAB_IG_ACCESS_TOKEN).toBe('ig-long');
    expect(env.LAB_IG_USER_ID).toBe('17841');
    expect(env.LAB_IG_TOKEN_EXPIRES_AT).toBe('2026-12-11T00:00:00.000Z');
  });

  test('a denied consent: denied, nothing written', async () => {
    expect(await finishOAuth('instagram', new URLSearchParams({ error: 'access_denied', error_description: '<script>' }), null, { port: 4315 })).toBe('denied');
    expect(readEnvLocal().LAB_IG_ACCESS_TOKEN).toBeUndefined();
  });

  test('GET callback with no params answers 200 "No sign-in in progress."; with params it 303s without echoing a value', async () => {
    const { GET } = await import('@/app/api/lab/oauth/[provider]/callback/route');
    const none = await GET(new Request('http://localhost/api/lab/oauth/youtube/callback'), { params: { provider: 'youtube' } });
    expect(none.status).toBe(200);
    expect(await none.text()).toBe('No sign-in in progress.');
    const denied = await GET(new Request('http://localhost/api/lab/oauth/youtube/callback?error=access_denied&error_description=EVIL'), { params: { provider: 'youtube' } });
    expect(denied.status).toBe(303);
    expect(denied.headers.get('location')).toBe('/lab?setup=keys&oauth=youtube.denied');
    expect(await denied.text()).not.toContain('EVIL');
  });

  test('googleAccessToken: minted once and held in memory; invalid_grant throws the Testing copy', async () => {
    fs.appendFileSync(envFile, 'LAB_YT_REFRESH_TOKEN=rt-live\n');
    expect(await googleAccessToken()).toBe('at-1');
    expect(await googleAccessToken()).toBe('at-1');
    expect(calls.filter((c) => c.url === 'https://oauth2.googleapis.com/token')).toHaveLength(1);
    clearGoogleTokenCache();
    fs.writeFileSync(envFile, `${BASE}LAB_YT_REFRESH_TOKEN=dead\n`);
    await expect(googleAccessToken()).rejects.toBeInstanceOf(InvalidGrantError);
    await expect(googleAccessToken()).rejects.toThrow('If the app is in Testing, tokens last 7 days.');
  });
});

describe('AC-08-5: no token logging', () => {
  test('no console.* call in lib/lab/setup/oauth*.ts or app/api/lab/oauth/** takes a token, secret or code variable', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name)) files.push(p);
      }
    };
    walk(path.join(process.cwd(), 'app/api/lab/oauth'));
    for (const f of fs.readdirSync(path.join(process.cwd(), 'lib/lab/setup'))) if (f.startsWith('oauth')) files.push(path.join(process.cwd(), 'lib/lab/setup', f));
    expect(files.length).toBeGreaterThanOrEqual(6);
    const bad: string[] = [];
    for (const f of files) {
      for (const m of fs.readFileSync(f, 'utf8').matchAll(/console\.\w+\(([^)]*)\)/g)) if (/token|secret|code/i.test(m[1])) bad.push(`${path.basename(f)}: ${m[0]}`);
    }
    expect(bad).toEqual([]);
  });
});
