import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { BusinessStore } from '@/lib/muzebos/store';
import { perform, view, today } from '@/lib/muzebos/modules/engine';
import { DB_MODULES } from '@/lib/muzebos/modules/catalog-db';
import { gstSplit, bucket, vcard } from '@/lib/muzebos/modules/hooks-db';
import { ALL_FEATURES, pageForSegments } from '@/lib/muzebos/registry';

const stores: BusinessStore[] = [];
afterEach(() => { while (stores.length) stores.pop()!.close(); });
const fresh = () => { const s = new BusinessStore(':memory:'); stores.push(s); return s; };
const seed = (s: BusinessStore) => ({ c: s.customer({ name: 'Asha', email: '' }), p: s.product({ name: 'Mug', sku: 'MUG-1', price: 10000, taxBps: 1800, stock: 10 }), q: s.product({ name: 'Lid', sku: 'LID-1', price: 2500, taxBps: 1800, stock: 7 }) });
const issued = (s: BusinessStore, customerId: string, productId: string, quantity = 1) => { const o = s.draft({ customerId, lines: [{ productId, quantity }] }); s.approve(o.id, o.hash); return s.issue(o.id, o.hash); };
const create = (s: BusinessStore, m: string, data: Record<string, unknown>) => perform(s, m, { action: 'create', data });
const step = (s: BusinessStore, m: string, id: string, transition: string, input: Record<string, unknown> = {}) => {
  const r = s.db.prepare('SELECT version FROM mb_module_records WHERE id=?').get(id) as { version: number };
  return perform(s, m, { action: 'transition', id, version: r.version, transition, input });
};
const comp = (s: BusinessStore, m: string, id: string) => view(s, m).records.find((r) => r.id === id)!.computed!;

describe('slice 9a wiring', () => {
  it('every DB-only module is an available registry page with a unique id and honest limits', () => {
    expect(DB_MODULES.length).toBeGreaterThanOrEqual(50);
    expect(new Set(DB_MODULES.map((m) => m.id)).size).toBe(DB_MODULES.length);
    for (const m of DB_MODULES) {
      const p = ALL_FEATURES.find((f) => f.id === m.id);
      expect(p, m.id).toBeTruthy();
      expect(p!.pillar).toBe(m.pillar);
      expect(p!.status).toBe('available');
      const [section, slug] = p!.route.split('/').slice(2);
      expect(pageForSegments(section, slug)?.id).toBe(m.id);
      expect(m.limits.join(' ')).toMatch(/nothing is sent/i);
      expect(Object.keys(m.transitions).join(' ')).not.toMatch(/send|charge|pay/i);
    }
  });
  it('the user-named deferred pillars are built', () => {
    const built = new Set(DB_MODULES.map((m) => m.pillar));
    for (const p of [8, 17, 40, 72, 77, 79, 87, 110, 115, 164]) expect(built.has(p), String(p)).toBe(true);
  });
});

describe('slice 9a behaviour', () => {
  it('8 subscription: next due computed, run creates a real order draft and advances', () => {
    const s = fresh(); const { c, p } = seed(s); const m = 'orders.subscription-scheduler';
    const r = create(s, m, { customerId: c.id, productId: p.id, quantity: 2, intervalDays: 7, startDate: today() });
    expect(r.data.nextDue).toBe(today());
    const after = step(s, m, r.id, 'run');
    expect(after.data.runs).toBe(1);
    expect(s.db.prepare('SELECT COUNT(*) n FROM mb_orders WHERE id=?').get(after.data.lastOrderId as string)).toEqual({ n: 1 });
    expect(after.data.nextDue).toBe(new Date(Date.parse(`${today()}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10));
    step(s, m, r.id, 'pause');
    expect(() => step(s, m, r.id, 'run')).toThrow(/Cannot create order draft/);
  });
  it('17 contract: drawdowns cannot exceed the remaining value', () => {
    const s = fresh(); const { c } = seed(s); const m = 'orders.wholesale-contract-ledger';
    const r = create(s, m, { customerId: c.id, reference: 'wc-1', value: 100000, startDate: today(), endDate: today() });
    step(s, m, r.id, 'drawdown', { amount: 60000 });
    expect(() => step(s, m, r.id, 'drawdown', { amount: 40001 })).toThrow('Only INR 400.00 remains');
    expect(comp(s, m, r.id).Remaining).toBe('INR 400.00');
    expect(() => create(s, m, { customerId: c.id, reference: 'WC-1', value: 1, startDate: today(), endDate: today() })).toThrow(/already exists/);
  });
  it('22 GST split and 40 TCS half-up from the real invoice total', () => {
    expect(gstSplit(10001, 1800, true)).toEqual({ cgst: 900, sgst: 900, igst: 0, total: 11801 });
    expect(gstSplit(10001, 1800, false)).toEqual({ cgst: 0, sgst: 0, igst: 1800, total: 11801 });
    const s = fresh(); const { c, p } = seed(s); const inv = issued(s, c.id, p.id, 1);
    const r = create(s, 'money.tcs-and-tax-collected', { invoiceId: inv.id, rateBps: 100, section: '206C(1H)' });
    expect(r.data.base).toBe(11800); expect(r.data.tcs).toBe(118);
    expect(() => create(s, 'money.tcs-and-tax-collected', { invoiceId: inv.id, rateBps: 100, section: 'x' })).toThrow(/already exists/);
    expect(() => create(s, 'money.tcs-and-tax-collected', { invoiceId: inv.id, rateBps: 100, section: 'x', tcs: 1 })).toThrow();
  });
  it('72 BOM cost and buildable; 77 consignment cap and payable; 79 restock moves stock', () => {
    const s = fresh(); const { p, q } = seed(s);
    const kit = s.product({ name: 'Kit', sku: 'KIT-1', price: 15000, taxBps: 0, stock: 0 });
    const b = create(s, 'stock.bom-configurator', { name: 'Kit BOM', productId: kit.id, components: [{ productId: p.id, quantity: 1 }, { productId: q.id, quantity: 2 }] });
    expect(comp(s, 'stock.bom-configurator', b.id)).toEqual({ 'Cost at catalog price': 'INR 150.00', 'Buildable from stock': '3' });
    expect(() => create(s, 'stock.bom-configurator', { name: 'x', productId: p.id, components: [{ productId: p.id, quantity: 1 }] })).toThrow('own component');
    const c = create(s, 'stock.consignment-manager', { consignor: 'Ravi', productId: p.id, quantityIn: 5, commissionBps: 2000 });
    step(s, 'stock.consignment-manager', c.id, 'sell', { quantity: 3 });
    expect(() => step(s, 'stock.consignment-manager', c.id, 'sell', { quantity: 3 })).toThrow('Only 2');
    expect(comp(s, 'stock.consignment-manager', c.id)['Payable to consignor']).toBe('INR 240.00');
    const r = create(s, 'stock.rma-stock-isolator', { productId: p.id, quantity: 2, reason: 'inspection' });
    step(s, 'stock.rma-stock-isolator', r.id, 'restock');
    expect(s.products().find((x) => x.id === p.id)!.stock).toBe(12);
  });
  it('87 loyalty cannot redeem beyond balance; 110 file sha256; 164 vCard; 100 deterministic bucket', () => {
    const s = fresh(); const { c } = seed(s); const m = 'growth.referrals-and-loyalty';
    const a = create(s, m, { customerId: c.id, code: 'asha10' });
    step(s, m, a.id, 'earn', { points: 50 });
    expect(() => step(s, m, a.id, 'redeem', { points: 51 })).toThrow('Only 50 points');
    expect(step(s, m, a.id, 'redeem', { points: 20 }).data.points).toBe(30);
    const f = create(s, 'operations.file-approvals', { title: 'Logo', content: 'v1' });
    expect(f.data.sha256).toBe(createHash('sha256').update('v1').digest('hex'));
    expect(step(s, 'operations.file-approvals', f.id, 'approve', { note: 'ok' }).status).toBe('approved');
    expect(vcard({ name: 'A, B', title: 'CEO', company: 'M', email: 'a@b.co', phone: '1' })).toContain('FN:A\\, B');
    expect(bucket('x:1')).toBe(bucket('x:1'));
    const ab = create(s, 'growth.a-b-variant-dispatcher', { name: 'hero', splitBps: 10000 });
    expect(step(s, 'growth.a-b-variant-dispatcher', ab.id, 'assign', { visitor: 'v1' }).data.lastAssignment).toMatch(/-> B/);
  });
  it('test transitions keep state; tokens validated; anomaly needs 3 invoices; forecast from invoices', () => {
    const s = fresh(); const { c, p } = seed(s);
    const bot = create(s, 'talk.chat-bot-builder', { name: 'Hours', keywords: 'open, timing', reply: 'We open at 9' });
    step(s, 'talk.chat-bot-builder', bot.id, 'publish');
    const t = step(s, 'talk.chat-bot-builder', bot.id, 'test', { sample: 'What is your timing?' });
    expect(t.status).toBe('published'); expect(t.data.lastTest).toMatch(/-> Hours/);
    expect(() => create(s, 'builder.design-system-tokens', { name: 'brand', kind: 'color', value: 'red' })).toThrow('#rrggbb');
    create(s, 'builder.design-system-tokens', { name: 'brand', kind: 'color', value: '#112233' });
    const ex = create(s, 'builder.design-token-exporter', { name: 'web', prefix: 'mb' });
    expect(comp(s, 'builder.design-token-exporter', ex.id).CSS).toBe('--mb-brand: #112233;');
    const an = create(s, 'brain.anomaly-detector', { name: 'big', sigma: 20 });
    expect(comp(s, 'brain.anomaly-detector', an.id).Flagged).toMatch(/needs 3\+/);
    issued(s, c.id, p.id, 2);
    const fc = create(s, 'brain.forecasting', { productId: p.id, windowDays: 7 });
    expect(comp(s, 'brain.forecasting', fc.id)['Units in last 7d']).toBe('2');
    const form = create(s, 'builder.form-and-intake-constructor', { name: 'Lead', definition: 'Name:text\nEmail:email' });
    expect(step(s, 'builder.form-and-intake-constructor', form.id, 'test', { sample: 'Name=A\nEmail=bad' }).data.lastTest).toBe('invalid: Email not an email');
  });
});
