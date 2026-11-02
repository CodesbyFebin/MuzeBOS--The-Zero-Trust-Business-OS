/**
 * Meta (WhatsApp / Instagram / Messenger) webhook receiver. Verifies and stores;
 * it does not process events or send anything. Ported from the v2 review with
 * four fixes: HMAC over the raw request bytes, a streamed 256 KB cap that holds
 * without Content-Length, per-event dedupe across a batch, and a byte-length
 * check before timingSafeEqual on the verify token.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { BusinessStore } from '@/lib/metabos/store';

export const MAX_WEBHOOK_BYTES = 256 * 1024;
export const WEBHOOK_SOURCES = ['whatsapp', 'instagram', 'messenger'] as const;
export type WebhookSource = (typeof WEBHOOK_SOURCES)[number];
export type WebhookResult = { status: number; body: string };
export const isWebhookSource = (s: string): s is WebhookSource => (WEBHOOK_SOURCES as readonly string[]).includes(s);

/** Constant-time compare that never throws: unequal byte lengths are simply unequal. */
function safeEqual(a: Buffer, b: Buffer) { return a.length === b.length && timingSafeEqual(a, b); }

/** X-Hub-Signature-256 = "sha256=" + hex HMAC of the exact request bytes. */
export function verifyMetaSignature(raw: Buffer, header: string | null, secret: string): boolean {
  if (!header || !/^sha256=[0-9a-f]{64}$/i.test(header)) return false;
  const expected = createHmac('sha256', secret).update(raw).digest();
  return safeEqual(Buffer.from(header.slice(7), 'hex'), expected);
}

/** GET subscription handshake. 503 with no token configured; 403 on mismatch. */
export function verifyChallenge(q: URLSearchParams, token: string | undefined): WebhookResult {
  if (!token) return { status: 503, body: 'not_configured' };
  const given = Buffer.from(q.get('hub.verify_token') ?? '', 'utf8');
  const ok = q.get('hub.mode') === 'subscribe' && safeEqual(given, Buffer.from(token, 'utf8'));
  return ok ? { status: 200, body: q.get('hub.challenge') ?? '' } : { status: 403, body: 'forbidden' };
}

export class BodyTooLarge extends Error {}
/** Read a request body as bytes, aborting as soon as it passes `limit`, whatever Content-Length says. */
export async function readBodyCapped(req: Request, limit = MAX_WEBHOOK_BYTES): Promise<Buffer> {
  const declared = Number(req.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > limit) throw new BodyTooLarge();
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) { await reader.cancel().catch(() => {}); throw new BodyTooLarge(); }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total);
}

const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

/** One key per message / status / messaging event in the whole batch. Falls back to the body hash. */
export function eventKeys(body: unknown, raw: Buffer): string[] {
  const keys: string[] = [];
  const entries = (body as { entry?: unknown[] })?.entry;
  if (Array.isArray(entries)) for (const e of entries as Record<string, unknown>[]) {
    for (const c of (Array.isArray(e?.changes) ? e.changes : []) as Record<string, any>[]) {
      const v = c?.value ?? {};
      for (const m of Array.isArray(v.messages) ? v.messages : []) if (m?.id) keys.push(`msg:${m.id}`);
      for (const s of Array.isArray(v.statuses) ? v.statuses : []) if (s?.id) keys.push(`status:${s.id}:${s.status ?? ''}`);
      if (!(Array.isArray(v.messages) && v.messages.length) && !(Array.isArray(v.statuses) && v.statuses.length)) keys.push(`change:${sha256(JSON.stringify(c))}`);
    }
    for (const m of (Array.isArray(e?.messaging) ? e.messaging : []) as Record<string, any>[]) {
      if (m?.message?.mid) keys.push(`mid:${m.message.mid}`);
      else keys.push(`messaging:${sha256(JSON.stringify(m))}`);
    }
  }
  return keys.length ? keys : [`body:${sha256(raw)}`];
}

/** Verify, then durably record. Nothing is written unless the signature checks out. */
export function receiveWebhook(store: Pick<BusinessStore, 'recordWebhook'>, a: { source: string; raw: Buffer; signature: string | null; secret: string | undefined }): WebhookResult {
  if (!isWebhookSource(a.source)) return { status: 404, body: 'not_found' };
  if (!a.secret) return { status: 503, body: 'not_configured' };
  if (a.raw.byteLength > MAX_WEBHOOK_BYTES) return { status: 413, body: 'too_large' };
  if (!verifyMetaSignature(a.raw, a.signature, a.secret)) return { status: 401, body: 'invalid_signature' };
  let body: unknown;
  try { body = JSON.parse(a.raw.toString('utf8')); } catch { return { status: 400, body: 'bad_json' }; }
  const r = store.recordWebhook({ source: a.source, payload: a.raw.toString('utf8'), bodyHash: sha256(a.raw), eventKeys: eventKeys(body, a.raw) });
  return { status: 200, body: r.newEvents === 0 ? 'duplicate' : 'ok' };
}

/** Which env vars are present. Booleans only; values never leave the server. */
export function metaWebhookConfig(env: Record<string, string | undefined> = process.env) {
  return { appSecret: Boolean(env.META_APP_SECRET), verifyToken: Boolean(env.META_VERIFY_TOKEN) };
}
