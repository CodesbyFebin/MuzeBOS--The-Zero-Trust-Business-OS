import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { LAB_DDL } from '@/lib/db';
import { labStore, type LabStore } from '@/lib/lab/store';
import type { LabPost } from '@/lib/schemas';
import { invalidateModeCache } from '@/lib/paths';
import { needsTranscript, routeFor, transcribeCycle, transcriptionEligible } from '@/lib/lab/transcribe';
import { createSttClient, whisperCost, WHISPER_MAX_BYTES, type SttClient, type SttFetch } from '@/lib/connectors/openai-stt';

/** Transcription (SPEC §4.4) and the Whisper client. STT calls go to fakes only. */
const KEYS = ['LAB_DRY', 'LAB_STT_CAP_USD', 'GLADOS_ENV_LOCAL', 'GLADOS_MODE_FILE', 'DEMO_MODE'] as const;
let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-stt-'));
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
const post = (id: string, over: Partial<LabPost> = {}): LabPost => ({ id, sourceId: 's1', platform: 'tiktok', externalId: id, url: `https://www.tiktok.com/@x/video/${id}`, postedAt: NOW.toISOString(), caption: 'agent memory costs', contentType: 'video', thumbnailUrl: null, mediaUrl: `https://cdn.example.test/${id}.mp4`, durationS: 60, isOwned: false, ...over });

function seeded(posts: LabPost[], views: Record<string, number>, breakouts: Record<string, number> = {}): LabStore {
  const db = new Database(':memory:');
  db.exec(LAB_DDL);
  const store = labStore(db);
  for (const p of posts) {
    store.posts.upsert(p);
    store.metrics.add({ postId: p.id, capturedAt: NOW.toISOString(), views: views[p.id] ?? 100, likes: 1, comments: 0, shares: 0, saves: 0 });
    if (breakouts[p.id] !== undefined) store.measures.upsert({ postId: p.id, depth: 0.05, breakout: breakouts[p.id], breakoutLo: null, breakoutHi: null, baselineN: 12, baselineConfidence: 'ok', reach: null, velocity: null, trajectory: null, quadrant: 'ideal', isBreakout: breakouts[p.id] >= 3, computedAt: NOW.toISOString() });
  }
  return store;
}

describe('who gets a transcript', () => {
  test('v2 (04 5.2): every owned post; tracked posts only as a case or a drawn control', () => {
    const posts = [post('own', { isOwned: true }), post('case'), post('ctl'), post('top')];
    const roles = new Map([['case', { role: 'case' as const }], ['ctl', { role: 'control' as const }]]);
    expect([...transcriptionEligible(posts, roles)].sort()).toEqual(['case', 'ctl', 'own']);
  });

  test('AC-04-23: a top-quartile non-case non-control is not eligible; a control is, and its spend row is on stt.controls', async () => {
    process.env.LAB_DRY = '1';
    const store = seeded([post('own', { isOwned: true }), post('ctl'), post('top')], { own: 10, ctl: 10, top: 100_000 }, { top: 2.5 });
    store.controls.upsert({ postId: 'ctl', role: 'control', stratum: 's1|2026-10', samplingProb: 0.08, eligibleN: 1, drawnN: 1, seed: 'x', verdictAgeH: 168, verdictRatio: 0.9, drawnAt: NOW.toISOString(), status: 'selected', measureVersion: 'measure-v2' });
    await transcribeCycle({ store, stt: null, dry: true, now: NOW });
    expect(store.transcripts.get('top')).toBeNull();
    expect(store.transcripts.get('ctl')?.status).toBe('done');
    expect(store.controls.get('ctl')?.status).toBe('transcribed');
    const lines = new Map(store.runs.recent().map((r) => [((r.input as { postIds: string[] }).postIds ?? []).join(','), r.line]));
    expect(lines.get('ctl')).toBe('stt.controls');
    expect(lines.get('own')).toBe('stt');
    expect(store.spend.all().map((x) => x.line).sort()).toEqual(['stt', 'stt.controls']);
  });

  test('the Whisper price the operator entered (stt_price) replaces the constant (LC-6)', async () => {
    const { sttCost } = await import('@/lib/lab/transcribe');
    const store = seeded([], {});
    expect(sttCost(store, 60)).toBe(whisperCost(60));
    store.priors.set({ key: 'stt_price', value: 0.003, n: 1, supersedesDefault: true, updatedAt: NOW.toISOString() });
    expect(sttCost(store, 120)).toBe(0.006);
  });

  test('routes: YouTube subtitles, short-form with an https media file to STT, everything else caption-only', () => {
    expect(routeFor({ platform: 'youtube', contentType: 'short', mediaUrl: 'https://youtube.com/x' })).toBe('subtitles');
    expect(routeFor({ platform: 'tiktok', contentType: 'video', mediaUrl: 'https://cdn/x.mp4' })).toBe('stt');
    expect(routeFor({ platform: 'instagram', contentType: 'reel', mediaUrl: null })).toBe('caption-only');
    expect(routeFor({ platform: 'instagram', contentType: 'carousel', mediaUrl: 'https://cdn/x.jpg' })).toBe('caption-only');
    expect(routeFor({ platform: 'linkedin', contentType: 'text', mediaUrl: null })).toBe('caption-only');
  });

  test('done and failed are final; none from a missing key is retried once a key exists', () => {
    const t = (status: 'none' | 'done' | 'failed', provider: string) => ({ postId: 'p', text: '', wordCount: 0, wpm: null, provider, costUsd: 0, status });
    expect(needsTranscript(null, false)).toBe(true);
    expect(needsTranscript(t('done', 'whisper-1'), true)).toBe(false);
    expect(needsTranscript(t('failed', 'whisper-1'), true)).toBe(false);
    expect(needsTranscript(t('none', 'none'), false)).toBe(false);
    expect(needsTranscript(t('none', 'none'), true)).toBe(true);
    expect(needsTranscript(t('none', 'caption-only'), true)).toBe(false);
  });
});

describe('transcribeCycle', () => {
  test('no OpenAI key: honest none (provider none), no run, no spend', async () => {
    const store = seeded([post('own', { isOwned: true })], {});
    const r = await transcribeCycle({ store, stt: null, dry: false, now: NOW });
    expect(r).toMatchObject({ considered: 1, none: 1, done: 0 });
    expect(store.transcripts.get('own')).toMatchObject({ status: 'none', provider: 'none' });
    expect(store.runs.recent()).toHaveLength(0);
    expect(store.spend.all()).toHaveLength(0);
  });

  test('dry: a fixture transcript through the gate, 0-cost dry run, WPM from the duration', async () => {
    process.env.LAB_DRY = '1';
    const store = seeded([post('own', { isOwned: true, durationS: 30 })], {});
    const r = await transcribeCycle({ store, stt: null, dry: true, now: NOW });
    expect(r.done).toBe(1);
    const t = store.transcripts.get('own')!;
    expect(t).toMatchObject({ status: 'done', provider: 'whisper-1 (dry)', costUsd: 0 });
    expect(t.wpm).toBeGreaterThan(100);
    expect(store.runs.recent()[0]).toMatchObject({ kind: 'transcribe', actor: 'whisper-1', dry: true, status: 'succeeded' });
    expect(store.spend.all()[0]).toMatchObject({ provider: 'stt', dry: true, actualUsd: 0 });
  });

  test('live with a key: the media is fetched, Whisper answers, the cost is its measured duration × the published rate', async () => {
    const store = seeded([post('own', { isOwned: true })], {});
    const calls: string[] = [];
    const stt = {
      async fetchMedia(url: string) {
        calls.push(url);
        return { bytes: new Uint8Array([1, 2, 3]), contentType: 'video/mp4' };
      },
      async transcribe() {
        return { text: 'one two three four five six', durationS: 90, language: 'en' };
      },
    } as unknown as SttClient;
    await transcribeCycle({ store, stt, dry: false, now: NOW });
    expect(calls).toEqual(['https://cdn.example.test/own.mp4']);
    expect(store.transcripts.get('own')).toMatchObject({ status: 'done', provider: 'whisper-1', wordCount: 6, costUsd: whisperCost(90) });
    expect(store.spend.all()[0]).toMatchObject({ provider: 'stt', dry: false, actualUsd: 0.009, units: 90 });
  });

  test('a failed download marks the transcript failed (final) and the run failed; nothing charged', async () => {
    const store = seeded([post('own', { isOwned: true })], {});
    const stt = {
      async fetchMedia() {
        throw new Error('media download answered 403');
      },
    } as unknown as SttClient;
    const r = await transcribeCycle({ store, stt, dry: false, now: NOW });
    expect(r.failed).toBe(1);
    expect(store.transcripts.get('own')?.status).toBe('failed');
    expect(store.runs.recent()[0].status).toBe('failed');
    expect(store.spend.all()).toHaveLength(0);
  });

  test('the STT cap stops the cycle and says so', async () => {
    process.env.LAB_STT_CAP_USD = '0.5';
    const store = seeded([post('a', { isOwned: true }), post('b', { isOwned: true })], {});
    store.spend.add({ runId: null, provider: 'stt', units: 1, estUsd: null, actualUsd: 0.6, dry: false, at: NOW.toISOString() });
    const stt = { fetchMedia: async () => ({ bytes: new Uint8Array([1]), contentType: 'video/mp4' }), transcribe: async () => ({ text: 'x', durationS: 1, language: null }) } as unknown as SttClient;
    const r = await transcribeCycle({ store, stt, dry: false, now: NOW, scheduled: true });
    expect(r.blocked).toMatch(/stt monthly cap/);
    expect(store.transcripts.all()).toHaveLength(0);
  });
});

describe('Whisper client (fake fetch only)', () => {
  test('posts multipart to the transcription endpoint with whisper-1 and verbose_json, bearer key', async () => {
    const seen: { url: string; init: { method?: string; headers?: Record<string, string>; body?: unknown } }[] = [];
    const f: SttFetch = async (url, init = {}) => {
      seen.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ text: ' hello there ', duration: 12.5, language: 'en' }), text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) };
    };
    const r = await createSttClient({ key: 'sk-test', fetch: f }).transcribe({ bytes: new Uint8Array([1, 2]), contentType: 'video/mp4' });
    expect(r).toEqual({ text: 'hello there', durationS: 12.5, language: 'en' });
    expect(seen[0].url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(seen[0].init.headers).toEqual({ Authorization: 'Bearer sk-test' });
    const form = seen[0].init.body as FormData;
    expect(form.get('model')).toBe('whisper-1');
    expect(form.get('response_format')).toBe('verbose_json');
    expect(form.get('file')).toBeInstanceOf(Blob);
  });

  test('errors carry OpenAI’s message; media over 25 MB and non-https URLs are refused before any upload', async () => {
    const bad: SttFetch = async () => ({ ok: false, status: 401, json: async () => ({}), text: async () => JSON.stringify({ error: { message: 'Incorrect API key' } }), arrayBuffer: async () => new ArrayBuffer(0) });
    await expect(createSttClient({ key: 'k', fetch: bad }).transcribe({ bytes: new Uint8Array([1]), contentType: 'video/mp4' })).rejects.toThrow('answered 401: Incorrect API key');
    const big: SttFetch = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '', arrayBuffer: async () => new ArrayBuffer(0), headers: { get: (n: string) => (n === 'content-length' ? String(WHISPER_MAX_BYTES + 1) : null) } });
    await expect(createSttClient({ key: 'k', fetch: big }).fetchMedia('https://cdn/x.mp4')).rejects.toThrow(/25 MB/);
    await expect(createSttClient({ key: 'k', fetch: big }).fetchMedia('http://cdn/x.mp4')).rejects.toThrow(/https/);
  });

  test('cost: the published per-minute rate on the measured duration', () => {
    expect(whisperCost(60)).toBe(0.006);
    expect(whisperCost(0)).toBe(0);
    expect(whisperCost(-5)).toBe(0);
  });
});
