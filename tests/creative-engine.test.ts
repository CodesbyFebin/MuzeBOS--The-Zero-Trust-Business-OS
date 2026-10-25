import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { composePrompt, BUILTIN_PRESETS, FORBIDDEN_WORDS } from '@/lib/creative-engine/compose';
import { durationForScript, legalDuration, secondsForWords, wordsForSeconds } from '@/lib/creative-engine/duration';
import { buildVideoBody, cheapestRequest, validateRequest, MODEL_RULES } from '@/lib/arcads/validate';
import { ConsoleControlsSchema, DEPTH_BUDGET, VIDEO_MODELS } from '@/lib/creative-engine/schemas';
import { createCampaign, mutateCampaign, readCampaign, readCampaigns, readLedger, appendLedger, lastCharge } from '@/lib/creative-engine/store';
import { failRun, finishRun, listRuns, resolveRun, startRun } from '@/lib/creative-engine/runs';
import { proofStats, serializePool } from '@/lib/creative-engine/angles';
import { buildBrief } from '@/lib/creative-engine/briefs';
import { assemble, FRAMEWORK_BANK, newScript } from '@/lib/creative-engine/scripts';
import { DRY_POOL } from '@/lib/creative-engine/fixtures';
import { groupActors, matchVoice, DRY_CATALOG } from '@/lib/arcads/catalog';
import { ArcadsClient, ArcadsError, explainArcadsError, normaliseCreate, normStatus, pollPathFor, pollTalkingActor, pollV2, readVideoStatus, unwrapList } from '@/lib/arcads/client';
import { advanceArcadsRuns, enforceCap, sessionSpend, toSnapshot } from '@/lib/creative-engine/generate';
import { probeFree } from '@/lib/creative-engine/health';
import { readCreditsSnapshot, readHealth, readRuns, writeSettings } from '@/lib/creative-engine/store';
import { parseJsonReply } from '@/lib/creative-engine/claude';
import { z } from 'zod';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creative-engine-'));
  process.env.CREATIVE_ENGINE_STORE_DIR = dir;
  process.env.CREATIVE_ENGINE_ASSET_DIR = path.join(dir, 'assets');
});
afterEach(() => {
  delete process.env.CREATIVE_ENGINE_STORE_DIR;
  delete process.env.CREATIVE_ENGINE_ASSET_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('duration table (2.5 words/s, round up, per-model legality)', () => {
  test('words ↔ seconds', () => {
    expect(secondsForWords(28)).toBe(12);
    expect(wordsForSeconds(12)).toBe(30);
  });
  test('kling-2.6 snaps up to its enum, seedance clamps to its range, veo has none, seedance-2.5 goes to 30', () => {
    expect(legalDuration('kling-2.6', 6)).toBe(10);
    expect(legalDuration('kling-2.6', 11)).toBeNull();
    expect(legalDuration('seedance-2.0', 2)).toBe(4);
    expect(legalDuration('seedance-2.0', 16)).toBeNull();
    expect(legalDuration('seedance-2.5', 28)).toBe(28);
    expect(legalDuration('veo31', 8)).toBeNull();
  });
  test('a 40-word script does not fit seedance and says to split', () => {
    const r = durationForScript('seedance-2.0', Array(40).fill('word').join(' '));
    expect(r.fits).toBe(false);
    expect(r.note).toMatch(/split/);
    const ok = durationForScript('seedance-2.0', Array(20).fill('word').join(' '));
    expect(ok.fits).toBe(true);
    expect(ok.duration).toBe(8);
  });
});

describe('Arcads request validator — the gating table is executable', () => {
  const base = ConsoleControlsSchema.parse({});
  test('every model has a rule row', () => {
    for (const m of VIDEO_MODELS) expect(MODEL_RULES[m]).toBeTruthy();
  });
  test('seedance refuses 1:1 and accepts 9:16', () => {
    expect(validateRequest({ ...base, model: 'seedance-2.0', aspectRatio: '1:1' }).some((l) => l.field === 'aspectRatio' && l.level === 'error')).toBe(true);
    expect(validateRequest({ ...base, model: 'seedance-2.0', aspectRatio: '9:16' }).filter((l) => l.level === 'error')).toHaveLength(0);
  });
  test('kling-2.6 duration must be on the enum; veo31 refuses 1:1 (document: 16:9 or 9:16 only)', () => {
    expect(validateRequest({ ...base, model: 'kling-2.6', duration: 9, aspectRatio: '9:16' }).some((l) => l.field === 'duration')).toBe(true);
    expect(validateRequest({ ...base, model: 'kling-2.6', duration: 10, aspectRatio: '9:16' }).filter((l) => l.level === 'error')).toHaveLength(0);
    expect(validateRequest({ ...base, model: 'veo31', aspectRatio: '1:1' }).some((l) => l.field === 'aspectRatio' && l.level === 'error')).toBe(true);
  });
  test('minimax takes frames OR reference media, never both; seedance-2.5 end frame needs a start frame', () => {
    expect(validateRequest({ ...base, model: 'minimax-h3', aspectRatio: '9:16', duration: 5, startFrame: '/tmp/s.jpg', referenceImages: ['/tmp/b.jpg'] }).some((l) => /not both/.test(l.message))).toBe(true);
    expect(validateRequest({ ...base, model: 'seedance-2.5', endFrame: '/tmp/e.jpg' }).some((l) => /requires a start frame/.test(l.message))).toBe(true);
    expect(validateRequest({ ...base, model: 'seedance-2.0', referenceVideos: Array(4).fill('/tmp/v.mp4') }).some((l) => l.field === 'referenceVideos' && l.level === 'error')).toBe(true);
  });
  test('the cheapest request per model is legal', () => {
    for (const m of VIDEO_MODELS) {
      const c = ConsoleControlsSchema.parse(cheapestRequest(m));
      expect(validateRequest(c).filter((l) => l.level === 'error')).toEqual([]);
    }
  });
  test('kling-3.0 end frame alone is blocked by rule (it bills then fails)', () => {
    const lints = validateRequest({ ...base, model: 'kling-3.0', aspectRatio: '9:16', duration: 5, endFrame: '/tmp/e.jpg' });
    expect(lints.some((l) => l.field === 'endFrame' && l.level === 'error')).toBe(true);
  });
  test('variations are always a fan-out warning; enhance warns with its price', () => {
    expect(validateRequest({ ...base, model: 'seedance-2.0', variations: 3 }).find((l) => l.field === 'variations')?.level).toBe('warn');
    expect(validateRequest({ ...base, enhance: true }).some((l) => /8 extra credits/.test(l.message))).toBe(true);
  });
  test('buildVideoBody sends only CreateVideoDto fields the model accepts; never nbGenerations; no resolution for kling', () => {
    const c = { ...base, model: 'veo31' as const, aspectRatio: '16:9' as const, resolution: '4K' as const, audioEnabled: true, variations: 3, enhance: true, bitrateMode: 'high' as const };
    const body = buildVideoBody(c, 'p', 'prod', { referenceImages: ['f1'], referenceVideos: [], referenceAudios: [], startFrame: null, endFrame: null });
    expect(body).toMatchObject({ model: 'veo31', productId: 'prod', prompt: 'p', aspectRatio: '16:9', resolution: '4K', referenceImages: ['f1'], enhance: true, bitrateMode: 'high' });
    expect(body).not.toHaveProperty('duration');
    expect(body).not.toHaveProperty('audioEnabled');
    expect(body).not.toHaveProperty('nbGenerations');
    const k = buildVideoBody({ ...base, model: 'kling-3.0', aspectRatio: '9:16', duration: 5 }, 'p', 'prod', { referenceImages: [], referenceVideos: [], referenceAudios: [], startFrame: null, endFrame: null });
    expect(k).not.toHaveProperty('resolution');
    expect(k.duration).toBe(5);
    const s = buildVideoBody({ ...base, model: 'seedance-2.0', audioEnabled: true }, 'p', 'prod', { referenceImages: [], referenceVideos: ['v1'], referenceAudios: ['a1'], startFrame: null, endFrame: null });
    expect(s).toMatchObject({ audioEnabled: true, referenceVideos: ['v1'], referenceAudios: ['a1'] });
  });
});

describe('prompt composer', () => {
  test('emits the five parts in Seedance order and the no-captions rule', () => {
    const c = composePrompt({ subject: 'a woman in a grey hoodie', dialogue: 'I replaced my whole ops team.', duration: 8 });
    expect(c.parts.subject).toContain('grey hoodie');
    expect(c.prompt.indexOf(c.parts.subject)).toBeLessThan(c.prompt.indexOf(c.parts.camera));
    expect(c.prompt).toMatch(/No subtitles, no captions/);
    expect(c.prompt).toContain('Dialogue: "I replaced my whole ops team."');
  });
  test('forbidden words lint as errors', () => {
    const c = composePrompt({ subject: 'a cinematic studio portrait' });
    const words = c.lints.filter((l) => l.level === 'error').map((l) => l.message);
    expect(words.some((m) => m.includes('"cinematic"'))).toBe(true);
    expect(words.some((m) => m.includes('"studio"'))).toBe(true);
    expect(FORBIDDEN_WORDS).toContain('perfect');
  });
  test('dialogue over the duration budget is an error; silent models warn', () => {
    const long = Array(40).fill('word').join(' ');
    expect(composePrompt({ dialogue: long, duration: 8 }).lints.some((l) => /do not fit/.test(l.message))).toBe(true);
    expect(composePrompt({ model: 'kling-3.0', dialogue: 'hi there', duration: 5, aspectRatio: '9:16' }).lints.some((l) => /silent/.test(l.message))).toBe(true);
  });
  test('builtin presets all parse as control states', () => {
    for (const p of BUILTIN_PRESETS) expect(() => ConsoleControlsSchema.parse(p.controls)).not.toThrow();
    expect(BUILTIN_PRESETS.map((p) => p.name)).toContain('UGC selfie');
  });
});

describe('store + runs (derived status, never stored)', () => {
  test('campaign create/read/mutate and the cap-safe list', () => {
    const c = createCampaign({ text: 'founders replacing staff with agents', product: '', audience: '', goal: 'unset' });
    expect(readCampaign(c.id)?.name).toBe('founders replacing staff with agents');
    mutateCampaign(c.id, (x) => ({ ...x, adsWanted: 3 }));
    expect(readCampaign(c.id)?.adsWanted).toBe(3);
    expect(readCampaigns()).toHaveLength(1);
  });
  test('a run is running, then delivered only when its output exists, failed when it says so', () => {
    const c = createCampaign({ text: 'a concept for testing runs', product: '', audience: '', goal: 'unset' });
    const r = startRun({ campaignId: c.id, kind: 'research', title: 't', outputRef: `campaign:${c.id}#research` });
    expect(resolveRun(r).status).toBe('running');
    finishRun(r.id);
    expect(listRuns(c.id)[0].status).toBe('failed'); // finished, promised research, none present
    mutateCampaign(c.id, (x) => ({ ...x, research: { depth: 'light', expandedBy: 'dry', minDays: 21, format: 'any', probes: [], pool: DRY_POOL, pooled: 5, apiCalls: 0, ranAt: new Date().toISOString() } }));
    expect(listRuns(c.id)[0].status).toBe('delivered');
    const f = startRun({ campaignId: c.id, kind: 'angles', title: 'x' });
    failRun(f.id, 'boom');
    expect(listRuns(c.id).find((x) => x.id === f.id)?.status).toBe('failed');
  });
  test('a run past its timeout reads stale', () => {
    const r = startRun({ campaignId: null, kind: 'brief', title: 'old' });
    const old = { ...r, startedAt: new Date(Date.now() - 10 * 60_000).toISOString() };
    expect(resolveRun(old).status).toBe('stale');
  });
  test('PATCH briefs/[id] sets the stored status, rejects unknown statuses, 404s unknown ids (S07 F24)', async () => {
    const { PATCH } = await import('@/app/api/creative-engine/briefs/[id]/route');
    const c = createCampaign({ text: 'a concept with a brief', product: '', audience: '', goal: 'unset' });
    const proof = { ads: [], medianDays: null, drivers: {}, note: '' };
    mutateCampaign(c.id, (x) => ({ ...x, briefs: [{ id: 'brf-t1', scriptId: 's1', angleId: 'a1', title: 't', markdown: '#', proof, status: 'ready', at: new Date().toISOString() }] }));
    const req = (body: unknown) => new Request('http://x/api/creative-engine/briefs/brf-t1', { method: 'PATCH', body: JSON.stringify(body) });
    const ok = await PATCH(req({ status: 'sent' }), { params: { id: 'brf-t1' } });
    expect(ok.status).toBe(200);
    expect(readCampaign(c.id)?.briefs[0].status).toBe('sent');
    expect((await PATCH(req({ status: 'shipped' }), { params: { id: 'brf-t1' } })).status).toBe(400);
    expect(readCampaign(c.id)?.briefs[0].status).toBe('sent');
    expect((await PATCH(req({ status: 'draft' }), { params: { id: 'brf-nope' } })).status).toBe(404);
  });
  test('ledger: last real charge ignores dry entries', () => {
    appendLedger({ at: new Date().toISOString(), kind: 'motion', model: 'seedance-2.0', durationSec: 8, creditsCharged: 0, runId: 'r1', dry: true, source: 'dry' });
    expect(lastCharge('seedance-2.0', 8)).toBeNull();
    appendLedger({ at: new Date().toISOString(), kind: 'motion', model: 'seedance-2.0', durationSec: 8, creditsCharged: 3.2, runId: 'r2', dry: false, source: 'response' });
    expect(lastCharge('seedance-2.0', 8)?.creditsCharged).toBe(3.2);
    expect(readLedger()).toHaveLength(2);
  });
});

describe('angles, scripts, briefs on the fixture pool', () => {
  test('proof stats are computed, never asked of a model', () => {
    const s = proofStats(DRY_POOL, ['dry-ad-1', 'dry-ad-4']);
    expect(s.medianDays).toBe(52);
    expect(s.duplicates).toBe(8);
    expect(s.drivers.relief).toBeGreaterThan(0);
    expect(serializePool(DRY_POOL)).toContain('id=dry-ad-1');
  });
  test('assemble makes the hook the first beat and checks the word budget', () => {
    const controls = { targetSeconds: 8, tone: 'best-friend' as const, intro: 'show' as const, cta: 'Link below', noStageDirections: true as const };
    const v = assemble('problem-agitate-solve', { beats: [{ name: 'Problem', spoken: 'Hiring for tasks is slow.', action: 'desk' }, { name: 'Agitate', spoken: 'Every week it costs a day.', action: '' }, { name: 'Solve', spoken: 'An agent does it now.', action: '' }], cta: 'Link below', notes: '' }, controls, 1, 'dry');
    expect(v.hook).toBe('Hiring for tasks is slow.');
    expect(v.fits).toBe(true);
    expect(v.beats.reduce((s, b) => s + b.seconds, 0)).toBeGreaterThan(0);
    expect(Object.keys(FRAMEWORK_BANK)).toHaveLength(6);
  });
  test('a brief carries the proof table and the honesty note', () => {
    const c = createCampaign({ text: 'agents replacing staff', product: '', audience: '', goal: 'unset' });
    const angle = { id: 'a1', title: 'Replace the role', thesis: 't', hookPattern: '', whyItWorks: '', proofAdIds: ['dry-ad-1', 'dry-ad-2'], drivers: ['relief'], formats: ['video' as const], confidence: 'strong' as const, selected: true };
    const withResearch = mutateCampaign(c.id, (x) => ({ ...x, angles: [angle], research: { depth: 'light', expandedBy: 'dry', minDays: 21, format: 'any', probes: [{ query: 'agents replace staff', why: '', results: 1 }], pool: DRY_POOL, pooled: 5, apiCalls: 0, ranAt: new Date().toISOString() } }))!;
    const script = newScript('a1', 'hook-show-demo-result-verdict', { targetSeconds: 12, tone: 'best-friend', intro: 'show', cta: 'Link', noStageDirections: true });
    const version = { ...assemble('hook-show-demo-result-verdict', { beats: [{ name: 'Hook', spoken: 'I replaced my ops team.', action: '' }], cta: 'Link', notes: '' }, script.controls, 1, 'dry'), n: 1 };
    const brief = buildBrief(withResearch, script, version, angle);
    expect(brief.markdown).toContain('| Northwind Tools |');
    expect(brief.markdown).toContain('No engagement, spend, CTR or revenue figures exist');
    expect(brief.proof.medianDays).toBe(58);
  });
});

describe('Arcads client helpers', () => {
  test('actors are grouped from situations, sorted by name', () => {
    const actors = groupActors([
      { id: 's1', tags: [], imageUrl: 'a.jpg', previewUrl: '', actor: { id: 'b', name: 'Zed', gender: 'Male', age: 'Adult' } },
      { id: 's2', tags: [], imageUrl: 'b.jpg', previewUrl: '', actor: { id: 'a', name: 'Amy', gender: 'Female', age: 'Young Adult' } },
      { id: 's3', tags: [], imageUrl: 'c.jpg', previewUrl: '', talkingActorEnabled: false, actor: { id: 'b', name: 'Zed', gender: 'Male', age: 'Adult' } },
      { id: 's4', tags: [], imageUrl: 'd.jpg', previewUrl: '', actor: { id: 'b', name: 'Zed', gender: 'Male', age: 'Adult' } },
    ]);
    expect(actors.map((a) => a.name)).toEqual(['Amy', 'Zed']);
    expect(actors[1].situations).toHaveLength(2); // the non-talking situation is dropped
    expect(DRY_CATALOG.actors.length).toBeGreaterThan(0);
    const voices = [
      { id: 'v-m', name: 'Tom', gender: 'male', age: 'adult', accent: '', descriptive: '', audioUrl: '' },
      { id: 'v-f-y', name: 'Ana', gender: 'female', age: 'young adult', accent: '', descriptive: '', audioUrl: '' },
      { id: 'v-f', name: 'Bea', gender: 'female', age: 'adult', accent: '', descriptive: '', audioUrl: '' },
    ];
    expect(matchVoice({ actors, voices }, 's2')?.id).toBe('v-f-y');
    expect(matchVoice({ actors, voices }, 's1')?.id).toBe('v-m');
    expect(matchVoice({ actors, voices: [] }, 's1')).toBeNull();
  });
  test('list unwrapping tolerates items/entries/data/results wrappers; every v2 job polls /v1/assets', () => {
    expect(unwrapList({ items: [1] })).toEqual([1]);
    expect(unwrapList({ entries: [3] })).toEqual([3]);
    expect(unwrapList([2])).toEqual([2]);
    expect(unwrapList({ nope: 1 })).toEqual([]);
    expect(pollPathFor('seedance_20')).toBe('assets');
    expect(pollPathFor('veo31')).toBe('assets');
  });
  test('the create reply (undocumented) is accepted as an object, an array, or an envelope, and kept raw', () => {
    expect(normaliseCreate('{"id":"a1","status":"created","type":"seedance_20"}', 'seedance-2.0')).toMatchObject({ id: 'a1', status: 'created', type: 'seedance_20', creditsCharged: null });
    expect(normaliseCreate('[{"id":"a2","status":"processing"}]', 'veo31')).toMatchObject({ id: 'a2', type: 'veo31' });
    expect(normaliseCreate('{"asset":{"id":"a3","data":{"creditsCharged":12.5}}}', 'x').creditsCharged).toBe(12.5);
    expect(() => normaliseCreate('{"ok":true}', 'x')).toThrow(/no id/);
  });
  test('AssetResponseDto statuses map to ours; the opaque v1 videoStatus object is read every plausible way', () => {
    expect(normStatus('generated')).toBe('generated');
    expect(normStatus('uploaded')).toBe('generated');
    expect(normStatus('pending')).toBe('pending');
    expect(normStatus('created')).toBe('pending');
    expect(normStatus('failed')).toBe('failed');
    expect(readVideoStatus({ id: 'v', videoStatus: { status: 'generated' } })).toBe('generated');
    expect(readVideoStatus({ id: 'v', videoStatus: 'processing' })).toBe('processing');
    expect(readVideoStatus({ id: 'v', videoUrl: 'https://cdn/x.mp4' })).toBe('generated');
    expect(readVideoStatus({ id: 'v', videoUrl: '' })).toBe('');
  });
  test('errors are classified by status and explained in one actionable sentence', () => {
    expect(explainArcadsError(new ArcadsError('x', 401, '')).kind).toBe('auth');
    expect(explainArcadsError(new ArcadsError('x', 402, '')).httpStatus).toBe(402);
    expect(explainArcadsError(new ArcadsError('x', 429, '', { retryAfterSec: 7 })).message).toMatch(/retry after 7s/);
    expect(explainArcadsError(new ArcadsError('x', 422, 'flagged')).message).toMatch(/not refunded/);
    expect(explainArcadsError(new ArcadsError('x', 0, '', { kind: 'timeout' })).kind).toBe('timeout');
    expect(explainArcadsError(new Error('plain')).kind).toBe('unknown');
  });
  test('strict JSON replies parse through fences and envelopes', () => {
    const S = z.object({ a: z.number() });
    expect(parseJsonReply('{"result":"```json\\n{\\"a\\":1}\\n```"}', S)).toEqual({ ok: true, data: { a: 1 } });
    expect(parseJsonReply('not json', S).ok).toBe(false);
  });
  test('depth budgets are the numbers the UI shows before a run', () => {
    expect(DEPTH_BUDGET.standard.maxCalls).toBe(19);
  });
});


/* ── the live boundary, through the injectable fetch ── */

type Route = { method?: string; path: string; status?: number; body: unknown; headers?: Record<string, string> };
function fakeFetch(routes: Route[], log: { method: string; url: string; body: unknown }[] = []): { fetchImpl: typeof fetch; log: typeof log } {
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    log.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const r = routes.find((x) => url.includes(x.path) && (x.method ?? 'GET') === method);
    if (!r) return new Response('not found', { status: 404 });
    const text = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    return new Response(text, { status: r.status ?? 200, headers: { 'content-type': 'application/json', ...(r.headers ?? {}) } });
  }) as typeof fetch;
  return { fetchImpl, log };
}

describe('Arcads client against document-shaped fixtures', () => {
  test('a create → poll → download round trip, with a 404 fallback to /v1/videos', async () => {
    const { fetchImpl, log } = fakeFetch([
      { method: 'POST', path: '/v2/videos/generate', status: 201, body: { id: 'as-1', status: 'created', type: 'seedance_20' } },
      { path: '/v1/assets/as-1', body: { id: 'as-1', type: 'seedance_20', status: 'generated', url: 'https://cdn/as-1.mp4', thumbnailUrl: 'https://cdn/as-1.jpg' } },
      { method: 'POST', path: '/v1/assets/as-1/download', body: '"https://signed/as-1.mp4"' },
      { path: '/v1/videos/vid-9', body: { id: 'vid-9', videoStatus: { status: 'generated' }, videoUrl: 'https://cdn/v9.mp4' } },
    ]);
    const client = new ArcadsClient('Basic abc', fetchImpl, 'https://api.test');
    const created = await client.generateVideo({ model: 'seedance-2.0', productId: 'p', prompt: 'x' });
    expect(created.id).toBe('as-1');
    expect(log[0].body).toMatchObject({ model: 'seedance-2.0' });
    const polled = await pollV2(client, 'as-1');
    expect(polled).toMatchObject({ status: 'generated', url: 'https://cdn/as-1.mp4', thumbnailUrl: 'https://cdn/as-1.jpg' });
    expect(await client.downloadUrl('as-1')).toBe('https://signed/as-1.mp4');
    const viaVideos = await pollV2(client, 'vid-9');
    expect(viaVideos.status).toBe('generated');
  });
  test('credits come from GET /v1/credits as a snapshot', async () => {
    const { fetchImpl } = fakeFetch([{ path: '/v1/credits', body: { plan: { name: 'Scale' }, creditsIncluded: 1000, creditsRemaining: 961.5, additionalCreditsUsed: 0, currentPeriodStart: '2026-10-01T00:00:00Z', currentPeriodEnd: '2026-11-01T00:00:00Z' } }]);
    const client = new ArcadsClient('Basic abc', fetchImpl, 'https://api.test');
    const snap = toSnapshot(await client.credits());
    expect(snap).toMatchObject({ creditsRemaining: 961.5, creditsIncluded: 1000, plan: 'Scale' });
  });
  test('talking actors: create → processing → completed → watch link from the 302', async () => {
    let polls = 0;
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v2/talking-actors/generate')) return new Response(JSON.stringify([{ id: 'ta-1', model: 'arcads_1.0', status: 'processing' }]), { status: 201 });
      if (url.endsWith('/v2/talking-actors/ta-1/watch')) return new Response('', { status: 302, headers: { location: 'https://cdn/ta-1.mp4' } });
      if (url.endsWith('/v2/talking-actors/ta-1')) { polls += 1; return new Response(JSON.stringify({ id: 'ta-1', model: 'arcads_1.0', status: polls < 2 ? 'processing' : 'completed' }), { status: 200 }); }
      return new Response('nope', { status: 404, headers: {} });
    }) as typeof fetch;
    const client = new ArcadsClient('Basic abc', fetchImpl, 'https://api.test');
    const { results } = await client.generateTalkingActors({ productId: 'p', script: 'hi', actors: [{ situationId: 's', voiceId: 'v' }] });
    expect(results[0]).toMatchObject({ id: 'ta-1', status: 'processing' });
    expect((await pollTalkingActor(client, 'ta-1')).status).toBe('pending');
    const done = await pollTalkingActor(client, 'ta-1');
    expect(done).toMatchObject({ status: 'generated', url: 'https://cdn/ta-1.mp4' });
  });
  test('401, 402, 429 (with Retry-After) and a timeout become typed errors', async () => {
    const { fetchImpl } = fakeFetch([
      { path: '/v1/products', status: 401, body: { message: 'bad key' } },
      { path: '/v1/voices', status: 402, body: {} },
      { path: '/v1/credits', status: 429, body: {}, headers: { 'retry-after': '12' } },
    ]);
    const client = new ArcadsClient('Basic abc', fetchImpl, 'https://api.test');
    await expect(client.products()).rejects.toMatchObject({ kind: 'auth', status: 401 });
    await expect(client.voices()).rejects.toMatchObject({ kind: 'credits' });
    await expect(client.credits()).rejects.toMatchObject({ kind: 'rate', retryAfterSec: 12 });
    const slow = (async () => { throw Object.assign(new Error('timed out'), { name: 'TimeoutError' }); }) as unknown as typeof fetch;
    await expect(new ArcadsClient('Basic abc', slow, 'https://api.test').products()).rejects.toMatchObject({ kind: 'timeout' });
  });
  test('the free probe records auth, catalog and the balance', async () => {
    const { fetchImpl } = fakeFetch([
      { path: '/v1/products', body: { count: 1, items: [{ id: 'p1', name: 'Larkspur' }] } },
      { path: '/v1/voices', body: { count: 0, items: [] } },
      { path: '/v1/credits', body: { plan: null, creditsIncluded: 100, creditsRemaining: 40, additionalCreditsUsed: 0 } },
    ]);
    const { health, credits } = await probeFree(new ArcadsClient('Basic abc', fetchImpl, 'https://api.test'));
    expect(health.auth.ok).toBe(true);
    expect(health.catalog.ok).toBe(true);
    expect(health.credits.ok).toBe(true);
    expect(credits?.creditsRemaining).toBe(40);
    expect(readCreditsSnapshot()?.creditsRemaining).toBe(40);
  });
});

describe('runs advance by reading, charges by delta, cap by ledger', () => {
  test('a running asset run is delivered on a generated poll, the file is rehosted, the thumbnail kept, and the charge measured from the balance', async () => {
    const c = createCampaign({ text: 'delta test', product: '', audience: '', goal: 'unset' });
    const run = startRun({ campaignId: c.id, kind: 'motion', title: 'm' });
    const { mutateRun } = await import('@/lib/creative-engine/store');
    mutateRun(run.id, (r) => ({ ...r, arcads: { id: 'as-7', type: 'seedance_20', model: 'seedance-2.0', creditsCharged: null, pollPath: 'assets', lastPolledAt: null, lastStatus: 'created', lastRaw: null, creditsBefore: 100, sourceUrl: null, thumbnailUrl: null } }));
    const { writeCreditsSnapshot } = await import('@/lib/creative-engine/store');
    writeCreditsSnapshot({ at: new Date().toISOString(), creditsIncluded: 1000, creditsRemaining: 100, additionalCreditsUsed: 0, periodStart: null, periodEnd: null, plan: null });
    let credits = 100;
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v1/assets/as-7')) return new Response(JSON.stringify({ id: 'as-7', type: 'seedance_20', status: 'generated', url: 'https://cdn/file.mp4', thumbnailUrl: 'https://cdn/thumb.jpg' }), { status: 200 });
      if (url.includes('/v1/credits')) return new Response(JSON.stringify({ creditsIncluded: 1000, creditsRemaining: credits, additionalCreditsUsed: 0 }), { status: 200 });
      if (url.includes('cdn/file.mp4')) { credits = 81.5; return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'video/mp4' } }); }
      if (url.includes('cdn/thumb.jpg')) return new Response(new Uint8Array([9]), { status: 200, headers: { 'content-type': 'image/jpeg' } });
      return new Response('nope', { status: 404 });
    }) as typeof fetch;
    const client = new ArcadsClient('Basic abc', fetchImpl, 'https://api.test');
    const n = await advanceArcadsRuns(0, client);
    expect(n).toBe(1);
    const after = listRuns(c.id)[0];
    expect(after.status, `run said: ${after.arcads?.lastStatus} / ${after.error}`).toBe('delivered');
    expect(after.arcads?.sourceUrl).toBe('https://cdn/file.mp4');
    const asset = readCampaign(c.id)!.assets[0];
    expect(asset.path).toMatch(/\.mp4$/);
    expect(readLedger().find((e) => e.runId === run.id)).toMatchObject({ source: 'delta', creditsCharged: 18.5 });
    expect(readRuns().find((r) => r.id === run.id)?.arcads?.creditsCharged).toBe(18.5);
  }, 30_000); // ffmpeg thumbnail work runs past 5 s when the whole suite shares the machine
  test('a failed poll fails the run with the content-check note; an auth poll error stops the pass', async () => {
    const c = createCampaign({ text: 'fail test', product: '', audience: '', goal: 'unset' });
    const { mutateRun } = await import('@/lib/creative-engine/store');
    const bad = startRun({ campaignId: c.id, kind: 'motion', title: 'bad' });
    mutateRun(bad.id, (r) => ({ ...r, arcads: { id: 'as-bad', type: 'x', model: 'veo31', creditsCharged: 2, pollPath: 'assets', lastPolledAt: null, lastStatus: 'created', lastRaw: null, creditsBefore: null, sourceUrl: null, thumbnailUrl: null } }));
    const { fetchImpl } = fakeFetch([{ path: '/v1/assets/as-bad', body: { id: 'as-bad', type: 'x', status: 'failed', data: { error: { message: 'flagged by a content checker' } } } }]);
    await advanceArcadsRuns(0, new ArcadsClient('Basic abc', fetchImpl, 'https://api.test'));
    expect(listRuns(c.id)[0]).toMatchObject({ status: 'failed', error: 'flagged by a content checker' });
    const probe = startRun({ campaignId: null, kind: 'motion', title: 'probe · kling-2.6' });
    mutateRun(probe.id, (r) => ({ ...r, arcads: { id: 'as-p', type: 'x', model: 'kling-2.6', creditsCharged: null, pollPath: 'assets', lastPolledAt: null, lastStatus: 'created', lastRaw: null, creditsBefore: null, sourceUrl: null, thumbnailUrl: null } }));
    const denied = fakeFetch([{ path: '/v1/assets/as-p', status: 401, body: {} }]);
    await advanceArcadsRuns(0, new ArcadsClient('Basic abc', denied.fetchImpl, 'https://api.test'));
    expect(readRuns().find((r) => r.id === probe.id)?.arcads?.lastStatus).toMatch(/poll auth/);
    expect(readHealth()['kling-2.6']).toBeUndefined();
  });
  test('a download failure keeps the run alive for the next pass instead of losing the paid asset', async () => {
    const c = createCampaign({ text: 'rehost test', product: '', audience: '', goal: 'unset' });
    const { mutateRun } = await import('@/lib/creative-engine/store');
    const run = startRun({ campaignId: c.id, kind: 'motion', title: 'r' });
    mutateRun(run.id, (r) => ({ ...r, arcads: { id: 'as-r', type: 'x', model: 'seedance-2.0', creditsCharged: 3, pollPath: 'assets', lastPolledAt: null, lastStatus: 'created', lastRaw: null, creditsBefore: null, sourceUrl: null, thumbnailUrl: null } }));
    const { fetchImpl } = fakeFetch([{ path: '/v1/assets/as-r', body: { id: 'as-r', type: 'x', status: 'generated', url: 'https://cdn/gone.mp4' } }, { method: 'POST', path: '/v1/assets/as-r/download', body: '"https://cdn/gone.mp4"' }]);
    await advanceArcadsRuns(0, new ArcadsClient('Basic abc', fetchImpl, 'https://api.test'));
    const r = readRuns().find((x) => x.id === run.id)!;
    expect(r.finishedAt).toBeNull();
    expect(r.arcads?.sourceUrl).toBe('https://cdn/gone.mp4');
    expect(r.arcads?.lastStatus).toMatch(/download failed/);
  });
  test('the session cap refuses before any charge and a one-time override passes it', () => {
    writeSettings({ sessionCreditCap: 10, sessionStartedAt: new Date(Date.now() - 1000).toISOString() });
    appendLedger({ at: new Date().toISOString(), kind: 'motion', model: 'veo31', durationSec: null, creditsCharged: 12, runId: 'x', dry: false, source: 'delta' });
    expect(sessionSpend()).toMatchObject({ spent: 12, cap: 10 });
    expect(() => enforceCap(false)).toThrow(/session cap reached/);
    expect(() => enforceCap(true)).not.toThrow();
  });
});

describe('live, only with CREATIVE_ENGINE_LIVE=1 and a key', () => {
  // vitest hides the operator's .env.local on purpose; the live run passes the key in the environment:
  //   CREATIVE_ENGINE_LIVE=1 ARCADS_BASIC_AUTH="$(grep ^ARCADS_BASIC_AUTH= .env.local | cut -d= -f2-)" npm test
  const live = process.env.CREATIVE_ENGINE_LIVE === '1' && !!process.env.ARCADS_BASIC_AUTH;
  test.skipIf(!live)('the free probes answer against the real API', async () => {
    const { health, credits } = await probeFree();
    expect(health.auth).toMatchObject({ ok: true });
    expect(health.catalog).toMatchObject({ ok: true });
    expect(health.credits).toMatchObject({ ok: true });
    expect(typeof credits?.creditsRemaining).toBe('number');
  });
  test.skipIf(!live)('the catalog DTOs match what the client reads (free reads only)', async () => {
    const { createArcadsClient } = await import('@/lib/arcads/client');
    const client = createArcadsClient()!;
    const [situations, voices, products, balance] = await Promise.all([client.situations(), client.voices(), client.products(), client.credits()]);
    const shape = { situations: situations.length, voices: voices.length, products: products.length, creditsRemaining: balance.creditsRemaining, creditsIncluded: balance.creditsIncluded, periodEnd: balance.currentPeriodEnd ?? null };
    // eslint-disable-next-line no-console
    console.log('ARCADS_LIVE', JSON.stringify(shape));
    expect(situations.length).toBeGreaterThan(0);
    const s0 = situations[0];
    expect(typeof s0.id).toBe('string');
    expect(Array.isArray(s0.tags)).toBe(true);
    expect(typeof s0.imageUrl).toBe('string');
    const withActor = situations.find((s) => s.actor);
    // eslint-disable-next-line no-console
    console.log('ARCADS_LIVE_SITUATION_KEYS', Object.keys(s0).sort().join(','), 'ACTOR_KEYS', Object.keys(withActor?.actor ?? {}).sort().join(','), 'DEFAULT_VOICE', typeof (s0 as { defaultVoiceId?: unknown }).defaultVoiceId);
    expect(withActor?.actor?.id).toBeTypeOf('string');
    expect(voices.length).toBeGreaterThan(0);
    expect(typeof voices[0].audioUrl).toBe('string');
    // eslint-disable-next-line no-console
    console.log('ARCADS_LIVE_VOICE_KEYS', Object.keys(voices[0]).sort().join(','), 'PRODUCT_KEYS', Object.keys(products[0] ?? {}).sort().join(','), 'CREDITS_KEYS', Object.keys(balance).sort().join(','));
    expect(groupActors(situations).length).toBeGreaterThan(0);
    expect(matchVoice({ actors: groupActors(situations), voices }, s0.id)).not.toBeNull();
  });
});
