import { beforeAll, describe, expect, test, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

vi.mock('@/lib/lab/ledger/deps', async (importOriginal) => (await import('./helpers/lab-measure-ref')).withMeasureFallback(await importOriginal()));

import { LAB_DDL } from '@/lib/db';
import { labStore, type LabStore } from '@/lib/lab/store';
import { LAB_PREDICTOR_IDS, LabPredictorIdSchema, type LabPrediction } from '@/lib/schemas';
import { draftPrediction, payloadSha256, seal, verifyFrozen } from '@/lib/lab/ledger/freeze';
import { evalFor } from '@/lib/lab/ledger/evals';
import { predictorDef } from '@/lib/lab/ledger/predictors';
import { seedLabFixtures } from '@/lib/lab/fixtures';
import { DAY, H, addHistory, addPost, addScript, addSource, iso } from './helpers/lab-ledger-world';

let store: LabStore;
let POST: (r: Request) => Promise<Response>;
const NOW = Date.now();

beforeAll(async () => {
  process.env.GLADOS_DB = path.join(mkdtempSync(path.join(tmpdir(), 'glados-ledger-')), 'test.db');
  process.env.GLADOS_MODE_FILE = path.join(tmpdir(), 'no-such-mode-file');
  delete process.env.LAB_DRY;
  const { getDb } = await import('@/lib/data');
  store = getDb().lab;
  POST = (await import('@/app/api/lab/predictions/route')).POST as (r: Request) => Promise<Response>;
  addSource(store, 'own');
  addHistory(store, 'own', NOW, [10_000, 12_000, 9_000, 11_000, 13_000, 10_500, 9_500]);
  addScript(store, 'sc-a', { versions: 2 });
  addScript(store, 'sc-b');
  addPost(store, { id: 'posted', source: 'own', postedAt: NOW - 3 * H, reads: { 1: 500 } });
  addScript(store, 'sc-late', { publishedPostId: 'posted' });
  addSource(store, 'thin', { platform: 'tiktok' });
  addHistory(store, 'thin', NOW, [1_000, 2_000], { platform: 'tiktok', contentType: 'video' });
});

const post = (body: unknown) => POST(new Request('http://localhost/api/lab/predictions', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));

function rawStore() {
  const db = new Database(':memory:');
  db.exec(LAB_DDL);
  return { db, s: labStore(db) };
}
const row = (id: string, extra: Partial<LabPrediction> = {}) => seal(draftPrediction({ id, predictor: 'brody', predictorVersion: 'brody-1', kind: 'pre_post', asOf: iso(NOW), frozenAt: iso(NOW), band: 'above', score: 2, ...extra }));

describe('immutability (06 2.4)', () => {
  test('AC-06-1 a live row\'s frozen fields cannot be updated', () => {
    const { db, s } = rawStore();
    s.predictions.insert(row('lpr-1'));
    expect(() => db.prepare("UPDATE lab_predictions SET band = 'breakout' WHERE id = 'lpr-1'").run()).toThrow(/frozen fields are immutable/);
    // backtest rows are not covered (the nightly run replaces them)
    s.predictions.insert(row('lpr-2', { origin: 'backtest', backtestOrigin: '2026-09-07' }));
    expect(() => db.prepare("UPDATE lab_predictions SET band = 'breakout' WHERE id = 'lpr-2'").run()).not.toThrow();
  });

  test('AC-06-2 live non-dry rows cannot be deleted; clearAll still clears and the triggers come back', () => {
    const { db, s } = rawStore();
    s.predictions.insert(row('lpr-1'));
    s.predictions.insert(row('lpr-d', { dry: true }));
    expect(() => db.prepare("DELETE FROM lab_predictions WHERE id = 'lpr-1'").run()).toThrow(/never deleted/);
    expect(() => db.prepare("DELETE FROM lab_predictions WHERE id = 'lpr-d'").run()).not.toThrow();
    s.clearAll();
    expect(s.counts().lab_predictions).toBe(0);
    const triggers = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'lab_predictions_%'").all() as { name: string }[]).map((t) => t.name).sort();
    expect(triggers).toEqual(['lab_predictions_frozen_cols', 'lab_predictions_grade_once', 'lab_predictions_no_delete', 'lab_predictions_post_once', 'lab_predictions_status_flow']);
  });

  test('AC-06-3 a grade is written once', () => {
    const { s } = rawStore();
    s.predictions.insert(row('lpr-1'));
    const g = { outcomeViews7d: 10, outcomeRatio7d: 1, outcomeBand: 'normal' as const, outcomeIsBreakout: false, outcomeMethod: 'interpolated' as const, hitBand: false, inInterval: null, absLogErr: null, status: 'graded' as const, gradedAt: iso(NOW) };
    s.predictions.grade('lpr-1', g);
    expect(() => s.predictions.grade('lpr-1', { ...g, outcomeViews7d: 99 })).toThrow(/written once/);
  });

  test('AC-06-4 the seal verifies on every fixture row and breaks when inputs change', () => {
    const { s } = rawStore();
    seedLabFixtures(s, new Date('2026-10-11T12:00:00.000Z'));
    const rows = s.predictions.list({ limit: 100_000 });
    expect(rows.length).toBeGreaterThan(50);
    for (const r of rows) expect(verifyFrozen(r), r.id).toBe(true);
    const copy = { ...rows[0], inputs: { ...rows[0].inputs, tampered: 1 } };
    expect(verifyFrozen(copy)).toBe(false);
    expect(payloadSha256(rows[0])).toBe(rows[0].payloadSha256);
  });
});

describe('POST /api/lab/predictions (06 2.7)', () => {
  test('AC-06-29 body validation', async () => {
    expect((await post({ action: 'freeze', scriptId: 'sc-a', version: 1 })).status).toBe(400);
    expect((await post({ action: 'freeze', scriptId: 'sc-a', band: 'above' })).status).toBe(400);
    expect((await post({ action: 'log_external', tool: 'higgsfield', score: 1, scaleMax: 10 })).status).toBe(400);
    expect((await post({ action: 'log_external', postId: 'posted', scriptId: 'sc-a', tool: 'higgsfield', score: 1, scaleMax: 10 })).status).toBe(400);
    expect((await post({ action: 'log_external', postId: 'posted', tool: 'brody', score: 1, scaleMax: 10 })).status).toBe(400);
    expect((await post({ action: 'log_external', postId: 'posted', tool: 'higgsfield', score: 11, scaleMax: 10 })).status).toBe(400);
    expect((await post({ action: 'judge' })).status).toBe(400);
    expect((await post({ action: 'freeze', scriptId: 'sc-a', version: 1, band: 'above', ratioLo: 2 })).status).toBe(400);
    expect((await post({ action: 'freeze', scriptId: 'nope', version: 1, band: 'above' })).status).toBe(404);
    expect((await post({ action: 'freeze', scriptId: 'sc-a', version: 9, band: 'above' })).status).toBe(404);
  });

  test('AC-06-6 and AC-06-7: one freeze per script; creator_median alongside in one transaction', async () => {
    const res = await post({ action: 'freeze', scriptId: 'sc-a', version: 2, band: 'above', ratioLo: 1.6, ratioHi: 2.5, variantRanking: ['h1', 'h2'] });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.version).toBe(2);
    expect(body.late).toBe(false);
    expect(body.label).toMatch(/^Frozen \d{1,2} [A-Z][a-z]{2}, \d{2}:\d{2}$/);
    expect(body.predictions).toHaveLength(2);
    const [brody, cm] = body.predictions as LabPrediction[];
    expect(body.predictionId).toBe(brody.id);
    expect(brody.predictor).toBe('brody');
    expect(brody.score).toBe(2);
    expect(brody.inputs.variantRanking).toEqual(['h1', 'h2']);
    expect(cm.predictor).toBe('creator_median');
    expect(cm.frozenAt).toBe(brody.frozenAt);
    expect(cm.viewsPoint).toBeCloseTo(cm.baseline7dViews!, 6);
    expect(brody.baseline7dViews).toBe(cm.baseline7dViews);
    // edit after freeze is allowed, a second freeze is not
    store.scripts.addVersion({ scriptId: 'sc-a', version: 3, body: store.scripts.latestVersion('sc-a')!.body, gate: { passed: false, checks: [], scores: null }, createdAt: iso(NOW), editDiff: 'x' });
    const again = await post({ action: 'freeze', scriptId: 'sc-a', version: 3, band: 'normal' });
    expect(again.status).toBe(409);
    expect((await again.json()).error).toBe('already_frozen');
    expect(store.predictions.get(brody.id)!.scriptVersion).toBe(2);
  });

  test('AC-06-7 with a baseline sample under 5 only the brody row is written', async () => {
    addScript(store, 'sc-tt');
    store.scripts.addVersion({ scriptId: 'sc-tt', version: 2, body: { ...store.scripts.latestVersion('sc-tt')!.body, platform: 'tiktok' }, gate: { passed: true, checks: [], scores: null }, createdAt: iso(NOW), editDiff: null });
    const res = await post({ action: 'freeze', scriptId: 'sc-tt', version: 2, band: 'normal' });
    expect(res.status).toBe(201);
    expect((await res.json()).predictions).toHaveLength(1);
  });

  test('AC-06-5 late freezes and late outside scores are flagged and never move a metric', async () => {
    const res = await post({ action: 'freeze', scriptId: 'sc-late', version: 1, band: 'breakout' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.late).toBe(true);
    expect(body.label).toBe('Frozen after posting, not graded');
    expect((body.predictions as LabPrediction[]).every((p) => p.late && p.postId === 'posted')).toBe(true);
    const ext = await post({ action: 'log_external', postId: 'posted', tool: 'opusclip', score: 7, scaleMax: 10 });
    expect(ext.status).toBe(201);
    expect((await ext.json()).late).toBe(true);
    // a late row, even graded, changes no metric
    const graded = (id: string, late: boolean) => ({ ...row(id, { sourceId: 'own', late, postId: id }), status: 'graded' as const, outcomeRatio7d: late ? 9 : 1.2, outcomeViews7d: 1000, outcomeBand: 'normal' as const, hitBand: !late });
    const base = Array.from({ length: 6 }, (_, i) => graded(`g${i}`, false));
    const def = predictorDef('brody');
    const opts = { scope: 'live' as const, platform: 'all' as const, windowWeeks: 12, now: new Date(NOW), dry: false, B: 50 };
    expect(evalFor(def, [...base, graded('late1', true)], opts)).toEqual(evalFor(def, base, opts));
  });

  test('AC-06-30 log_external stores a normalised score', async () => {
    const res = await post({ action: 'log_external', scriptId: 'sc-b', tool: 'higgsfield', score: 78, scaleMax: 100 });
    expect(res.status).toBe(201);
    const body = await res.json();
    const p = body.predictions[0] as LabPrediction;
    expect(p.predictor).toBe('external:higgsfield');
    expect(p.score).toBeCloseTo(0.78, 10);
    expect(p.inputs.rawScore).toBe(78);
    expect(p.band).toBeNull();
    expect(body.label).toBe('higgsfield 78/100');
    expect((await post({ action: 'log_external', scriptId: 'sc-b', tool: 'higgsfield', score: 70, scaleMax: 100 })).status).toBe(409);
  });
});

describe('linking to the post (06 2.5)', () => {
  test('markPublished links the frozen rows once; late only for rows frozen after posting', async () => {
    const { markPublished } = await import('@/lib/lab/scripts');
    const { freezePrediction } = await import('@/lib/lab/ledger/freeze');
    const { s } = rawStore();
    addSource(s, 'own');
    addHistory(s, 'own', NOW, [10_000, 12_000, 9_000, 11_000, 13_000]);
    addScript(s, 'sc1');
    const frozen = freezePrediction(s, { action: 'freeze', scriptId: 'sc1', version: 1, band: 'above' }, { now: new Date(NOW - 2 * H), dry: false });
    expect(frozen.predictions).toHaveLength(2);
    addPost(s, { id: 'mine', source: 'own', postedAt: NOW - H });
    expect(markPublished(s, 'sc1', 'mine', { now: new Date(NOW) })).toEqual({ ok: true, noPrediction: false });
    const rows = s.predictions.forScript('sc1');
    expect(rows.every((r) => r.postId === 'mine' && !r.late)).toBe(true);
    expect(rows.every(verifyFrozen)).toBe(true);
    // the link is written once (trigger lab_predictions_post_once)
    expect(() => s.predictions.linkOne(rows[0].id, 'other', true)).not.toThrow();
    expect(s.predictions.get(rows[0].id)!.postId).toBe('mine');
  });
});

describe('predictor ids (06 section 3)', () => {
  test('AC-06-32', () => {
    for (const id of [...LAB_PREDICTOR_IDS, 'external:higgsfield']) expect(LabPredictorIdSchema.safeParse(id).success, id).toBe(true);
    for (const id of ['llm_judge', 'idea_ranker', 'lab_forecast', 'brody_pick', 'lab-early-forecast']) expect(LabPredictorIdSchema.safeParse(id).success, id).toBe(false);
    const { s } = rawStore();
    seedLabFixtures(s, new Date('2026-10-11T12:00:00.000Z'));
    for (const p of s.predictions.list({ limit: 100_000 })) expect(LabPredictorIdSchema.safeParse(p.predictor).success, p.predictor).toBe(true);
    expect(s.predictions.list({ predictor: 'creator_median', limit: 1 }).length).toBe(1);
  });
});
