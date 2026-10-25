import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { LabSource } from '@/lib/schemas';
import { invalidateModeCache } from '@/lib/paths';
import { ACTOR_FIELD_EXPECTATIONS, actorReports, allPostActorsVerified, fileVerifyRun, isVerified, planVerification, recordActorReport, startActorVerification, verifyActorFields } from '@/lib/lab/measure/actors';
import { planScrape } from '@/lib/lab/sync';
import { emptyStore } from './helpers/lab-measure-world';

/** 04 2.3 actor field verification (AC-04-4, AC-04-5). No network: dry or pure only. */
const KEYS = ['LAB_DRY', 'GLADOS_ENV_LOCAL', 'GLADOS_MODE_FILE', 'DEMO_MODE'] as const;
let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-actors-'));
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
const TT = ACTOR_FIELD_EXPECTATIONS.find((s) => s.actorId === 'clockworks/tiktok-scraper')!;
const src = (id: string, kind: LabSource['kind'], platform: LabSource['platform'], handle: string): LabSource => ({ id, kind, platform, handle, url: null, displayName: handle, status: 'active', addedAt: NOW.toISOString(), reason: null, score: null });

describe('verifyActorFields (AC-04-4)', () => {
  test('a TikTok item missing collectCount is `missing`, and keysSeen holds no value', () => {
    const item = { id: '7301', webVideoUrl: 'https://www.tiktok.com/@maker/video/7301', createTimeISO: '2026-10-01T00:00:00Z', playCount: 12345, diggCount: 99, commentCount: 7, shareCount: 3, authorMeta: { name: 'maker.secret.handle', fans: 4321 }, text: 'a caption with words' };
    const r = verifyActorFields(TT, [item], NOW.toISOString());
    expect(r.status).toBe('missing');
    expect(r.missingRequired).toEqual(['collectCount']);
    expect(r.keysSeen).toContain('authorMeta.name');
    const joined = r.keysSeen.join(' ');
    for (const v of ['7301', 'maker.secret.handle', '12345', 'a caption with words', '4321']) expect(joined).not.toContain(v);
  });
  test('a complete item is ok; no items at all is failed; a fixed actor reads `fixed` after the next verify', () => {
    const full = { id: '1', webVideoUrl: 'u', createTimeISO: 't', playCount: 1, diggCount: 1, commentCount: 1, shareCount: 1, collectCount: 1, authorMeta: { name: 'n', fans: 1 }, videoMeta: { duration: 3 } };
    expect(verifyActorFields(TT, [full], NOW.toISOString())).toMatchObject({ status: 'ok', presentOptional: ['videoMeta.duration'] });
    expect(verifyActorFields(TT, [], NOW.toISOString()).status).toBe('failed');
    const { store } = emptyStore();
    recordActorReport(store, verifyActorFields(TT, [{ id: '1' }], NOW.toISOString()), NOW);
    expect(isVerified(store, TT.actorId)).toBe(false);
    fileVerifyRun(store, { platform: 'tiktok', actorId: TT.actorId, kind: 'post', probe: false, sourceIds: [], actorInput: {} }, [full], 0.004, NOW);
    expect(actorReports(store)[TT.actorId]).toMatchObject({ status: 'fixed', usageTotalUsd: 0.004 });
    expect(isVerified(store, TT.actorId)).toBe(true);
  });
  test('the LC-3 probe records whether the ceiling held', () => {
    const { store } = emptyStore();
    const ig = 'apify/instagram-post-scraper';
    fileVerifyRun(store, { platform: 'instagram', actorId: ig, kind: 'post', probe: false, sourceIds: [], actorInput: {} }, [{ shortCode: 'a' }], 0.01, NOW);
    fileVerifyRun(store, { platform: 'instagram', actorId: ig, kind: 'post', probe: true, sourceIds: [], actorInput: {} }, [{ shortCode: 'a' }], 0.0118, NOW);
    expect(actorReports(store)[ig].chargeCeiling).toBe('honoured');
    fileVerifyRun(store, { platform: 'instagram', actorId: ig, kind: 'post', probe: true, sourceIds: [], actorInput: {} }, [{ shortCode: 'a' }], 0.2, NOW);
    expect(actorReports(store)[ig].chargeCeiling).toBe('ignored');
  });
});

describe('the actor check in the sync planner (AC-04-5)', () => {
  test('a tiktok actor reported missing gives no tiktok group unless override; dry skips the check', () => {
    const { store } = emptyStore();
    store.sources.upsert(src('t', 'tracked', 'tiktok', 'maker'));
    store.sources.upsert(src('i', 'tracked', 'instagram', 'gram'));
    recordActorReport(store, verifyActorFields(TT, [{ id: '1' }], NOW.toISOString()), NOW);
    const plan = planScrape(store, NOW);
    expect(plan.scrapes.map((g) => g.platform)).toEqual(['instagram']);
    expect(plan.unverified).toEqual([{ platform: 'tiktok', actorId: TT.actorId }]);
    expect(planScrape(store, NOW, { override: true }).scrapes.map((g) => g.platform).sort()).toEqual(['instagram', 'tiktok']);
    process.env.LAB_DRY = '1';
    expect(planScrape(store, NOW).scrapes.map((g) => g.platform).sort()).toEqual(['instagram', 'tiktok']);
  });
});

describe('verify-actors runs (dry)', () => {
  test('owned handles only; every run on the apify.verify line; reports filed; the checklist tick', async () => {
    process.env.LAB_DRY = '1';
    const { store } = emptyStore();
    store.sources.upsert(src('o-tt', 'owned', 'tiktok', 'studio.one'));
    store.sources.upsert(src('o-ig', 'owned', 'instagram', 'studio.one'));
    store.sources.upsert(src('t-tt', 'tracked', 'tiktok', 'someone.else'));
    const plan = planVerification(store.sources.all());
    expect(plan.every((t) => t.sourceIds.every((id) => id.startsWith('o-')))).toBe(true);
    expect(plan.filter((t) => !t.probe && t.spec.kind === 'post').every((t) => t.maxTotalChargeUsd === 0.1 && t.maxItems === 3)).toBe(true);
    const runs = await startActorVerification(store, null, { now: NOW });
    expect(runs.length).toBe(plan.length);
    expect(runs.every((r) => r.kind === 'verify' && r.line === 'apify.verify' && r.dry)).toBe(true);
    expect(Object.keys(actorReports(store)).length).toBeGreaterThan(0);
    expect(allPostActorsVerified(store, ['tiktok', 'instagram'])).toBe(isVerified(store, 'clockworks/tiktok-scraper') && isVerified(store, 'apify/instagram-post-scraper'));
  });
});
