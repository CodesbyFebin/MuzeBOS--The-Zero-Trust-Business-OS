import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { BusinessStore } from '@/lib/metabos/store';
import { BodyTooLarge, MAX_WEBHOOK_BYTES, eventKeys, metaWebhookConfig, readBodyCapped, receiveWebhook, verifyChallenge, verifyMetaSignature } from '@/lib/metabos/webhooks';

const SECRET = 'test-app-secret';
const sign = (b: Buffer | string, s = SECRET) => 'sha256=' + createHmac('sha256', s).update(b).digest('hex');
const stores: BusinessStore[] = [];
const fresh = () => { const s = new BusinessStore(':memory:'); stores.push(s); return s; };
afterEach(() => { stores.splice(0).forEach((s) => s.close()); vi.unstubAllEnvs(); vi.resetModules(); });
const count = (s: BusinessStore, t: string) => (s.db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as { n: number }).n;
const wa = (...ids: string[]) => JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'w1', changes: [{ field: 'messages', value: { messages: ids.map((id) => ({ id, type: 'text', text: { body: 'héllo ✓' } })) } }] }] });
const post = (s: BusinessStore, body: Buffer | string, sig: string | null = sign(body), secret: string | undefined = SECRET, source = 'whatsapp') =>
  receiveWebhook(s, { source, raw: Buffer.isBuffer(body) ? body : Buffer.from(body), signature: sig, secret });

describe('happy path', () => {
  it('stores a signed delivery durably with an audit event before answering 200', () => {
    const s = fresh();
    expect(post(s, wa('wamid.1'))).toEqual({ status: 200, body: 'ok' });
    expect(count(s, 'mb_webhook_deliveries')).toBe(1);
    expect(s.webhookEventKeys('whatsapp')).toEqual(['msg:wamid.1']);
    expect(s.evidence().at(-1)?.action).toBe('webhook.received');
    expect(s.verifyAudit()).toBe(true);
  });
  it('answers the subscription challenge with the matching token', () => {
    const q = new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': 'tok', 'hub.challenge': 'c123' });
    expect(verifyChallenge(q, 'tok')).toEqual({ status: 200, body: 'c123' });
  });
  it('accepts instagram and messenger events, keyed by mid', () => {
    const s = fresh(); const b = JSON.stringify({ object: 'instagram', entry: [{ messaging: [{ message: { mid: 'm1' } }, { message: { mid: 'm2' } }] }] });
    expect(post(s, b, sign(b), SECRET, 'instagram').status).toBe(200);
    expect(s.webhookEventKeys('instagram')).toEqual(['mid:m1', 'mid:m2']);
    expect(post(s, b, sign(b), SECRET, 'messenger').status).toBe(200);
  });
});

describe('failure paths', () => {
  it('401s and writes nothing for a missing, malformed or wrong signature', () => {
    const s = fresh(); const b = wa('wamid.x');
    for (const sig of [null, '', 'sha256=00', 'sha1=' + 'a'.repeat(40), sign(b, 'other-secret'), sign(b + ' ')]) expect(post(s, b, sig).status).toBe(401);
    expect(count(s, 'mb_webhook_deliveries')).toBe(0);
    expect(count(s, 'mb_audit')).toBe(0);
  });
  it('503s with no secret (POST) or no verify token (GET), storing nothing', () => {
    const s = fresh(); const b = wa('wamid.y');
    expect(receiveWebhook(s, { source: 'whatsapp', raw: Buffer.from(b), signature: sign(b), secret: undefined })).toEqual({ status: 503, body: 'not_configured' });
    expect(post(s, b, sign(b), '')).toEqual({ status: 503, body: 'not_configured' });
    expect(verifyChallenge(new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': '' }), undefined).status).toBe(503);
    expect(count(s, 'mb_webhook_deliveries')).toBe(0);
  });
  it('403s a wrong token or mode, 404s an unknown source, 400s signed non-JSON', () => {
    expect(verifyChallenge(new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': 'nope' }), 'tok').status).toBe(403);
    expect(verifyChallenge(new URLSearchParams({ 'hub.mode': 'unsubscribe', 'hub.verify_token': 'tok' }), 'tok').status).toBe(403);
    const s = fresh();
    expect(post(s, wa('a'), sign(wa('a')), SECRET, 'telegram').status).toBe(404);
    expect(post(s, 'not json').status).toBe(400);
    expect(count(s, 'mb_webhook_deliveries')).toBe(0);
  });
  it('never exposes secret values, only whether they are set', () => {
    const c = metaWebhookConfig({ META_APP_SECRET: 'super-secret-value', META_VERIFY_TOKEN: '' });
    expect(c).toEqual({ appSecret: true, verifyToken: false });
    expect(JSON.stringify(c)).not.toContain('super-secret-value');
  });
});

describe('bug 1: HMAC over the raw request bytes', () => {
  it('verifies bytes that are not valid UTF-8 (text decoding would alter them)', () => {
    const raw = Buffer.concat([Buffer.from('{"entry":[],"x":"'), Buffer.from([0xff, 0xfe]), Buffer.from('"}')]);
    expect(Buffer.from(raw.toString('utf8')).equals(raw)).toBe(false); // decoding is lossy
    expect(verifyMetaSignature(raw, sign(raw), SECRET)).toBe(true);
    expect(verifyMetaSignature(Buffer.from(raw.toString('utf8')), sign(raw), SECRET)).toBe(false);
  });
  it('verifies a body with a UTF-8 byte-order mark exactly as sent', () => {
    const raw = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(wa('wamid.bom'))]);
    expect(verifyMetaSignature(raw, sign(raw), SECRET)).toBe(true);
  });
});

describe('bug 2: streamed 256 KB cap independent of Content-Length', () => {
  const streamed = (bytes: number, chunk = 16 * 1024) => {
    let sent = 0; let pulls = 0;
    const body = new ReadableStream<Uint8Array>({ pull(c) { pulls++; if (sent >= bytes) return c.close(); const n = Math.min(chunk, bytes - sent); sent += n; c.enqueue(new Uint8Array(n).fill(97)); } });
    const req = new Request('http://x/api/webhooks/whatsapp', { method: 'POST', body, duplex: 'half' } as RequestInit);
    return { req, pulled: () => sent, pulls: () => pulls };
  };
  it('aborts a chunked body without Content-Length as soon as it passes the cap', async () => {
    const s = streamed(4 * 1024 * 1024);
    expect(s.req.headers.get('content-length')).toBeNull();
    await expect(readBodyCapped(s.req)).rejects.toBeInstanceOf(BodyTooLarge);
    expect(s.pulled()).toBeLessThan(MAX_WEBHOOK_BYTES + 64 * 1024); // stopped near the cap, not after 4 MB
  });
  it('rejects early on a declared oversize Content-Length and reads bodies at the cap', async () => {
    const big = new Request('http://x', { method: 'POST', body: 'a', headers: { 'content-length': String(MAX_WEBHOOK_BYTES + 1) } });
    await expect(readBodyCapped(big)).rejects.toBeInstanceOf(BodyTooLarge);
    const exact = streamed(MAX_WEBHOOK_BYTES);
    expect((await readBodyCapped(exact.req)).byteLength).toBe(MAX_WEBHOOK_BYTES);
    expect(post(fresh(), Buffer.alloc(MAX_WEBHOOK_BYTES + 1, 97)).status).toBe(413);
  });
});

describe('bug 3: dedupe per event, not per first message of a batch', () => {
  it('a later batch sharing only its first message id keeps its other messages', () => {
    const s = fresh();
    expect(post(s, wa('wamid.A')).body).toBe('ok');
    expect(post(s, wa('wamid.A', 'wamid.B', 'wamid.C')).body).toBe('ok');
    expect(s.webhookEventKeys('whatsapp')).toEqual(['msg:wamid.A', 'msg:wamid.B', 'msg:wamid.C']);
    expect(s.webhookDeliveries()[0]).toMatchObject({ eventCount: 3, newEvents: 2 });
  });
  it('an exact retry collapses to duplicate; statuses across entries are separate events', () => {
    const s = fresh(); const b = wa('wamid.R');
    expect(post(s, b).body).toBe('ok'); expect(post(s, b).body).toBe('duplicate');
    expect(s.webhookEventKeys('whatsapp')).toEqual(['msg:wamid.R']);
    const st = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: 's1', status: 'sent' }] } }] }, { changes: [{ value: { statuses: [{ id: 's1', status: 'delivered' }, { id: 's2', status: 'read' }] } }] }] });
    expect(eventKeys(JSON.parse(st), Buffer.from(st))).toEqual(['status:s1:sent', 'status:s1:delivered', 'status:s2:read']);
  });
  it('the same id from a different source is a different event', () => {
    const s = fresh(); const b = JSON.stringify({ entry: [{ messaging: [{ message: { mid: 'same' } }] }] });
    expect(post(s, b, sign(b), SECRET, 'instagram').body).toBe('ok');
    expect(post(s, b, sign(b), SECRET, 'messenger').body).toBe('ok');
  });
});

describe('bug 4: verify token compared by byte length', () => {
  it('a token with equal character count but more bytes is a 403, not a throw/500', () => {
    const q = new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': 'émoke-verify', 'hub.challenge': 'x' });
    expect('émoke-verify'.length).toBe('smoke-verify'.length);
    expect(() => verifyChallenge(q, 'smoke-verify')).not.toThrow();
    expect(verifyChallenge(q, 'smoke-verify').status).toBe(403);
  });
  it('a non-ASCII configured token still matches itself', () => {
    expect(verifyChallenge(new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': 'tökén', 'hub.challenge': 'ok' }), 'tökén')).toEqual({ status: 200, body: 'ok' });
  });
});

describe('route handler', () => {
  it('end to end: 413 on a chunked oversize body, 401 unsigned, 200 signed, 503 unconfigured', async () => {
    const s = fresh();
    vi.doMock('@/lib/metabos/store', async (orig) => ({ ...(await orig<object>()), businessStore: () => s }));
    vi.stubEnv('META_APP_SECRET', SECRET);
    const { POST, GET } = await import('@/app/api/webhooks/[source]/route');
    const p = { params: Promise.resolve({ source: 'whatsapp' }) };
    const big = new ReadableStream<Uint8Array>({ pull(c) { c.enqueue(new Uint8Array(64 * 1024)); } });
    expect((await POST(new Request('http://x', { method: 'POST', body: big, duplex: 'half' } as RequestInit), p)).status).toBe(413);
    const b = wa('wamid.route');
    expect((await POST(new Request('http://x', { method: 'POST', body: b }), p)).status).toBe(401);
    const ok = await POST(new Request('http://x', { method: 'POST', body: b, headers: { 'x-hub-signature-256': sign(b) } }), p);
    expect([ok.status, await ok.text(), ok.headers.get('cache-control')]).toEqual([200, 'ok', 'no-store']);
    expect(s.webhookDeliveries()).toHaveLength(1);
    expect((await POST(new Request('http://x', { method: 'POST', body: b }), { params: Promise.resolve({ source: 'sms' }) })).status).toBe(404);
    expect((await GET(new Request('http://x/?hub.mode=subscribe&hub.verify_token=a'), p)).status).toBe(503);
    vi.stubEnv('META_APP_SECRET', '');
    expect((await POST(new Request('http://x', { method: 'POST', body: b, headers: { 'x-hub-signature-256': sign(b) } }), p)).status).toBe(503);
  });
});
