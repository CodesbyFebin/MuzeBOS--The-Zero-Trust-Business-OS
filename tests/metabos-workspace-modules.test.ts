/** The 16 former local-only "existing" pages as persisted modules: registry flip, CRUD, domain rules and member/role gating. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BusinessStore, businessStore } from '@/lib/metabos/store';
import { perform, view } from '@/lib/metabos/modules/engine';
import { WORKSPACE_MODULES } from '@/lib/metabos/modules/catalog-workspace';
import { ALL_FEATURES, pageForSegments, statusCounts } from '@/lib/metabos/registry';
import { member, DEPARTMENTS } from '@/lib/metabos/biz/members';
import { setupWorkspace, invite, outbox, redeemMagicLink, USER_COOKIE } from '@/lib/metabos/biz/accounts';

const mem = () => new BusinessStore(':memory:');
const create = (s: BusinessStore, m: string, data: Record<string, unknown>) => perform(s, m, { action: 'create', data });
const step = (s: BusinessStore, m: string, id: string, transition: string, input: Record<string, unknown> = {}) => {
  const r = s.db.prepare('SELECT version FROM mb_module_records WHERE id=?').get(id) as { version: number };
  return perform(s, m, { action: 'transition', id, version: r.version, transition, input });
};

describe('registry flip', () => {
  it('each module page is available, routed under /workspace, with no legacy redirect target', () => {
    expect(WORKSPACE_MODULES).toHaveLength(16);
    for (const m of WORKSPACE_MODULES) {
      const f = ALL_FEATURES.find((p) => p.id === m.id)!;
      expect(f.status, m.id).toBe('available'); expect(f.target).toBeUndefined(); expect(f.dependencies).toEqual([]);
      const [section, page] = f.route.split('/').slice(2);
      expect(pageForSegments(section, page)?.id).toBe(m.id);
    }
    expect(ALL_FEATURES.find((f) => f.id === 'workflows.canvas')!.route).toBe('/workspace/workflows/canvas');
    expect(statusCounts()).toMatchObject({ available: 184, existing: 7, 'needs-credentials': 43 });
  });
});

describe('domain rules (persisted in SQLite)', () => {
  it('deal pipeline: ref to a stored customer, won is final, lost needs a reason', () => {
    const s = mem(); const c = s.customer({ name: 'Asha', email: 'a@x.in' });
    expect(() => create(s, 'orders.deals-and-pipeline', { name: 'D', customerId: 'nope', value: 100, stage: 'lead' })).toThrow();
    const d = create(s, 'orders.deals-and-pipeline', { name: 'D', customerId: c.id, value: 250000, stage: 'proposal' });
    expect(() => step(s, 'orders.deals-and-pipeline', d.id, 'lose')).toThrow(/lostReason/);
    expect(step(s, 'orders.deals-and-pipeline', d.id, 'win').status).toBe('won');
    expect(() => step(s, 'orders.deals-and-pipeline', d.id, 'lose', { lostReason: 'x' })).toThrow(/Cannot/);
    expect(view(s, 'orders.deals-and-pipeline').records).toHaveLength(1); s.close();
  });
  it('theme: hex validated, one active theme at a time', () => {
    const s = mem(); const th = (name: string) => create(s, 'builder.theme-customizer', { name, background: '#0A0A0A', surface: '#111111', accent: '#FF2A2A' });
    expect(() => create(s, 'builder.theme-customizer', { name: 'bad', background: 'red', surface: '#111111', accent: '#FF2A2A' })).toThrow(/RRGGBB/);
    const a = th('A'), b = th('B'); step(s, 'builder.theme-customizer', a.id, 'activate'); step(s, 'builder.theme-customizer', b.id, 'activate');
    const st = Object.fromEntries(view(s, 'builder.theme-customizer').records.map((r) => [r.data.name, r.status]));
    expect(st).toEqual({ A: 'retired', B: 'active' }); s.close();
  });
  it('merchant profile: GSTIN format, activation writes the invoice header with evidence', () => {
    const s = mem();
    expect(() => create(s, 'settings.merchant-profile', { legalName: 'X', gstin: 'BAD', address: 'a' })).toThrow(/GSTIN/);
    const p = create(s, 'settings.merchant-profile', { legalName: 'Muze Traders', gstin: '29ABCDE1234F1Z5', address: 'Bengaluru', upi: 'muze@upi' });
    step(s, 'settings.merchant-profile', p.id, 'activate');
    expect(s.merchant()).toEqual({ name: 'Muze Traders', address: 'Bengaluru', taxId: '29ABCDE1234F1Z5', upi: 'muze@upi' });
    expect(s.evidence().some((e) => e.action === 'merchant.configured')).toBe(true); s.close();
  });
  it('unique keys and single active policy/limit per key', () => {
    const s = mem();
    create(s, 'settings.application-settings', { key: 'locale', value: 'en-IN' });
    expect(() => create(s, 'settings.application-settings', { key: 'LOCALE', value: 'x' })).toThrow();
    create(s, 'foundation.settings-and-sovereignty', { key: 'retention_days', value: '365' });
    expect(() => create(s, 'foundation.settings-and-sovereignty', { key: 'retention_days', value: '30' })).toThrow(/active/);
    expect(() => create(s, 'foundation.settings-and-sovereignty', { key: 'retention_days', value: 'forever' })).toThrow(/whole number/);
    create(s, 'upgrade.inspect-usage', { metric: 'inference_tokens', monthlyLimit: 100000 });
    expect(() => create(s, 'upgrade.inspect-usage', { metric: 'inference_tokens', monthlyLimit: 5 })).toThrow(/active limit/);
    expect(() => create(s, 'support.project-roadmap', { title: 'x', quarter: 'Q4' })).toThrow(/quarter/);
    s.close();
  });
  it('connections record whether the env var is set, never its value', () => {
    const s = mem(); process.env.MB_TEST_CONN_VAR = 'secret-value';
    const r = create(s, 'settings.connections', { provider: 'Test', envRef: 'MB_TEST_CONN_VAR' });
    expect(r.data.envSet).toBe(true); expect(JSON.stringify(r)).not.toContain('secret-value');
    delete process.env.MB_TEST_CONN_VAR; s.close();
  });
  it('every module creates, lists and transitions with evidence', () => {
    const s = mem(); const c = s.customer({ name: 'C', email: 'c@x.in' });
    const sample: Record<string, Record<string, unknown>> = {
      'orders.deals-and-pipeline': { name: 'D', customerId: c.id, value: 1, stage: 'lead' },
      'operations.tasks-and-goals': { title: 'T', assignee: 'A', priority: 'high', dueOn: '2026-11-01' },
      'builder.theme-customizer': { name: 'T', background: '#0A0A0A', surface: '#161616', accent: '#FF2A2A' },
      'brain.tool-registry': { code: 'gmail', name: 'Gmail', kind: 'connector', scope: 'read', requiresApproval: true },
      'foundation.settings-and-sovereignty': { key: 'export_format', value: 'csv' },
      'system.integrations-and-adapters': { code: 'rzp', name: 'Razorpay', envRef: 'MUZEBOS_RAZORPAY_KEY_ID' },
      'workflows.canvas': { name: 'W', trigger: 'low stock', steps: 'check\nnotify' },
      'settings.application-settings': { key: 'tz', value: 'Asia/Kolkata' },
      'settings.merchant-profile': { legalName: 'M', address: 'A' },
      'settings.connections': { provider: 'SMTP', envRef: 'MUZEBOS_SMTP_HOST' },
      'upgrade.inspect-usage': { metric: 'records', monthlyLimit: 10 },
      'support.setup-checklist': { title: 'Add products', area: 'stock' },
      'support.project-roadmap': { title: 'R', quarter: '2026-Q4' },
      'developer.integration-directory': { code: 'or', name: 'OpenRouter', category: 'ai', docsUrl: 'https://openrouter.ai/docs' },
      'developer.system-blueprint': { title: 'ADR', context: 'c', decision: 'd' },
      'account.operator-security': { control: 'session_review', owner: 'Owner' },
    };
    for (const m of WORKSPACE_MODULES) {
      const r = create(s, m.id, sample[m.id]); expect(r.status).toBe(m.initial);
      const t = Object.entries(m.transitions).find(([, d]) => d.from.includes(m.initial) && !d.inputs)!;
      expect(step(s, m.id, r.id, t[0]).status, m.id).toBe(t[1].to === 'same' ? m.initial : t[1].to);
      const acts = (s.db.prepare('SELECT action FROM mb_audit WHERE target=?').all(r.id) as { action: string }[]).map((e) => e.action);
      expect(acts[0]).toBe(`module.${m.id}.created`);
    }
    s.close();
  });
});

describe('API gating for writes', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mb-wsmod-')); let ownerT = '', staffT = '';
  beforeAll(() => {
    process.env.MUZEBOS_DB = path.join(dir, 'a.sqlite'); const s = businessStore();
    ownerT = setupWorkspace(s, { workspace: 'A', name: 'Owner', email: 'owner@example.com', password: 'correct horse battery' }).token;
    invite(s, member(s, 'owner'), { name: 'Staff', email: 'staff@example.com', role: 'member', department: DEPARTMENTS[0] }, 'http://localhost');
    staffT = redeemMagicLink(s, /link=([^\s]+)/.exec(outbox(s)[0].body)![1]).token;
  });
  afterAll(() => { businessStore().close(); rmSync(dir, { recursive: true, force: true }); });
  const post = async (mod: string, data: Record<string, unknown>, token?: string) => {
    const { POST } = await import('@/app/api/modules/[module]/route');
    return POST(new Request(`http://localhost/api/modules/${mod}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost', 'idempotency-key': randomUUID(), ...(token ? { cookie: `${USER_COOKIE}=${token}` } : {}) }, body: JSON.stringify({ action: 'create', data }) }), { params: Promise.resolve({ module: mod }) });
  };
  const setting = { key: 'currency', value: 'INR' };
  it('401 signed out', async () => { expect((await post('settings.application-settings', setting)).status).toBe(401); });
  it('403 for the member role on an owner-only page', async () => { expect((await post('settings.application-settings', setting, staffT)).status).toBe(403); });
  it('200 for the owner, and a member may add tasks', async () => {
    expect((await post('settings.application-settings', setting, ownerT)).status).toBe(200);
    expect((await post('operations.tasks-and-goals', { title: 'T', assignee: 'S', priority: 'low', dueOn: '2026-11-02' }, staffT)).status).toBe(200);
  });
});
