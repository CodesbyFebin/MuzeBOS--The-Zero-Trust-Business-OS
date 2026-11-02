/**
 * Outbound dispatch behind Jev approval. propose -> approve (jev.decide, exact payload hash) -> dispatch
 * (idempotency key; at most one provider call per key). Every step and the provider response are evidence.
 */
import { createHash, randomUUID } from 'node:crypto';
import { BusinessError, type BusinessStore } from '../store';
import { assertNotOptedOut, onDispatchSent } from '../talk/core';
import { meterDispatch } from '../brain/metering';
import { CHANNELS, NotConnected, missingEnv, runAdapter, type Channel, type Deps } from './adapters';

export type Dispatch = { id: string; channel: Channel; payload: unknown; payloadHash: string; status: 'pending' | 'approved' | 'sent' | 'failed' | 'rejected'; proposedBy: string; approvedBy: string | null; idempotencyKey: string | null; providerStatus: number | null; providerRef: string | null; providerResponse: string | null; createdAt: string; updatedAt: string };
const canon = (v: unknown): string => Array.isArray(v) ? `[${v.map(canon).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v);
export const payloadHash = (channel: Channel, payload: unknown) => createHash('sha256').update(`${channel}\n${canon(payload)}`, 'utf8').digest('hex');

function ensure(s: BusinessStore) {
  s.db.exec(`CREATE TABLE IF NOT EXISTS mb_dispatches(id TEXT PRIMARY KEY, channel TEXT NOT NULL, payload TEXT NOT NULL, payloadHash TEXT NOT NULL, status TEXT NOT NULL, proposedBy TEXT NOT NULL, approvedBy TEXT, idempotencyKey TEXT UNIQUE, providerStatus INTEGER, providerRef TEXT, providerResponse TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)`);
}
const row = (s: BusinessStore, id: string): Dispatch => {
  ensure(s); const r = s.db.prepare('SELECT * FROM mb_dispatches WHERE id=?').get(id) as (Omit<Dispatch, 'payload'> & { payload: string }) | undefined;
  if (!r) throw new BusinessError('Dispatch not found', 404);
  return { ...r, payload: JSON.parse(r.payload) };
};
export function listDispatches(s: BusinessStore): Dispatch[] {
  ensure(s); return (s.db.prepare('SELECT id FROM mb_dispatches ORDER BY createdAt DESC LIMIT 200').all() as { id: string }[]).map((r) => row(s, r.id));
}
export function connection(env: Record<string, string | undefined>) {
  return Object.fromEntries((Object.keys(CHANNELS) as Channel[]).map((c) => { const m = missingEnv(c, env); return [c, m.length ? `Not connected — add ${m.join(', ')}` : 'Configured (env vars present; not a delivery claim)']; }));
}

export function propose(s: BusinessStore, actor: string, channel: Channel, payload: unknown): Dispatch {
  if (!CHANNELS[channel]) throw new BusinessError('Unknown channel', 422);
  const parsed = CHANNELS[channel].schema.safeParse(payload);
  if (!parsed.success) throw new BusinessError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), 422);
  assertNotOptedOut(s, channel, parsed.data);
  ensure(s); const now = new Date().toISOString(); const id = randomUUID(); const hash = payloadHash(channel, parsed.data);
  s.transact(() => {
    s.db.prepare('INSERT INTO mb_dispatches(id,channel,payload,payloadHash,status,proposedBy,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?)').run(id, channel, JSON.stringify(parsed.data), hash, 'pending', actor, now, now);
    s.appendEvidence('dispatch.proposed', id, `${channel} proposed by ${actor}; payload ${hash.slice(0, 12)}; awaiting Jev approval`);
  });
  return row(s, id);
}
export function decide(s: BusinessStore, approver: string, id: string, hash: string, approve: boolean): Dispatch {
  const d = row(s, id);
  if (d.status !== 'pending') throw new BusinessError(`Dispatch is ${d.status}`, 409);
  if (hash !== d.payloadHash) throw new BusinessError('Payload hash does not match the proposal', 409);
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
  // Opt-out is re-checked at send time: a STOP that arrived after approval still blocks the send.
  assertNotOptedOut(s, d.channel, d.payload);
  const missing = missingEnv(d.channel, deps.env);
  if (missing.length) throw new BusinessError(new NotConnected(missing).message, 424);
  // Claim the key before the network call so a concurrent retry cannot send twice.
  const claimed = s.db.prepare("UPDATE mb_dispatches SET idempotencyKey=?, updatedAt=? WHERE id=? AND idempotencyKey IS NULL AND status='approved'").run(idempotencyKey, new Date().toISOString(), id);
  if (claimed.changes !== 1) return row(s, id);
  let r; try { r = await runAdapter(d.channel, d.payload, idempotencyKey, deps); }
  catch (e) { r = { ok: false, status: 0, providerRef: null, evidence: `Adapter error: ${e instanceof Error ? e.message.slice(0, 300) : 'unknown'}` }; }
  s.transact(() => {
    s.db.prepare('UPDATE mb_dispatches SET status=?, providerStatus=?, providerRef=?, providerResponse=?, updatedAt=? WHERE id=?').run(r.ok ? 'sent' : 'failed', r.status, r.providerRef, r.evidence, new Date().toISOString(), id);
    s.appendEvidence(r.ok ? 'dispatch.provider-accepted' : 'dispatch.provider-failed', id, `${d.channel} HTTP ${r.status}${r.providerRef ? ` ref ${r.providerRef}` : ''}; key ${idempotencyKey}`);
    if (r.ok) onDispatchSent(s, { id, channel: d.channel, payload: d.payload, providerRef: r.providerRef });
    if (r.usage) meterDispatch(s, id, r.usage);
  });
  return row(s, id);
}
