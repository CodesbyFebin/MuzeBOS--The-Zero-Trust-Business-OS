/**
 * Outbound dispatch behind Jev approval. propose -> approve (jev.decide, exact payload hash) -> dispatch
 * (idempotency key; at most one provider call per key). Every step and the provider response are evidence.
 */
import { isMetaChannel, metaDryRun } from '@/lib/metabos/meta/graph';
import { assertChannelOpen } from '@/lib/metabos/meta/status';
import { createHash, randomUUID } from 'node:crypto';
import { BusinessError, type BusinessStore } from '../store';
import { assertNotOptedOut, onDispatchSent } from '../talk/core';
import { meterDispatch } from '../brain/metering';
import { getEntry } from '../muse-catalog';
import { CHANNELS, NotConnected, missingEnv, runAdapter, type Channel, type Deps } from './adapters';

export type Dispatch = { id: string; channel: Channel; payload: unknown; payloadHash: string; status: 'pending' | 'approved' | 'sent' | 'failed' | 'rejected'; proposedBy: string; approvedBy: string | null; idempotencyKey: string | null; providerStatus: number | null; providerRef: string | null; providerResponse: string | null; createdAt: string; updatedAt: string; marker: string | null };
const canon = (v: unknown): string => Array.isArray(v) ? `[${v.map(canon).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v);
export const payloadHash = (channel: Channel, payload: unknown) => createHash('sha256').update(`${channel}\n${canon(payload)}`, 'utf8').digest('hex');

function ensure(s: BusinessStore) {
  s.db.exec(`CREATE TABLE IF NOT EXISTS mb_dispatches(id TEXT PRIMARY KEY, channel TEXT NOT NULL, payload TEXT NOT NULL, payloadHash TEXT NOT NULL, status TEXT NOT NULL, proposedBy TEXT NOT NULL, approvedBy TEXT, idempotencyKey TEXT UNIQUE, providerStatus INTEGER, providerRef TEXT, providerResponse TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)`);
  // Internal routing marker (e.g. 'muse', 'muse:rakazo:<botId>'). Kept out of the payload so it is never sent to a recipient.
  if (!(s.db.prepare('PRAGMA table_info(mb_dispatches)').all() as { name: string }[]).some((c) => c.name === 'marker')) s.db.exec('ALTER TABLE mb_dispatches ADD COLUMN marker TEXT');
}
const row = (s: BusinessStore, id: string): Dispatch => {
  ensure(s); const r = s.db.prepare('SELECT * FROM mb_dispatches WHERE id=?').get(id) as (Omit<Dispatch, 'payload'> & { payload: string }) | undefined;
  if (!r) throw new BusinessError('Dispatch not found', 404);
  return { ...r, marker: r.marker ?? null, payload: JSON.parse(r.payload) };
};
export function listDispatches(s: BusinessStore): Dispatch[] {
  ensure(s); return (s.db.prepare('SELECT id FROM mb_dispatches ORDER BY createdAt DESC LIMIT 200').all() as { id: string }[]).map((r) => row(s, r.id));
}
export function connection(env: Record<string, string | undefined>) {
  return Object.fromEntries((Object.keys(CHANNELS) as Channel[]).map((c) => { const m = missingEnv(c, env); return [c, m.length ? `Not connected — add ${m.join(', ')}` : 'Configured (env vars present; not a delivery claim)']; }));
}

export const MARKER = /^muse(:rakazo:[A-Za-z0-9_.-]{1,64})?$/;
export function propose(s: BusinessStore, actor: string, channel: Channel, payload: unknown, marker: string | null = null): Dispatch {
  if (marker !== null && !MARKER.test(marker)) throw new BusinessError('Invalid marker', 422);
  if (!CHANNELS[channel]) throw new BusinessError('Unknown channel', 422);
  const parsed = CHANNELS[channel].schema.safeParse(payload);
  if (!parsed.success) throw new BusinessError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), 422);
  if (channel === 'tool-call') { const e = getEntry((parsed.data as { catalogId: string }).catalogId); if (!e) throw new BusinessError('Unknown catalog entry', 404); if (e.status === 'blocked') throw new BusinessError(`${e.id} is blocked (${e.license})`, 403); }
  assertNotOptedOut(s, channel, parsed.data);
  ensure(s); const now = new Date().toISOString(); const id = randomUUID(); const hash = payloadHash(channel, parsed.data);
  s.transact(() => {
    s.db.prepare('INSERT INTO mb_dispatches(id,channel,payload,payloadHash,status,proposedBy,createdAt,updatedAt,marker) VALUES(?,?,?,?,?,?,?,?,?)').run(id, channel, JSON.stringify(parsed.data), hash, 'pending', actor, now, now, marker);
    s.appendEvidence('dispatch.proposed', id, `${channel} proposed by ${actor}; payload ${hash.slice(0, 12)}; awaiting Jev approval`);
  });
  return row(s, id);
}
/** Dispatches that must clear the two-reviewer gate (/api/bos museReview) rather than a single decide. Meta lead replies are marked here. */
const ensureTwo = (s: BusinessStore) => s.db.exec('CREATE TABLE IF NOT EXISTS mb_dispatch_two_review(dispatchId TEXT PRIMARY KEY, reason TEXT NOT NULL, createdAt TEXT NOT NULL)');
export function markTwoReviewer(s: BusinessStore, id: string, reason: string) {
  ensureTwo(s); s.transact(() => { s.db.prepare('INSERT OR IGNORE INTO mb_dispatch_two_review VALUES(?,?,?)').run(id, reason, new Date().toISOString()); s.appendEvidence('dispatch.two-review.required', id, reason); });
}
export function needsTwoReviewersMarked(s: BusinessStore, id: string) { ensureTwo(s); return !!s.db.prepare('SELECT 1 FROM mb_dispatch_two_review WHERE dispatchId=?').get(id); }
export function decide(s: BusinessStore, approver: string, id: string, hash: string, approve: boolean): Dispatch {
  const d = row(s, id);
  if (d.status !== 'pending') throw new BusinessError(`Dispatch is ${d.status}`, 409);
  if (hash !== d.payloadHash) throw new BusinessError('Payload hash does not match the proposal', 409);
  const p = d.payload as { body?: unknown; subject?: unknown };
  const two = d.marker?.startsWith('muse') || String(p?.body ?? '').startsWith('[MUSE plan]') || String(p?.subject ?? '').startsWith('[MUSE plan]') || needsTwoReviewersMarked(s, id);
  if (approve && two) {
    const exists = s.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='mb_bos_reviews'").get();
    const signed = exists ? (s.db.prepare('SELECT COUNT(DISTINCT reviewer) n FROM mb_bos_reviews WHERE runId=? AND payloadHash=?').get(id, hash) as { n: number }).n : 0;
    if (signed < 2) throw new BusinessError('This send needs two different reviewers via /api/bos (museReview)', 409);
  }
  s.transact(() => {
    s.db.prepare('UPDATE mb_dispatches SET status=?, approvedBy=?, updatedAt=? WHERE id=?').run(approve ? 'approved' : 'rejected', approver, new Date().toISOString(), id);
    s.appendEvidence(approve ? 'dispatch.approved' : 'dispatch.rejected', id, `Jev ${approve ? 'approved' : 'rejected'} payload ${hash.slice(0, 12)} (${approver})`);
  });
  return row(s, id);
}
/** Sends at most once per idempotency key. A repeat with the same key returns the stored result without calling the provider. */
export async function dispatch(s: BusinessStore, id: string, hash: string, idempotencyKey: string, deps: Deps): Promise<Dispatch> {
  if (!/^[0-9a-f-]{36}$/i.test(idempotencyKey)) throw new BusinessError('Idempotency key (UUID) required', 428);
  ensure(s);
  const prior = s.db.prepare('SELECT id FROM mb_dispatches WHERE idempotencyKey=?').get(idempotencyKey) as { id: string } | undefined;
  if (prior) { if (prior.id !== id) throw new BusinessError('Idempotency key already used for another dispatch', 409); return row(s, id); }
  const d = row(s, id);
  if (d.status !== 'approved') throw new BusinessError(d.status === 'pending' ? 'Needs Jev approval first' : `Dispatch is ${d.status}`, 409);
  if (hash !== d.payloadHash || payloadHash(d.channel, d.payload) !== d.payloadHash) throw new BusinessError('Approved payload hash does not match', 409);
  assertChannelOpen(s, d.channel, d.id);
  // Opt-out is re-checked at send time: a STOP that arrived after approval still blocks the send.
  assertNotOptedOut(s, d.channel, d.payload);
  const missing = missingEnv(d.channel, deps.env);
  if (missing.length) throw new BusinessError(new NotConnected(missing).message, 424);
  // DRY_RUN (default ON for Meta channels): nothing leaves the server; the dispatch stays approved so it can be sent once dry run is off.
  if (isMetaChannel(d.channel) && metaDryRun(deps.env)) {
    s.transact(() => s.appendEvidence('dispatch.dry-run', id, `${d.channel} not sent: DRY_RUN is on (set MUZEBOS_META_DRY_RUN=0 to send); payload ${d.payloadHash.slice(0, 12)}`));
    throw new BusinessError('Dry run — not sent. DRY_RUN is on; set MUZEBOS_META_DRY_RUN=0 to send. The dispatch stays approved.', 424);
  }
  // Claim the key before the network call so a concurrent retry cannot send twice.
  const claimed = s.db.prepare("UPDATE mb_dispatches SET idempotencyKey=?, updatedAt=? WHERE id=? AND idempotencyKey IS NULL AND status='approved'").run(idempotencyKey, new Date().toISOString(), id);
  if (claimed.changes !== 1) return row(s, id);
  let r; try { r = await runAdapter(d.channel, d.payload, idempotencyKey, { store: s, ...deps }); }
  catch (e) { r = { ok: false, status: 0, providerRef: null, evidence: `Adapter error: ${e instanceof Error ? e.message.slice(0, 300) : 'unknown'}` }; }
  s.transact(() => {
    s.db.prepare('UPDATE mb_dispatches SET status=?, providerStatus=?, providerRef=?, providerResponse=?, updatedAt=? WHERE id=?').run(r.ok ? 'sent' : 'failed', r.status, r.providerRef, r.evidence, new Date().toISOString(), id);
    s.appendEvidence(r.ok ? 'dispatch.provider-accepted' : 'dispatch.provider-failed', id, `${d.channel} HTTP ${r.status}${r.providerRef ? ` ref ${r.providerRef}` : ''}; key ${idempotencyKey}`);
    if (r.ok) onDispatchSent(s, { id, channel: d.channel, payload: d.payload, providerRef: r.providerRef });
    if (r.usage) meterDispatch(s, id, r.usage);
  });
  return row(s, id);
}
