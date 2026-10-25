import { beforeAll, describe, expect, test } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Own temp DB so ingest is observable in isolation. Secret read at request
// time, so tests can toggle MANYCHAT_WEBHOOK_SECRET between calls.
beforeAll(() => {
  // The webhook FAILS CLOSED since the 2026-08-24 audit: it is the one route
  // the auth middleware lets through, so an unset secret means refuse-all.
  // Every ingest test therefore configures the secret and sends the header.
  process.env.GLADOS_DB = path.join(mkdtempSync(path.join(tmpdir(), 'glados-mc-wh-')), 'test.db');
  process.env.MANYCHAT_WEBHOOK_SECRET = 's3cret';
});

const URL = 'http://localhost/api/webhooks/manychat';
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(URL, {
    method: 'POST',
    // the route fails closed, so the valid secret is the default for helpers
    headers: { 'x-manychat-secret': 's3cret', ...headers },
    body: JSON.stringify(body),
  });

describe('POST /api/webhooks/manychat', () => {
  test('ingests a DM and it lands in the inbox as source=manychat', async () => {
    const { POST } = await import('@/app/api/webhooks/manychat/route');
    const res = await POST(
      post({ subscriber_id: 'wh-1', name: 'Webhook Wendy', handle: 'wendy', text: 'came from manychat', ts: '2026-07-18T16:00:00.000Z' }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    const { getDb } = await import('@/lib/data');
    const found = getDb().social.dmMessages('instagram').find((m) => m.subscriberId === 'wh-1');
    expect(found?.text).toBe('came from manychat');
    expect(found?.source).toBe('manychat');
  });

  test('rejects an unparseable payload with 400', async () => {
    const { POST } = await import('@/app/api/webhooks/manychat/route');
    const res = await POST(post({ text: 'no subscriber id' }));
    expect(res.status).toBe(400);
  });

  test('enforces the shared secret when MANYCHAT_WEBHOOK_SECRET is set', async () => {
    const { POST } = await import('@/app/api/webhooks/manychat/route');

    const bad = await POST(post({ subscriber_id: 'x', text: 'hi' }, { 'x-manychat-secret': 'wrong' }));
    expect(bad.status).toBe(401);

    const good = await POST(post({ subscriber_id: 'x', text: 'hi' }, { 'x-manychat-secret': 's3cret' }));
    expect(good.status).toBe(200);

  });
});

describe('the webhook fails closed', () => {
  test('refuses every request when MANYCHAT_WEBHOOK_SECRET is unset', async () => {
    const prev = process.env.MANYCHAT_WEBHOOK_SECRET;
    delete process.env.MANYCHAT_WEBHOOK_SECRET;
    const { POST } = await import('@/app/api/webhooks/manychat/route');
    const res = await POST(
      new Request('http://localhost/api/webhooks/manychat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriber_id: '1', text: 'hi' }),
      }),
    );
    // 503, not 200: an unconfigured host must not accept anonymous writes
    expect(res.status).toBe(503);
    if (prev) process.env.MANYCHAT_WEBHOOK_SECRET = prev;
  });
});
