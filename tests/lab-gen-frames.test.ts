import { afterEach, describe, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DissectReplySchema, dissectCycle, DISSECT_FRAMES_PROMPT_VERSION, FRAMES_PROMPT_ADDITION, type DissectImageRunner, type DissectRunner } from '@/lib/lab/dissect';
import { dryDissectionReply } from '@/lib/lab/dry-items';
import { buildContactSheet, fixtureSheetPng, frameTimes, tiktokDownloadPrice, tiktokDownloadsAllowed, type ExecLike } from '@/lib/lab/gen/frames';
import { imageMessage, streamResult } from '@/lib/lab/gen/claude-image';
import { T, addPost, baseWorld, emptyStore } from './lab-gen-helpers';

/**
 * The frame contact sheet (07 7.14): AC-07-48 to AC-07-51. ffmpeg runs only in the one test that
 * generates a 2 s clip locally (skipped without ffmpeg); nothing is downloaded.
 */

afterEach(() => {
  delete process.env.LAB_FRAMES;
  delete process.env.LAB_TIKTOK_DOWNLOADS;
  delete process.env.LAB_DOWNLOADS_CAP_USD;
  delete process.env.LAB_TIKTOK_DOWNLOAD_PRICE_USD;
  delete process.env.LAB_DRY;
});

const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('sample times (7.14.3; AC-07-48)', () => {
  test('D = 2.0 s is one row clipped to 1.95; D = 60 s has the 7.14.3 second row', () => {
    expect(frameTimes(2)).toEqual({ row1: [0, 0.5, 1, 1.5, 1.95, 1.95], row2: [] });
    expect(frameTimes(60)).toEqual({ row1: [0, 0.5, 1, 1.5, 2, 2.75], row2: [7.75, 17.25, 26.75, 36.25, 45.75, 55.25] });
    expect(frameTimes(3.5).row2).toEqual([]);
  });
});

describe('ffmpeg through execFile with argument arrays (AC-07-49)', () => {
  test('a fake exec sees only argument arrays; the video and frame files are gone after tiling', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-frames-t-'));
    const video = path.join(dir, 'in.mp4');
    fs.writeFileSync(video, Buffer.alloc(1024));
    const out = path.join(dir, 'sheet.jpg');
    const calls: { file: string; args: string[] }[] = [];
    const tmpDirs = new Set<string>();
    const exec: ExecLike = async (file, args) => {
      calls.push({ file, args });
      if (file === 'ffprobe') return { stdout: '12.0\n', stderr: '' };
      const target = args[args.length - 1];
      if (/f\d\d\.jpg$/.test(target)) tmpDirs.add(path.dirname(target));
      fs.writeFileSync(target, 'jpg');
      return { stdout: '', stderr: '' };
    };
    const r = await buildContactSheet({ videoPath: video, outPath: out, exec });
    expect(r).toEqual({ sheetPath: out, frames: 12, durationS: 12 });
    expect(calls.every((c) => Array.isArray(c.args) && c.args.every((a) => typeof a === 'string'))).toBe(true);
    expect(calls[0]).toEqual({ file: 'ffprobe', args: ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video] });
    expect(calls[1].args).toEqual(['-nostdin', '-loglevel', 'error', '-ss', '0', '-i', video, '-frames:v', '1', '-vf', 'scale=320:-2', '-q:v', '4', expect.stringMatching(/f01\.jpg$/)]);
    const tile = calls[calls.length - 1].args;
    expect(tile).toContain('scale=320:568:force_original_aspect_ratio=decrease,pad=320:568:(ow-iw)/2:(oh-ih)/2,tile=6x2:padding=4:margin=4');
    expect(fs.existsSync(out)).toBe(true);
    expect(fs.existsSync(video)).toBe(false);
    for (const d of tmpDirs) expect(fs.existsSync(d)).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test.skipIf(!hasFfmpeg)('a real 2 s generated clip tiles to one row and leaves only the sheet', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-frames-r-'));
    const video = path.join(dir, 'clip.mp4');
    execFileSync('ffmpeg', ['-nostdin', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=180x320:rate=10', '-pix_fmt', 'yuv420p', video]);
    const out = path.join(dir, 'sheet.jpg');
    const r = await buildContactSheet({ videoPath: video, outPath: out });
    expect(r.frames).toBe(6);
    expect(fs.existsSync(out)).toBe(true);
    expect(fs.statSync(out).size).toBeGreaterThan(1000);
    expect(fs.existsSync(video)).toBe(false);
    expect(fs.readdirSync(dir)).toEqual(['sheet.jpg']);
    fs.rmSync(dir, { recursive: true, force: true });
  }, 60_000);
});

describe('switches and prices (AC-07-50)', () => {
  test('POST /api/lab/frames answers 409 while LAB_FRAMES is not 1', async () => {
    const { POST } = await import('@/app/api/lab/frames/route');
    const res = await POST(new Request('http://localhost/api/lab/frames', { method: 'POST', body: JSON.stringify({ action: 'build', postId: 'x' }) }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, error: 'frames are off' });
  });

  test('TikTok downloads stay off without the flag or with a 0 cap; with both they price from the published video-download event, no override needed', () => {
    const s = emptyStore();
    expect(tiktokDownloadsAllowed({ env: {}, store: s })).toBe(false);
    expect(tiktokDownloadsAllowed({ env: { LAB_TIKTOK_DOWNLOADS: '1' }, store: s })).toBe(false);
    expect(tiktokDownloadsAllowed({ env: { LAB_TIKTOK_DOWNLOADS: '1', LAB_DOWNLOADS_CAP_USD: '0' }, store: s })).toBe(false);
    expect(tiktokDownloadsAllowed({ env: { LAB_DOWNLOADS_CAP_USD: '2' }, store: s })).toBe(false);
    expect(tiktokDownloadsAllowed({ env: { LAB_TIKTOK_DOWNLOADS: '1', LAB_DOWNLOADS_CAP_USD: '2' }, store: s })).toBe(true);
    // lane S's price book carries the published video-download event, so the price comes from the book
    expect(tiktokDownloadPrice(s, {}, T)).toEqual({ usd: 0.0013, source: 'price_book' });
    expect(tiktokDownloadPrice(s, { LAB_TIKTOK_DOWNLOAD_PRICE_USD: '0.002' }, T)).toEqual({ usd: 0.002, source: 'override' });
  });

  test('GET /api/lab/frames serves the fixture world a placeholder PNG and 404s a post without a sheet', async () => {
    const { GET } = await import('@/app/api/lab/frames/route');
    const sampleStore = (await import('@/lib/lab/context')).sampleStore();
    const withSheet = sampleStore.dissections.all().find((d) => d.sheetPath)!;
    const ok = await GET(new Request(`http://localhost/api/lab/frames?post=${withSheet.postId}&sample=1`));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/png');
    const bytes = Buffer.from(await ok.arrayBuffer());
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(fixtureSheetPng(withSheet.postId)).toEqual(bytes);
    const none = await GET(new Request('http://localhost/api/lab/frames?post=nope&sample=1'));
    expect(none.status).toBe(404);
  });
});

describe('dissect with a sheet (7.14.4; AC-07-51)', () => {
  test('a dissection with a sheet stores frames_used 1 and dissect-v2-frames; one without keeps dissect-v1', async () => {
    const s = baseWorld();
    addPost(s, { id: 'with', source: 'src-own', owned: true, ratio: 1 });
    addPost(s, { id: 'without', source: 'src-own', owned: true, ratio: 1 });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-sheet-'));
    const sheet = path.join(dir, 'with.jpg');
    fs.writeFileSync(sheet, Buffer.from('jpg'));
    const reply = DissectReplySchema.parse({ ...dryDissectionReply({ externalId: 'x', caption: 'agents', contentType: 'video' }, false), on_screen_text_density: 2, face_first_frame: true });
    const prompts: string[] = [];
    const imageRunner: DissectImageRunner = vi.fn(async (p, img) => (prompts.push(p), expect(img).toBe(sheet), { ok: true as const, data: reply }));
    const runner: DissectRunner = vi.fn(async () => ({ ok: true as const, data: reply }));
    // the helper wrote dissect-v1 rows; the post with a sheet is re-dissected once, the other is not a target
    const r = await dissectCycle({ store: s, now: T, runner, imageRunner, sheetOf: (id) => (id === 'with' ? sheet : null) });
    expect(r.done).toBe(1);
    expect(imageRunner).toHaveBeenCalledOnce();
    expect(prompts[0]).toContain(FRAMES_PROMPT_ADDITION);
    expect(prompts[0]).toContain(`prompt_version: ${DISSECT_FRAMES_PROMPT_VERSION}`);
    expect(s.dissections.get('with')).toMatchObject({ framesUsed: 1, promptVersion: 'dissect-v2-frames', onScreenTextDensity: 2, faceFirstFrame: true, sheetPath: 'data/lab/frames/with.jpg' });
    expect(s.dissections.get('without')).toMatchObject({ framesUsed: 0, promptVersion: 'dissect-v1' });
    // a second cycle does not re-dissect it again
    const again = await dissectCycle({ store: s, now: T, runner, imageRunner, sheetOf: (id) => (id === 'with' ? sheet : null) });
    expect(again.considered).toBe(0);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('claudeJsonWithImage speaks stream-json: one user message with a base64 image block, the final result line read back', () => {
    const line = JSON.parse(imageMessage('prompt text', 'QUJD'));
    expect(line).toEqual({ type: 'user', message: { role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } }, { type: 'text', text: 'prompt text' }] } });
    expect(streamResult('{"type":"system"}\n{"type":"assistant"}\n{"type":"result","result":"{\\"a\\":1}"}\n')).toBe('{"a":1}');
    expect(streamResult('nothing')).toBe(null);
  });
});
