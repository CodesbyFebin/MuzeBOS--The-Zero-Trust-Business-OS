import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { LAB_DDL } from '@/lib/db';
import { labStore } from '@/lib/lab/store';
import { CapError, capEnvFor, capFor, DEFAULT_LINE_CAPS, enforceCap, gatedCall, lineCapFor, lineOffReason, lineSpend, monthSpend, monthStart, settleSpend, spendMeter } from '@/lib/lab/spend';
import { dryLabel, dryReason, isDry } from '@/lib/lab/dry';
import { invalidateModeCache } from '@/lib/paths';
import { LAB_RUN_KINDS, LAB_SPEND_LINES, LAB_SPEND_PROVIDERS, LabRunKindSchema, providerOf } from '@/lib/schemas';

const fresh = () => {
  const db = new Database(':memory:');
  db.exec(LAB_DDL);
  return labStore(db);
};

/** Each test runs with no .env.local, no Filming and no LAB_DRY unless it sets them. */
const KEYS = [
  'LAB_DRY', 'LAB_APIFY_CAP_USD', 'LAB_STT_CAP_USD', 'LAB_APIFY_SNAPSHOTS_CAP_USD', 'LAB_APIFY_SYNC_CAP_USD', 'LAB_RUN_MAX_USD',
  'LAB_COMMENTS', 'LAB_COMMENTS_CAP_USD', 'LAB_TIKTOK_DOWNLOADS', 'LAB_DOWNLOADS_CAP_USD', 'LAB_EMBED_PROVIDER', 'LAB_EMBED_CAP_USD',
  'GLADOS_ENV_LOCAL', 'GLADOS_MODE_FILE', 'DEMO_MODE', 'GLADOS_DATA_DIR',
] as const;
let saved: Record<string, string | undefined>;
let dir: string;
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-spend-'));
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
const live = (actualUsd: number | null, extra = {}) => async () => ({ result: 'live', units: 10, actualUsd, items: 10, ...extra });
const dry = () => ({ result: 'dry', units: 0, items: 0 });
const spent = (s: ReturnType<typeof fresh>, line: (typeof LAB_SPEND_LINES)[number], usd: number, opts: { reserved?: boolean; at?: string } = {}) =>
  s.spend.add({ runId: `r-${Math.random()}`, provider: providerOf(line), line, units: 1, estUsd: null, actualUsd: opts.reserved ? null : usd, reservedUsd: opts.reserved ? usd : null, dry: false, at: opts.at ?? '2026-10-02T00:00:00.000Z' });

describe('dry mode (LAB_DRY=1 or Filming)', () => {
  test('LAB_DRY=1 and Filming each switch dry on and say which', () => {
    expect(isDry()).toBe(false);
    expect(dryReason()).toBeNull();
    process.env.LAB_DRY = '1';
    expect(isDry()).toBe(true);
    expect(dryLabel()).toBe('LAB_DRY=1 · fixtures, no charges');
    delete process.env.LAB_DRY;
    process.env.DEMO_MODE = '1';
    invalidateModeCache();
    expect(dryReason()).toBe('filming');
    expect(dryLabel()).toBe('Filming · no charges');
  });

  test('a fresh .env.local LAB_DRY wins without a restart', () => {
    fs.writeFileSync(process.env.GLADOS_ENV_LOCAL!, 'LAB_DRY=1\n');
    expect(isDry()).toBe(true);
  });

  test('a dry gated call never touches the live branch and writes a 0-cost dry ledger row on its line', async () => {
    process.env.LAB_DRY = '1';
    const s = fresh();
    let liveCalled = false;
    const out = await gatedCall(s, { provider: 'apify', line: 'apify.sync', kind: 'scrape', actor: 'apify/instagram-post-scraper', now: NOW }, {
      live: async () => {
        liveCalled = true;
        throw new Error('must not run');
      },
      dry,
    });
    expect(liveCalled).toBe(false);
    expect(out).toMatchObject({ dry: true, result: 'dry', reserveUsd: null });
    expect(out.run).toMatchObject({ status: 'succeeded', dry: true, costUsd: 0, line: 'apify.sync' });
    expect(s.spend.all()).toEqual([expect.objectContaining({ provider: 'apify', line: 'apify.sync', dry: true, actualUsd: 0, actualSource: 'dry' })]);
  });

  test('dry ignores caps and off lines entirely (nothing to protect)', async () => {
    process.env.LAB_DRY = '1';
    process.env.LAB_APIFY_CAP_USD = '0';
    const s = fresh();
    await expect(gatedCall(s, { provider: 'apify', line: 'apify.sync', kind: 'scrape', now: NOW }, { live: live(1), dry })).resolves.toMatchObject({ dry: true });
    await expect(gatedCall(s, { provider: 'comments', line: 'comments', kind: 'comments', now: NOW }, { live: live(1), dry })).resolves.toMatchObject({ dry: true });
  });
});

describe('providers, lines and caps (08.6.1, C21)', () => {
  test('defaults: Apify $98 = the sum of its seven line caps; STT $13; comments, downloads and embed off; the local LLM uncapped', () => {
    expect(capFor('apify', {})).toBe(98);
    const apifyLines = LAB_SPEND_LINES.filter((l) => providerOf(l) === 'apify');
    expect(apifyLines.reduce((a, l) => a + (DEFAULT_LINE_CAPS[l] ?? 0), 0)).toBe(98);
    expect(lineCapFor('apify.sync', {})).toBe(46);
    expect(lineCapFor('apify.snapshots', {})).toBe(22);
    expect(lineCapFor('apify.x', {})).toBe(10);
    expect(lineCapFor('apify.verify', {})).toBe(1);
    expect(lineCapFor('apify.radar_x', {})).toBe(15);
    expect(lineCapFor('apify.radar_tiktok', {})).toBe(3);
    expect(lineCapFor('apify.radar_producthunt', {})).toBe(1);
    expect(capFor('stt', {})).toBe(13);
    expect(lineCapFor('stt.controls', {})).toBe(3);
    expect(lineCapFor('stt', {})).toBeNull(); // general line: the provider cap bounds it
    expect(capFor('comments', {})).toBe(0);
    expect(capFor('downloads', {})).toBe(0);
    expect(capFor('embed', {})).toBe(0);
    expect(capFor('llm', {})).toBeNull();
    expect(capFor('apify', { LAB_APIFY_CAP_USD: '12.5' })).toBe(12.5);
    expect(capFor('apify', { LAB_APIFY_CAP_USD: '' })).toBe(98);
    expect(capFor('apify', { LAB_APIFY_CAP_USD: 'lots' })).toBe(98);
  });

  test('cap env names follow one rule; providerOf is the text before the first dot', () => {
    expect(capEnvFor('apify')).toBe('LAB_APIFY_CAP_USD');
    expect(capEnvFor('apify.radar_producthunt')).toBe('LAB_APIFY_RADAR_PRODUCTHUNT_CAP_USD');
    expect(capEnvFor('stt.controls')).toBe('LAB_STT_CONTROLS_CAP_USD');
    expect(capEnvFor('stt')).toBe('LAB_STT_CAP_USD');
    expect(capEnvFor('llm')).toBeNull();
    for (const line of LAB_SPEND_LINES) expect(LAB_SPEND_PROVIDERS).toContain(providerOf(line));
    expect(providerOf('apify.x')).toBe('apify');
    expect(providerOf('embed')).toBe('embed');
  });

  test('LabRunKindSchema accepts exactly the 21 kinds of 08.6.3 item 5', () => {
    expect(LAB_RUN_KINDS).toHaveLength(21);
    for (const k of ['scrape', 'profile', 'search', 'transcribe', 'dissect', 'distill', 'ideas', 'script', 'snapshot', 'verify', 'radar', 'brief', 'retention', 'grade', 'backtest', 'oauth_refresh', 'judge', 'comments', 'frames', 'embed', 'health']) {
      expect(LabRunKindSchema.safeParse(k).success).toBe(true);
    }
    for (const k of ['oauth', 'download', 'sync', '']) expect(LabRunKindSchema.safeParse(k).success).toBe(false);
  });

  test('month spend counts non-dry rows this month as actual ?? estimate ?? reserve', () => {
    const s = fresh();
    s.spend.add({ runId: 'a', provider: 'apify', units: 1, estUsd: 9, actualUsd: 1.5, dry: false, at: '2026-10-02T00:00:00.000Z' });
    s.spend.add({ runId: 'b', provider: 'apify', units: 1, estUsd: 2, actualUsd: null, dry: false, at: '2026-10-03T00:00:00.000Z' });
    s.spend.add({ runId: 'c', provider: 'apify', units: 1, estUsd: 0, actualUsd: 0, dry: true, at: '2026-10-03T00:00:00.000Z' });
    s.spend.add({ runId: 'd', provider: 'apify', units: 1, estUsd: null, actualUsd: 50, dry: false, at: '2026-09-30T23:59:59.000Z' });
    s.spend.add({ runId: 'e', provider: 'stt', units: 1, estUsd: null, actualUsd: 4, dry: false, at: '2026-10-03T00:00:00.000Z' });
    s.spend.add({ runId: 'f', provider: 'apify', line: 'apify.snapshots', units: 1, estUsd: null, actualUsd: null, reservedUsd: 0.75, dry: false, at: '2026-10-04T00:00:00.000Z' });
    expect(monthStart(NOW)).toBe('2026-10-01T00:00:00.000Z');
    expect(monthSpend(s, 'apify', NOW)).toBe(4.25);
    expect(lineSpend(s, 'apify.sync', NOW)).toBe(3.5); // v1 rows with no line count as apify.sync
    expect(lineSpend(s, 'apify.snapshots', NOW)).toBe(0.75);
    expect(monthSpend(s, 'stt', NOW)).toBe(4);
  });

  test('the 08.6.3 worked example reproduces exactly', async () => {
    process.env.LAB_APIFY_CAP_USD = '88';
    process.env.LAB_RUN_MAX_USD = '3';
    // this month on apify.snapshots: settled $19.10 and one pending run with reserved_usd 2.00; provider $60.00
    const t = fresh();
    spent(t, 'apify.snapshots', 19.1);
    const pendingRun = 'pending-1';
    t.spend.add({ runId: pendingRun, provider: 'apify', line: 'apify.snapshots', units: 0, estUsd: null, actualUsd: null, reservedUsd: 2, dry: false, at: '2026-10-05T00:00:00.000Z' });
    t.runs.insert({ id: pendingRun, kind: 'snapshot', apifyRunId: 'ap1', datasetId: 'ds1', actor: 'apify/instagram-post-scraper', input: {}, status: 'running', items: null, costUsd: null, dry: false, startedAt: '2026-10-05T00:00:00.000Z', finishedAt: null, error: null, line: 'apify.snapshots' });
    spent(t, 'apify.sync', 38.9);
    expect(lineSpend(t, 'apify.snapshots', NOW)).toBe(21.1);
    expect(monthSpend(t, 'apify', NOW)).toBe(60);
    // next snapshot run: line headroom 0.90, provider 28.00, run max 3 -> reserve 0.90
    const next = await gatedCall(t, { provider: 'apify', line: 'apify.snapshots', kind: 'snapshot', now: NOW }, { live: live(null, { pending: true }), dry });
    expect(next.reserveUsd).toBe(0.9);
    expect(lineSpend(t, 'apify.snapshots', NOW)).toBe(22);
    expect(monthSpend(t, 'apify', NOW)).toBe(60.9);
    // next snapshot call: line headroom 0 -> manual CapError reason cap, scope line
    const refused = await gatedCall(t, { provider: 'apify', line: 'apify.snapshots', kind: 'snapshot', now: NOW }, { live: live(0.1), dry }).catch((e) => e);
    expect(refused).toBeInstanceOf(CapError);
    expect(refused).toMatchObject({ reason: 'cap', scope: 'line', line: 'apify.snapshots' });
    // other apify lines still run (provider headroom 27.10)
    expect(enforceCap(t, { provider: 'apify', line: 'apify.sync' }, false, NOW)).toEqual({ reserveUsd: 3, estUsd: null });
    // the pending run settles at usageTotalUsd 1.42: line 19.10 + 1.42 + 0.90 = 21.42, provider 60.32; 0.58 returns
    settleSpend(t, pendingRun, 1.42, { events: { post: 300, 'post-details': 300 } });
    expect(lineSpend(t, 'apify.snapshots', NOW)).toBe(21.42);
    expect(monthSpend(t, 'apify', NOW)).toBe(60.32);
    expect(enforceCap(t, { provider: 'apify', line: 'apify.snapshots' }, false, NOW)).toEqual({ reserveUsd: 0.58, estUsd: null });
    expect(t.spend.forRun(pendingRun)[0]).toMatchObject({ actualUsd: 1.42, actualSource: 'provider', events: { post: 300, 'post-details': 300 } });
    expect(t.spend.forRun(pendingRun)[0].settledAt).not.toBeNull();
  });

  test('a call that fits its line cap but not the provider cap is refused with scope provider', () => {
    process.env.LAB_APIFY_CAP_USD = '10';
    const s = fresh();
    spent(s, 'apify.sync', 10);
    const err = (() => { try { enforceCap(s, { provider: 'apify', line: 'apify.snapshots' }, false, NOW); } catch (e) { return e; } return null; })();
    expect(err).toBeInstanceOf(CapError);
    expect(err).toMatchObject({ reason: 'cap', scope: 'provider' });
  });

  test('an off line refuses even with override; turning it on needs the flag and a cap above 0', async () => {
    const s = fresh();
    const err = await gatedCall(s, { provider: 'comments', line: 'comments', kind: 'comments', override: true, now: NOW }, { live: live(0.1), dry }).catch((e) => e);
    expect(err).toMatchObject({ reason: 'off' });
    expect(lineOffReason('comments', { env: {} })).toMatch(/LAB_COMMENTS/);
    expect(lineOffReason('comments', { env: { LAB_COMMENTS: '1' } })).toMatch(/LAB_COMMENTS_CAP_USD/);
    expect(lineOffReason('comments', { env: { LAB_COMMENTS: '1', LAB_COMMENTS_CAP_USD: '10' } })).toBeNull();
    expect(lineOffReason('downloads', { env: { LAB_DOWNLOADS_CAP_USD: '5' } })).toMatch(/LAB_TIKTOK_DOWNLOADS/);
    expect(lineOffReason('embed', { env: { LAB_EMBED_PROVIDER: 'local', LAB_EMBED_CAP_USD: '1' } })).toMatch(/LAB_EMBED_PROVIDER/);
    expect(lineOffReason('apify.snapshots', { env: { LAB_APIFY_SNAPSHOTS_CAP_USD: '0' } })).toMatch(/LAB_APIFY_SNAPSHOTS_CAP_USD/);
  });

  test('the X lines are off on the Apify Free plan (09.5.3)', () => {
    const s = fresh();
    expect(lineOffReason('apify.radar_x', { env: {}, store: s })).toBeNull();
    s.priors.set({ key: 'apify:plan', value: { tier: 'FREE', planId: 'FREE', maxConcurrentActorRuns: 25, checkedAt: NOW.toISOString() }, n: 0, supersedesDefault: false, updatedAt: NOW.toISOString() });
    expect(lineOffReason('apify.radar_x', { env: {}, store: s })).toMatch(/Free plan/);
    expect(lineOffReason('apify.x', { env: {}, store: s })).toMatch(/Free plan/);
    expect(lineOffReason('apify.sync', { env: {}, store: s })).toBeNull();
  });

  test('at the cap a live call is refused before anything runs; override passes it once', async () => {
    process.env.LAB_APIFY_CAP_USD = '5';
    const s = fresh();
    spent(s, 'apify.sync', 5);
    expect(() => enforceCap(s, { provider: 'apify', line: 'apify.sync' }, false, NOW)).toThrow(CapError);
    let ran = 0;
    const branch = { live: async () => { ran++; return { result: 'x', units: 1, actualUsd: 0.1 }; }, dry };
    await expect(gatedCall(s, { provider: 'apify', line: 'apify.sync', kind: 'scrape', now: NOW }, branch)).rejects.toBeInstanceOf(CapError);
    expect(ran).toBe(0);
    expect(s.runs.recent()).toHaveLength(0); // an interactive refusal leaves no run behind
    await expect(gatedCall(s, { provider: 'apify', line: 'apify.sync', kind: 'scrape', override: true, now: NOW }, branch)).resolves.toMatchObject({ dry: false });
    expect(ran).toBe(1);
    // the next call is refused again: the override was for one call
    await expect(gatedCall(s, { provider: 'apify', line: 'apify.sync', kind: 'scrape', now: NOW }, branch)).rejects.toBeInstanceOf(CapError);
  });

  test('a scheduled CapError writes one blocked run (with its line and job) and no spend row', async () => {
    process.env.LAB_APIFY_CAP_USD = '1';
    const s = fresh();
    spent(s, 'apify.sync', 2);
    const before = s.spend.all().length;
    await expect(gatedCall(s, { provider: 'apify', line: 'apify.sync', kind: 'scrape', scheduled: true, override: true, job: 'sync', now: NOW }, { live: live(0.1), dry })).rejects.toBeInstanceOf(CapError);
    expect(s.runs.recent()).toHaveLength(1);
    expect(s.runs.recent()[0]).toMatchObject({ status: 'blocked', line: 'apify.sync', job: 'sync', scheduled: true });
    expect(s.spend.all()).toHaveLength(before);
    const meter = spendMeter(s, NOW);
    expect(meter.blocked).toMatchObject({ line: 'apify.sync' });
    expect(meter.blocked?.message).toMatch(/cap reached/);
    expect(meter.providers.find((p) => p.provider === 'apify')).toMatchObject({ spent: 2, cap: 1, pct: 1 });
  });

  test('the uncapped LLM line is never refused', () => {
    const s = fresh();
    spent(s, 'llm', 999);
    expect(() => enforceCap(s, { provider: 'llm', line: 'llm' }, false, NOW)).not.toThrow();
  });

  test('a GateRequest whose line belongs to another provider throws', async () => {
    const s = fresh();
    await expect(gatedCall(s, { provider: 'stt', line: 'apify.x', kind: 'transcribe', now: NOW }, { live: live(0.1), dry })).rejects.toThrow(/does not belong/);
    expect(s.runs.recent()).toHaveLength(0);
  });
});

describe('reserve and needs headroom (09.2.6, AC-09-8)', () => {
  test('a run with high $0.03 reserves $0.05; a TikTok run reserves its $0.50 minimum', () => {
    const s = fresh();
    expect(enforceCap(s, { provider: 'apify', line: 'apify.sync', estimate: { point: 0.02, high: 0.03, minMaxTotalChargeUsd: 0.005 } }, false, NOW)).toEqual({ reserveUsd: 0.05, estUsd: 0.02 });
    expect(enforceCap(s, { provider: 'apify', line: 'apify.sync', estimate: { point: 0.08, high: 0.1, minMaxTotalChargeUsd: 0.5 } }, false, NOW)).toEqual({ reserveUsd: 0.5, estUsd: 0.08 });
  });

  test('with $0.40 headroom TikTok is refused with needs_headroom and Instagram starts', async () => {
    process.env.LAB_APIFY_SYNC_CAP_USD = '1';
    const s = fresh();
    spent(s, 'apify.sync', 0.6);
    const tiktok = await gatedCall(s, { provider: 'apify', line: 'apify.sync', kind: 'scrape', actor: 'clockworks/tiktok-scraper', estimate: { point: 0.08, high: 0.1, minMaxTotalChargeUsd: 0.5 }, now: NOW }, { live: live(null, { pending: true }), dry }).catch((e) => e);
    expect(tiktok).toBeInstanceOf(CapError);
    expect(tiktok).toMatchObject({ reason: 'needs_headroom', message: 'This actor needs at least $0.50 headroom.' });
    const ig = await gatedCall(s, { provider: 'apify', line: 'apify.sync', kind: 'scrape', actor: 'apify/instagram-post-scraper', estimate: { point: 0.02, high: 0.03, minMaxTotalChargeUsd: 0.005 }, now: NOW }, { live: live(null, { pending: true }), dry });
    expect(ig.reserveUsd).toBe(0.05);
    expect(s.spend.forRun(ig.run.id)[0]).toMatchObject({ reservedUsd: 0.05, estUsd: 0.02, actualUsd: null, actualSource: null });
    // an unsettled run counts its estimate, not its reserve
    expect(lineSpend(s, 'apify.sync', NOW)).toBe(0.62);
  });

  test('the live branch is told the reserve to send as maxTotalChargeUsd', async () => {
    const s = fresh();
    let sent: number | null = -1;
    await gatedCall(s, { provider: 'apify', line: 'apify.verify', kind: 'verify', now: NOW }, {
      live: async (_run, ctx) => {
        sent = ctx.maxTotalChargeUsd;
        return { result: null, units: 0, actualUsd: null, pending: true };
      },
      dry,
    });
    expect(sent).toBe(1); // apify.verify cap $1 is under the $3 run max
  });
});

describe('ledger rows with actual cost', () => {
  test('Whisper rows carry their actual cost from the published price at call time', async () => {
    const s = fresh();
    const out = await gatedCall(s, { provider: 'stt', line: 'stt', kind: 'transcribe', actor: 'whisper-1', now: NOW }, { live: live(0.07), dry });
    expect(out.run).toMatchObject({ status: 'succeeded', costUsd: 0.07, dry: false, line: 'stt' });
    expect(s.spend.all()[0]).toMatchObject({ provider: 'stt', line: 'stt', actualUsd: 0.07, dry: false, units: 10, actualSource: 'published_price', reservedUsd: null });
  });

  test('a pending Apify run stays running with a reserved, unsettled row until settleSpend records usageTotalUsd', async () => {
    const s = fresh();
    const out = await gatedCall(s, { provider: 'apify', line: 'apify.sync', kind: 'scrape', now: NOW }, { live: live(null, { pending: true, apifyRunId: 'run9', datasetId: 'ds9' }), dry });
    expect(out.run).toMatchObject({ status: 'running', apifyRunId: 'run9', datasetId: 'ds9' });
    expect(s.runs.open().map((r) => r.id)).toEqual([out.run.id]);
    expect(spendMeter(s, NOW).providers.find((p) => p.provider === 'apify')?.unsettled).toBe(1);
    expect(monthSpend(s, 'apify', NOW)).toBe(3); // the reserve counts until it settles
    settleSpend(s, out.run.id, 0.31, { items: 42 });
    expect(s.runs.get(out.run.id)).toMatchObject({ status: 'succeeded', costUsd: 0.31, items: 42 });
    expect(monthSpend(s, 'apify', NOW)).toBe(0.31);
  });

  test('a failing live call marks the run failed and rethrows', async () => {
    const s = fresh();
    await expect(gatedCall(s, { provider: 'apify', line: 'apify.sync', kind: 'scrape', now: NOW }, { live: async () => { throw new Error('402 hard limit'); }, dry })).rejects.toThrow('402 hard limit');
    expect(s.runs.recent()[0]).toMatchObject({ status: 'failed', error: '402 hard limit' });
  });
});
