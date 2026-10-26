import { afterEach, describe, expect, it } from 'vitest';
import { BusinessStore } from '@/lib/muzebos/store';
import { perform, view, dataSchema } from '@/lib/muzebos/modules/engine';
import { MODULES, moduleById } from '@/lib/muzebos/modules';
import { ORDERS_STOCK_MODULES } from '@/lib/muzebos/modules/catalog-orders-stock';
import { HOOKS, ean13Valid, lineTotal } from '@/lib/muzebos/modules/hooks';
import { ALL_FEATURES, pageForSegments } from '@/lib/muzebos/registry';

const stores: BusinessStore[] = [];
afterEach(() => { while (stores.length) stores.pop()!.close(); });
const fresh = () => { const s = new BusinessStore(':memory:'); stores.push(s); return s; };
const seed = (s: BusinessStore) => ({ c: s.customer({ name: 'Asha', email: '' }), p: s.product({ name: 'Mug', sku: 'MUG-1', price: 10000, taxBps: 1800, stock: 10 }) });
const create = (s: BusinessStore, m: string, data: Record<string, unknown>) => perform(s, m, { action: 'create', data });
const step = (s: BusinessStore, m: string, id: string, transition: string, input: Record<string, unknown> = {}) => {
  const r = s.db.prepare('SELECT version FROM mb_module_records WHERE id=?').get(id) as { version: number };
  return perform(s, m, { action: 'transition', id, version: r.version, transition, input });
};
const stock = (s: BusinessStore, id: string) => s.products().find((p) => p.id === id)!.stock;
const loc = (s: BusinessStore, code: string) => create(s, 'stock.warehouse-and-location-matrix', { code, name: code, kind: 'warehouse' });

describe('registry wiring', () => {
  it('every batch (a) module maps to a registry page that is now available, with a pillar', () => {
    for (const m of ORDERS_STOCK_MODULES) {
      const page = ALL_FEATURES.find((p) => p.id === m.id);
      expect(page, m.id).toBeTruthy();
      expect(page!.status).toBe('available');
      expect(page!.pillar).toBe(m.pillar);
      const [, section, slug] = page!.route.split('/').slice(1);
      expect(pageForSegments(section, slug)?.id).toBe(m.id);
    }
    expect(ORDERS_STOCK_MODULES).toHaveLength(16);
  });
  it('module ids are unique, every def has hooks-only-for-known modules, limits and valid transitions', () => {
    expect(new Set(MODULES.map((m) => m.id)).size).toBe(MODULES.length);
    for (const id of Object.keys(HOOKS)) expect(moduleById(id), id).toBeTruthy();
    for (const m of MODULES) {
      expect(m.limits.length).toBeGreaterThan(0);
      expect(m.states).toContain(m.initial);
      for (const t of Object.values(m.transitions)) { expect(m.states).toContain(t.to); for (const f of t.from) expect(m.states).toContain(f); }
    }
  });
});

describe('engine', () => {
  it('validates fields server-side and rejects unknown keys', () => {
    const s = fresh(); seed(s);
    expect(() => create(s, 'stock.warehouse-and-location-matrix', { code: 'bad code!', name: 'x', kind: 'warehouse' })).toThrow(/code/);
    expect(() => create(s, 'stock.warehouse-and-location-matrix', { code: 'W1', name: 'x', kind: 'moon' })).toThrow(/kind/);
    expect(() => create(s, 'stock.warehouse-and-location-matrix', { code: 'W1', name: 'x', kind: 'warehouse', evil: 1 })).toThrow();
    expect(() => perform(s, 'nope', { action: 'create', data: {} })).toThrow('Unknown module');
    expect(dataSchema(moduleById('stock.batch-and-expiry')!.fields).safeParse({ productId: 'x', batch: 'B', expiresOn: '2026-02-30', quantity: 1 }).success).toBe(false);
  });
  it('enforces uniqueness, optimistic versions (stale) and state guards, and writes evidence', () => {
    const s = fresh();
    const w = loc(s, 'w1');
    expect(w.data.code).toBe('W1');
    expect(() => loc(s, 'W1')).toThrow('already exists');
    perform(s, w.module, { action: 'update', id: w.id, version: 1, data: { code: 'W1', name: 'Main', kind: 'store' } });
    expect(() => perform(s, w.module, { action: 'update', id: w.id, version: 1, data: { code: 'W1', name: 'Again', kind: 'store' } })).toThrow(/Stale/);
    step(s, w.module, w.id, 'archive');
    expect(() => step(s, w.module, w.id, 'archive')).toThrow(/Cannot archive/);
    expect(() => perform(s, w.module, { action: 'update', id: w.id, version: 3, data: { code: 'W1', name: 'x', kind: 'store' } })).toThrow(/cannot be edited/);
    expect(s.evidence().map((e) => e.action)).toEqual(expect.arrayContaining(['module.stock.warehouse-and-location-matrix.created', 'module.stock.warehouse-and-location-matrix.updated', 'module.stock.warehouse-and-location-matrix.archive']));
    expect(s.verifyAudit()).toBe(true);
  });
  it('rejects references that do not exist', () => {
    const s = fresh();
    expect(() => create(s, 'stock.low-stock-alert', { productId: 'missing', threshold: 1 })).toThrow(/not found/);
  });
  it('view returns empty records, refs and stats', () => {
    const s = fresh(); const { p } = seed(s);
    const v = view(s, 'stock.low-stock-alert');
    expect(v.records).toEqual([]);
    expect(v.refs.product.map((o) => o.id)).toEqual([p.id]);
  });
});

describe('orders domain', () => {
  it('POS submit creates a real walk-in order draft; stock guard on create', () => {
    const s = fresh(); const { c, p } = seed(s);
    expect(() => create(s, 'orders.pos-terminal', { customerId: c.id, productId: p.id, quantity: 11 })).toThrow(/Insufficient stock/);
    const sale = create(s, 'orders.pos-terminal', { customerId: c.id, productId: p.id, quantity: 2 });
    const done = step(s, sale.module, sale.id, 'submit');
    expect(done.status).toBe('submitted');
    const order = s.orders().find((o) => o.id === done.data.orderId)!;
    expect(order).toMatchObject({ status: 'awaiting_review', channel: 'walk_in' });
    expect(order.payload.total).toBe(lineTotal(10000, 2, 1800).total);
  });
  it('returns are capped by invoiced quantity, restock on receipt, refund needs a reference and computes the value', () => {
    const s = fresh(); const { c, p } = seed(s);
    const o = s.draft({ customerId: c.id, lines: [{ productId: p.id, quantity: 3 }] }); s.approve(o.id, o.hash); const inv = s.issue(o.id, o.hash);
    expect(stock(s, p.id)).toBe(7);
    expect(() => create(s, 'orders.returns-and-refunds', { invoiceId: inv.id, productId: p.id, quantity: 4, reason: 'damaged' })).toThrow(/remain returnable/);
    const r = create(s, 'orders.returns-and-refunds', { invoiceId: inv.id, productId: p.id, quantity: 2, reason: 'damaged', restock: true });
    expect(() => create(s, 'orders.returns-and-refunds', { invoiceId: inv.id, productId: p.id, quantity: 2, reason: 'other' })).toThrow(/Only 1 of 3/);
    step(s, r.module, r.id, 'approve'); step(s, r.module, r.id, 'receive');
    expect(stock(s, p.id)).toBe(9);
    expect(() => step(s, r.module, r.id, 'refund', {})).toThrow(/refundReference/);
    const done = step(s, r.module, r.id, 'refund', { refundReference: 'UTR123' });
    expect(done.data).toMatchObject({ refundReference: 'UTR123', refundAmount: Math.round(inv.payload.total * 2 / 3) });
  });
  it('gift card balances only decrease through redemptions and exhaust at zero', () => {
    const s = fresh();
    const g = create(s, 'orders.gift-cards-and-credits', { code: 'gift-1', amount: 5000 });
    expect(g.data.balance).toBe(5000);
    expect(() => create(s, 'orders.gift-cards-and-credits', { code: 'GIFT-1', amount: 1 })).toThrow('already exists');
    expect(() => step(s, g.module, g.id, 'redeem', { redeemAmount: 6000 })).toThrow(/exceeds balance/);
    expect(step(s, g.module, g.id, 'redeem', { redeemAmount: 2000 }).data.balance).toBe(3000);
    const last = step(s, g.module, g.id, 'redeem', { redeemAmount: 3000 });
    expect(last).toMatchObject({ status: 'exhausted', data: { balance: 0 } });
    expect(() => perform(s, g.module, { action: 'update', id: g.id, version: last.version, data: { code: 'X', amount: 99999 } })).toThrow(/cannot be edited/);
  });
  it('quotes price from the catalogue with discount and refuse past validity', () => {
    const s = fresh(); const { c, p } = seed(s);
    expect(() => create(s, 'orders.b2b-quote-cpq', { customerId: c.id, productId: p.id, quantity: 1, validUntil: '2000-01-01' })).toThrow(/past/);
    expect(() => create(s, 'orders.b2b-quote-cpq', { customerId: c.id, productId: p.id, quantity: 1, validUntil: '2999-01-01', discountBps: 6000 })).toThrow();
    const q = create(s, 'orders.b2b-quote-cpq', { customerId: c.id, productId: p.id, quantity: 3, discountBps: 1000, validUntil: '2999-01-01' });
    const v = view(s, q.module).records[0];
    expect(v.computed).toMatchObject({ Subtotal: 'INR 270.00', Discount: 'INR 30.00', Tax: 'INR 48.60', Total: 'INR 318.60' });
    s.db.prepare("UPDATE mb_module_records SET data=json_set(data,'$.validUntil','2001-01-01') WHERE id=?").run(q.id);
    expect(() => step(s, q.module, q.id, 'send')).toThrow(/expired/);
  });
  it('waitlist fulfil checks live stock', () => {
    const s = fresh(); const { c, p } = seed(s);
    const w = create(s, 'orders.pre-order-and-waitlist', { customerId: c.id, productId: p.id, quantity: 12 });
    expect(view(s, w.module).records[0].computed?.Availability).toBe('short (10)');
    expect(() => step(s, w.module, w.id, 'fulfil')).toThrow(/Not enough stock/);
  });
});

describe('stock domain', () => {
  it('PO receipt, transfer and shrinkage keep product totals and location ledgers consistent', () => {
    const s = fresh(); const { p } = seed(s);
    const a = loc(s, 'A'), b = loc(s, 'B');
    const po = create(s, 'stock.supplier-purchase-orders', { supplier: 'Acme', productId: p.id, quantity: 5, unitCost: 4000, locationId: a.id });
    expect(() => step(s, po.module, po.id, 'receive')).toThrow(/Cannot receive/);
    step(s, po.module, po.id, 'order'); step(s, po.module, po.id, 'receive');
    expect(stock(s, p.id)).toBe(15); expect(s.locationOnHand(p.id, a.id)).toBe(5);
    expect(() => create(s, 'stock.inter-warehouse-transfer', { productId: p.id, fromId: a.id, toId: a.id, quantity: 1 })).toThrow(/differ/);
    const big = create(s, 'stock.inter-warehouse-transfer', { productId: p.id, fromId: a.id, toId: b.id, quantity: 6 });
    expect(() => step(s, big.module, big.id, 'dispatch')).toThrow(/at location/);
    const t = create(s, 'stock.inter-warehouse-transfer', { productId: p.id, fromId: a.id, toId: b.id, quantity: 3 });
    step(s, t.module, t.id, 'dispatch'); step(s, t.module, t.id, 'receive');
    expect([s.locationOnHand(p.id, a.id), s.locationOnHand(p.id, b.id), stock(s, p.id)]).toEqual([2, 3, 15]);
    expect(() => step(s, a.module, a.id, 'archive')).toThrow(/still holds 2/);
    const adj = create(s, 'stock.shrinkage-and-damage-ledger', { productId: p.id, locationId: b.id, quantity: 1, reason: 'damaged' });
    step(s, adj.module, adj.id, 'post');
    expect([s.locationOnHand(p.id, b.id), stock(s, p.id)]).toEqual([2, 14]);
    expect(() => step(s, adj.module, adj.id, 'post')).toThrow(/Cannot post/);
    const found = create(s, 'stock.shrinkage-and-damage-ledger', { productId: p.id, quantity: 4, reason: 'count_found' });
    step(s, found.module, found.id, 'post');
    expect(stock(s, p.id)).toBe(18);
    const tooMuch = create(s, 'stock.shrinkage-and-damage-ledger', { productId: p.id, quantity: 99, reason: 'theft' });
    expect(() => step(s, tooMuch.module, tooMuch.id, 'post')).toThrow(/Insufficient stock/);
    expect(stock(s, p.id)).toBe(18);
    expect(view(s, a.module).records.find((r) => r.id === b.id)?.computed?.['On hand']).toBe('2');
  });
  it('barcodes validate symbology and EAN-13 check digits', () => {
    expect(ean13Valid('4006381333931')).toBe(true); expect(ean13Valid('4006381333932')).toBe(false);
    const s = fresh(); const { p } = seed(s);
    expect(() => create(s, 'stock.barcode-and-qr-generator', { productId: p.id, symbology: 'EAN-13', value: '4006381333932' })).toThrow(/check digit/);
    create(s, 'stock.barcode-and-qr-generator', { productId: p.id, symbology: 'EAN-13', value: '4006381333931' });
    expect(() => create(s, 'stock.barcode-and-qr-generator', { productId: p.id, symbology: 'QR', value: '4006381333931' })).toThrow('already exists');
  });
  it('variants, serials and batches enforce uniqueness; bundles, reorder and low-stock compute from live stock', () => {
    const s = fresh(); const { p } = seed(s);
    const p2 = s.product({ name: 'Lid', sku: 'LID-1', price: 100, taxBps: 0, stock: 3 });
    expect(() => create(s, 'stock.variant-matrix', { productId: p.id, option: 'Size', value: 'L', sku: 'mug-1' })).toThrow(/catalogue product/);
    create(s, 'stock.variant-matrix', { productId: p.id, option: 'Size', value: 'L', sku: 'MUG-L' });
    expect(() => create(s, 'stock.variant-matrix', { productId: p.id, option: 'Size', value: 'L', sku: 'MUG-L2' })).toThrow('already exists');
    create(s, 'stock.serial-number-registry', { productId: p.id, serial: 'SN1' });
    expect(() => create(s, 'stock.serial-number-registry', { productId: p.id, serial: 'sn1' })).toThrow('already exists');
    const kit = create(s, 'stock.bundles-and-kits', { name: 'Mug set', components: [{ productId: p.id, quantity: 2 }, { productId: p2.id, quantity: 1 }] });
    expect(view(s, kit.module).records[0].computed?.Buildable).toBe('3');
    create(s, 'stock.reorder-point-calculator', { productId: p.id, dailyUsage: 2, leadDays: 4, safetyStock: 3 });
    expect(view(s, 'stock.reorder-point-calculator').records[0].computed).toMatchObject({ 'Reorder point': '11', Action: 'REORDER NOW' });
    create(s, 'stock.low-stock-alert', { productId: p2.id, threshold: 5 });
    expect(view(s, 'stock.low-stock-alert').stats[0]).toEqual({ label: 'Low now', value: '1' });
    expect(() => create(s, 'stock.low-stock-alert', { productId: p2.id, threshold: 1 })).toThrow('already exists');
    create(s, 'stock.batch-and-expiry', { productId: p.id, batch: 'B1', expiresOn: '2000-01-01', quantity: 5 });
    expect(view(s, 'stock.batch-and-expiry').records[0].computed?.Expiry).toBe('EXPIRED');
  });
});
