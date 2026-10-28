import { afterEach, describe, expect, it } from 'vitest';
import { BusinessStore } from '@/lib/metabos/store';
import { perform, view } from '@/lib/metabos/modules/engine';
import { PROVIDER_MODULES } from '@/lib/metabos/modules/catalog-providers';
import { QUEUED_LABEL } from '@/lib/metabos/modules/types';
import { ALL_FEATURES, statusCounts } from '@/lib/metabos/registry';
import { providerConfig, setRef, testConnection } from '@/lib/metabos/providers';

const stores: BusinessStore[] = [];
afterEach(() => { while (stores.length) stores.pop()!.close(); });
const fresh = () => { const s = new BusinessStore(':memory:'); stores.push(s); return s; };
const step = (s: BusinessStore, m: string, id: string, transition: string) => {
  const r = s.db.prepare('SELECT version FROM mb_module_records WHERE id=?').get(id) as { version: number };
  return perform(s, m, { action: 'transition', id, version: r.version, transition, input: {} });
};

describe('slice 9b provider pages', () => {
  it('every provider module is a needs-credentials registry page, never available', () => {
    expect(PROVIDER_MODULES.length).toBe(43);
    for (const m of PROVIDER_MODULES) {
      const p = ALL_FEATURES.find((f) => f.id === m.id);
      expect(p, m.id).toBeTruthy();
      expect(p!.pillar).toBe(m.pillar);
      expect(p!.status).toBe('needs-credentials');
    }
    expect(statusCounts()['needs-credentials']).toBe(43);
  });
  it('outboxes have no sent/delivered/paid state', () => {
    for (const m of PROVIDER_MODULES) {
      expect(m.states).toEqual(['draft', 'queued', 'cancelled']);
      for (const t of Object.values(m.transitions)) expect(t.to).not.toMatch(/sent|deliver|paid|publish|live/);
    }
  });
  it('approval binds a payload hash and stays queued, provider not connected', () => {
    const s = fresh();
    const c = s.customer({ name: 'Asha', email: '' });
    const r = perform(s, 'talk.whatsapp-hub', { action: 'create', data: { customerId: c.id, phone: '+919800000000', body: 'Hello' } });
    const q = step(s, 'talk.whatsapp-hub', r.id, 'queue');
    expect(q.status).toBe('queued');
    expect(String(q.data.payloadHash)).toMatch(/^[0-9a-f]{64}$/);
    const v = view(s, 'talk.whatsapp-hub');
    expect(v.records[0].computed!.Dispatch).toBe(QUEUED_LABEL);
    expect(v.stats.find((x) => x.label === 'Sent')!.value).toBe('0');
    expect(() => perform(s, 'talk.whatsapp-hub', { action: 'update', id: r.id, version: q.version, data: { customerId: c.id, phone: '+91', body: 'x' } })).toThrow();
    expect(step(s, 'talk.whatsapp-hub', r.id, 'cancel').status).toBe('cancelled');
  });
  it('payment link amount comes from the real invoice', () => {
    const s = fresh();
    const c = s.customer({ name: 'A', email: '' });
    const p = s.product({ name: 'Mug', sku: 'M1', price: 10000, taxBps: 1800, stock: 5 });
    const o = s.draft({ customerId: c.id, lines: [{ productId: p.id, quantity: 2 }] }); s.approve(o.id, o.hash); const inv = s.issue(o.id, o.hash);
    const r = perform(s, 'money.payment-link-generator', { action: 'create', data: { invoiceId: inv.id, expiresOn: '2030-01-01' } });
    expect(r.data.amount).toBe(inv.payload.total);
  });
  it('config stores env references only and never returns values', () => {
    const s = fresh();
    const env = { MUZEBOS_META_ACCESS_TOKEN: 'super-secret-value' };
    const cfg = providerConfig(s, 'talk.instagram-and-messenger-hub', env);
    expect(cfg.secrets[0]).toEqual({ key: 'access_token', label: 'Access token', ref: 'MUZEBOS_META_ACCESS_TOKEN', isSet: true });
    expect(JSON.stringify(cfg)).not.toContain('super-secret-value');
    expect(() => setRef(s, 'talk.instagram-and-messenger-hub', 'access_token', 'DATABASE_URL')).toThrow(/MUZEBOS_/);
    expect(() => setRef(s, 'talk.instagram-and-messenger-hub', 'access_token', 'bad name')).toThrow();
    expect(() => setRef(s, 'talk.instagram-and-messenger-hub', 'nope', 'MUZEBOS_X')).toThrow();
    expect(setRef(s, 'talk.instagram-and-messenger-hub', 'access_token', 'MUZEBOS_IG_TOKEN').secrets[0].ref).toBe('MUZEBOS_IG_TOKEN');
    const cols = s.db.prepare('SELECT * FROM mb_provider_config').all();
    expect(JSON.stringify(cols)).not.toContain('super-secret-value');
    expect(() => providerConfig(s, 'orders.loyalty-program')).toThrow();
  });
  it('test connection: not configured, real request with credentials, failure, no-live-test', async () => {
    const s = fresh();
    let calls: { url: string; auth: string }[] = [];
    const fetch = async (url: string, init?: RequestInit) => { calls.push({ url, auth: String((init?.headers as Record<string, string>).authorization) }); return { status: url.includes('cloudflare') ? 200 : 401, ok: false }; };
    expect((await testConnection(s, 'builder.cdn-controller', { env: {}, fetch })).status).toBe('not-configured');
    expect(calls).toHaveLength(0);
    const ok = await testConnection(s, 'builder.cdn-controller', { env: { MUZEBOS_CLOUDFLARE_API_TOKEN: 't' }, fetch });
    expect(ok.status).toBe('ok');
    expect(calls[0]).toEqual({ url: 'https://api.cloudflare.com/client/v4/user/tokens/verify', auth: 'Bearer t' });
    const bad = await testConnection(s, 'money.payouts', { env: { MUZEBOS_RAZORPAYX_KEY_ID: 'a', MUZEBOS_RAZORPAYX_KEY_SECRET: 'b' }, fetch });
    expect(bad).toMatchObject({ status: 'failed' });
    expect(bad.message).toContain('credentials rejected');
    expect((await testConnection(s, 'system.hardware-key-validator', { env: {}, fetch })).status).toBe('no-live-test');
    expect(providerConfig(s, 'builder.cdn-controller', {}).lastTest!.status).toBe('ok');
    calls = [];
    const http = await testConnection(s, 'growth.push-notifications', { env: { MUZEBOS_PUSH_SERVICE_BASE_URL: 'http://insecure', MUZEBOS_PUSH_SERVICE_API_KEY: 'k' }, fetch });
    expect(http.message).toMatch(/https/); expect(calls).toHaveLength(0);
  });
});
