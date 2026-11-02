/**
 * MOCKED HTTP LAYER: every provider call here goes to an in-test fake fetch / fake SMTP transport.
 * These tests prove request shape, Jev gating, idempotency and evidence. They do NOT prove a live send.
 */
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { BusinessStore } from '@/lib/metabos/store';
import { decide, dispatch, propose, connection, listDispatches } from '@/lib/metabos/dispatch/service';
import type { Deps, Fetch } from '@/lib/metabos/dispatch/adapters';

type Call = { url: string; headers: Record<string, string>; body: any };
function fake(status: number, response: unknown) {
  const calls: Call[] = [];
  const f: Fetch = async (url, init) => { calls.push({ url, headers: init.headers, body: JSON.parse(init.body) }); return { status, ok: status < 300, text: async () => JSON.stringify(response) }; };
  return { calls, f };
}
const ENV = { MUZEBOS_WHATSAPP_CLOUD_ACCESS_TOKEN: 'wa-token', MUZEBOS_WHATSAPP_PHONE_NUMBER_ID: '106540352242922', MUZEBOS_RAZORPAY_KEY_ID: 'rzp_test_x', MUZEBOS_RAZORPAY_KEY_SECRET: 'sec', OPENROUTER_API_KEY: 'or-key', MUZEBOS_SMTP_HOST: 'smtp.example.com', MUZEBOS_SMTP_PORT: '587', MUZEBOS_SMTP_USER: 'u', MUZEBOS_SMTP_PASSWORD: 'p', MUZEBOS_SMTP_FROM: 'billing@example.com' };
const approved = (s: BusinessStore, channel: Parameters<typeof propose>[2], payload: unknown) => { const d = propose(s, 'm1', channel, payload); return decide(s, 'owner', d.id, d.payloadHash, true); };
const evidence = (s: BusinessStore, id: string) => (s.db.prepare('SELECT action FROM mb_audit WHERE target=?').all(id) as { action: string }[]).map((e) => e.action);

describe('[mocked HTTP] WhatsApp Cloud API text send', () => {
  it('posts the documented body to /v25.0/{phone-number-id}/messages and stores the wamid', async () => {
    const s = new BusinessStore(':memory:'); const { calls, f } = fake(200, { messaging_product: 'whatsapp', contacts: [{ input: '+919876543210', wa_id: '919876543210' }], messages: [{ id: 'wamid.TEST' }] });
    const d = approved(s, 'whatsapp', { to: '+919876543210', body: 'Your invoice is ready' });
    const out = await dispatch(s, d.id, d.payloadHash, randomUUID(), { env: ENV, fetch: f });
    expect(calls[0].url).toBe('https://graph.facebook.com/v25.0/106540352242922/messages');
    expect(calls[0].headers.authorization).toBe('Bearer wa-token');
    expect(calls[0].body).toMatchObject({ messaging_product: 'whatsapp', recipient_type: 'individual', to: '+919876543210', type: 'text', text: { body: 'Your invoice is ready' } });
    expect(out.status).toBe('sent'); expect(out.providerRef).toBe('wamid.TEST'); expect(out.providerResponse).toContain('wamid.TEST');
    expect(evidence(s, d.id)).toEqual(['dispatch.proposed', 'dispatch.approved', 'dispatch.provider-accepted']); s.close();
  });
});

describe('[mocked HTTP] Razorpay payment link create', () => {
  it('uses Basic auth, integer paise and the idempotency key as reference_id', async () => {
    const s = new BusinessStore(':memory:'); const { calls, f } = fake(200, { id: 'plink_TEST', short_url: 'https://rzp.io/i/x', status: 'created' });
    const d = approved(s, 'payment-link', { amount: 125050, description: 'Invoice INV-1', customerName: 'Asha', customerEmail: 'a@x.in' });
    const key = randomUUID(); const out = await dispatch(s, d.id, d.payloadHash, key, { env: ENV, fetch: f });
    expect(calls[0].url).toBe('https://api.razorpay.com/v1/payment_links');
    expect(calls[0].headers.authorization).toBe(`Basic ${Buffer.from('rzp_test_x:sec').toString('base64')}`);
    expect(calls[0].body).toMatchObject({ amount: 125050, currency: 'INR', reference_id: key, customer: { name: 'Asha', email: 'a@x.in' } });
    expect(out.providerRef).toBe('plink_TEST https://rzp.io/i/x'); s.close();
  });
  it('rejects a fractional amount before any call', () => {
    const s = new BusinessStore(':memory:');
    expect(() => propose(s, 'm1', 'payment-link', { amount: 10.5, description: 'x', customerName: 'A' })).toThrow(); s.close();
  });
  it('records a provider error as a failed dispatch with the response as evidence', async () => {
    const s = new BusinessStore(':memory:'); const { f } = fake(401, { error: { code: 'BAD_REQUEST_ERROR', description: 'The api key provided is invalid' } });
    const d = approved(s, 'payment-link', { amount: 1000, description: 'x', customerName: 'A' });
    const out = await dispatch(s, d.id, d.payloadHash, randomUUID(), { env: ENV, fetch: f });
    expect(out.status).toBe('failed'); expect(out.providerStatus).toBe(401); expect(out.providerResponse).toContain('api key provided is invalid'); s.close();
  });
});

describe('[mocked HTTP] OpenRouter chat completion through the model router', () => {
  it('sends the router-chosen OpenRouter model to /api/v1/chat/completions', async () => {
    const s = new BusinessStore(':memory:'); const { calls, f } = fake(200, { id: 'gen-TEST', choices: [{ message: { role: 'assistant', content: 'Draft' } }], usage: { total_tokens: 12 } });
    const d = approved(s, 'completion', { prompt: 'Summarise overdue invoices', tier: 'small' });
    const out = await dispatch(s, d.id, d.payloadHash, randomUUID(), { env: ENV, fetch: f });
    expect(calls[0].url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(calls[0].headers.authorization).toBe('Bearer or-key');
    expect(calls[0].body.model).toMatch(/\//); expect(calls[0].body.messages[0]).toEqual({ role: 'user', content: 'Summarise overdue invoices' });
    expect(out.providerRef).toBe('gen-TEST'); s.close();
  });
});

describe('[mocked SMTP transport] email send', () => {
  it('passes host/port/auth to the transport and records the message id', async () => {
    const s = new BusinessStore(':memory:'); const seen: any[] = [];
    const deps: Deps = { env: ENV, fetch: async () => { throw new Error('no http'); }, mail: (o) => { seen.push(o); return { sendMail: async (m) => { seen.push(m); return { messageId: '<abc@example.com>', response: '250 OK', accepted: [m.to], rejected: [] }; } }; } };
    const d = approved(s, 'email', { to: 'c@x.in', subject: 'Invoice', body: 'Attached' });
    const key = randomUUID(); const out = await dispatch(s, d.id, d.payloadHash, key, deps);
    expect(seen[0]).toEqual({ host: 'smtp.example.com', port: 587, secure: false, auth: { user: 'u', pass: 'p' } });
    expect(seen[1]).toMatchObject({ from: 'billing@example.com', to: 'c@x.in', headers: { 'X-MuzeBOS-Idempotency-Key': key } });
    expect(out.status).toBe('sent'); expect(out.providerRef).toBe('<abc@example.com>'); s.close();
  });
});

describe('Jev gate, idempotency and missing keys', () => {
  it('refuses to send before approval or with a different hash', async () => {
    const s = new BusinessStore(':memory:'); const { calls, f } = fake(200, {});
    const d = propose(s, 'm1', 'whatsapp', { to: '+919876543210', body: 'hi' });
    await expect(dispatch(s, d.id, d.payloadHash, randomUUID(), { env: ENV, fetch: f })).rejects.toThrow(/Jev approval/);
    expect(() => decide(s, 'owner', d.id, 'f'.repeat(64), true)).toThrow(/hash/);
    decide(s, 'owner', d.id, d.payloadHash, true);
    await expect(dispatch(s, d.id, 'f'.repeat(64), randomUUID(), { env: ENV, fetch: f })).rejects.toThrow(/hash/);
    expect(calls).toHaveLength(0); s.close();
  });
  it('a repeated idempotency key never calls the provider twice', async () => {
    const s = new BusinessStore(':memory:'); const { calls, f } = fake(200, { messages: [{ id: 'wamid.1' }] });
    const d = approved(s, 'whatsapp', { to: '+919876543210', body: 'hi' }); const key = randomUUID();
    await dispatch(s, d.id, d.payloadHash, key, { env: ENV, fetch: f }); await dispatch(s, d.id, d.payloadHash, key, { env: ENV, fetch: f });
    await expect(dispatch(s, d.id, d.payloadHash, randomUUID(), { env: ENV, fetch: f })).rejects.toThrow(/sent/);
    expect(calls).toHaveLength(1); s.close();
  });
  it('says "Not connected — add VAR" when env vars are missing, without a call', async () => {
    const s = new BusinessStore(':memory:'); const { calls, f } = fake(200, {});
    const d = approved(s, 'payment-link', { amount: 1000, description: 'x', customerName: 'A' });
    await expect(dispatch(s, d.id, d.payloadHash, randomUUID(), { env: {}, fetch: f })).rejects.toThrow('Not connected — add MUZEBOS_RAZORPAY_KEY_ID, MUZEBOS_RAZORPAY_KEY_SECRET');
    expect(connection({}).whatsapp).toBe('Not connected — add MUZEBOS_WHATSAPP_CLOUD_ACCESS_TOKEN, MUZEBOS_WHATSAPP_PHONE_NUMBER_ID');
    expect(listDispatches(s)[0].status).toBe('approved'); expect(calls).toHaveLength(0); s.close();
  });
});
