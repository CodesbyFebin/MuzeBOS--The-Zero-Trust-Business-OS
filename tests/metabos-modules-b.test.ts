import { afterEach, describe, expect, it } from 'vitest';
import { BusinessStore } from '@/lib/metabos/store';
import { perform, view, today } from '@/lib/metabos/modules/engine';
import { MONEY_MODULES } from '@/lib/metabos/modules/catalog-money';
import { convertToPaise } from '@/lib/metabos/modules/hooks-money';
import { ALL_FEATURES, pageForSegments } from '@/lib/metabos/registry';

const stores: BusinessStore[] = [];
afterEach(() => { while (stores.length) stores.pop()!.close(); });
const fresh = () => { const s = new BusinessStore(':memory:'); stores.push(s); return s; };
const seed = (s: BusinessStore) => ({ c: s.customer({ name: 'Asha', email: '' }), p: s.product({ name: 'Mug', sku: 'MUG-1', price: 10000, taxBps: 1800, stock: 10 }) });
const create = (s: BusinessStore, m: string, data: Record<string, unknown>) => perform(s, m, { action: 'create', data });
const step = (s: BusinessStore, m: string, id: string, transition: string, input: Record<string, unknown> = {}) => {
  const r = s.db.prepare('SELECT version FROM mb_module_records WHERE id=?').get(id) as { version: number };
  return perform(s, m, { action: 'transition', id, version: r.version, transition, input });
};
const issued = (s: BusinessStore, customerId: string, productId: string, quantity = 1) => { const o = s.draft({ customerId, lines: [{ productId, quantity }] }); s.approve(o.id, o.hash); return s.issue(o.id, o.hash); };
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);

describe('batch (b) registry wiring', () => {
  it('all six money modules are available registry pages with matching pillars and routes', () => {
    expect(MONEY_MODULES.map((m) => m.pillar).sort((a, b) => a! - b!)).toEqual([20, 25, 27, 30, 37, 38]);
    for (const m of MONEY_MODULES) {
      const page = ALL_FEATURES.find((p) => p.id === m.id)!;
      expect(page.status, m.id).toBe('available');
      expect(page.pillar).toBe(m.pillar);
      const [, section, slug] = page.route.split('/').slice(1);
      expect(pageForSegments(section, slug)?.id).toBe(m.id);
    }
  });
});

describe('money domain', () => {
  it('tax rules: unique code, bps bounds, integer worked example', () => {
    const s = fresh();
    const r = create(s, 'orders.tax-jurisdiction-matrix', { code: 'in-ka', region: 'Karnataka', rateBps: 1800, appliesTo: 'goods', effectiveFrom: '2026-01-01' });
    expect(() => create(s, 'orders.tax-jurisdiction-matrix', { code: 'IN-KA', region: 'x', rateBps: 500, appliesTo: 'all', effectiveFrom: '2026-01-01' })).toThrow('already exists');
    expect(() => create(s, 'orders.tax-jurisdiction-matrix', { code: 'X', region: 'x', rateBps: 5001, appliesTo: 'all', effectiveFrom: '2026-01-01' })).toThrow();
    expect(() => create(s, 'orders.tax-jurisdiction-matrix', { code: 'Y', region: 'x', rateBps: 12.5, appliesTo: 'all', effectiveFrom: '2026-01-01' })).toThrow();
    expect(view(s, r.module).records[0].computed).toMatchObject({ Rate: '18.00%', 'Tax on INR 1,000.00': 'INR 180.00' });
  });
  it('price rules: date window, one active rule per product, computed discounted price', () => {
    const s = fresh(); const { p } = seed(s);
    const base = { name: 'Bulk', productId: p.id, discountBps: 1000, minQuantity: 5, startsOn: daysAgo(1), endsOn: '2999-01-01' };
    expect(() => create(s, 'money.pricing-and-discounts', { ...base, endsOn: daysAgo(2) })).toThrow(/Ends on/);
    const a = create(s, 'money.pricing-and-discounts', base);
    const b = create(s, 'money.pricing-and-discounts', { ...base, name: 'Other' });
    step(s, a.module, a.id, 'activate');
    expect(() => step(s, b.module, b.id, 'activate')).toThrow(/Another active rule/);
    expect(view(s, a.module).records.find((r) => r.id === a.id)!.computed).toMatchObject({ 'List price': 'INR 100.00', 'Discounted unit (pre-tax)': 'INR 90.00', 'In effect today': 'yes' });
  });
  it('fx rates: ISO code, no INR, no future dates, integer conversion and staleness', () => {
    const s = fresh();
    expect(() => create(s, 'money.multi-currency-converter', { currency: 'US', inrPerUnitMicro: 1, asOf: today(), source: 'x' })).toThrow(/ISO 4217/);
    expect(() => create(s, 'money.multi-currency-converter', { currency: 'INR', inrPerUnitMicro: 1, asOf: today(), source: 'x' })).toThrow(/base currency/);
    expect(() => create(s, 'money.multi-currency-converter', { currency: 'EUR', inrPerUnitMicro: 1, asOf: '2999-01-01', source: 'x' })).toThrow(/future/);
    create(s, 'money.multi-currency-converter', { currency: 'usd', inrPerUnitMicro: 83_250_000, asOf: daysAgo(10), source: 'RBI reference' });
    const v = view(s, 'money.multi-currency-converter');
    expect(v.records[0].computed).toMatchObject({ '100.00 USD': 'INR 8325.00', Freshness: 'stale (10 days old)' });
    expect(v.stats.find((x) => x.label.startsWith('Stale'))!.value).toBe('1');
    expect(convertToPaise(1, 1_500_000)).toBe(2); // 0.01 unit at 1.5 INR = 1.5 paise -> half-up 2
    expect(Number.isInteger(convertToPaise(12345, 83_123_457))).toBe(true);
  });
  it('disputes: capped at invoice total across open disputes, evidence reference required', () => {
    const s = fresh(); const { c, p } = seed(s); const inv = issued(s, c.id, p.id); // total 11800
    expect(() => create(s, 'money.dispute-and-chargeback-logger', { invoiceId: 'nope', amount: 1, reason: 'fraud', respondBy: '2999-01-01' })).toThrow(/not found/);
    const d = create(s, 'money.dispute-and-chargeback-logger', { invoiceId: inv.id, amount: 10000, reason: 'fraud', respondBy: '2999-01-01' });
    expect(() => create(s, 'money.dispute-and-chargeback-logger', { invoiceId: inv.id, amount: 1801, reason: 'other', respondBy: '2999-01-01' })).toThrow(/exceed invoice/);
    expect(() => step(s, d.module, d.id, 'submit', {})).toThrow(/evidenceReference/);
    expect(step(s, d.module, d.id, 'submit', { evidenceReference: 'DOC-1' }).status).toBe('evidence_submitted');
    expect(step(s, d.module, d.id, 'win').status).toBe('won');
    expect(create(s, 'money.dispute-and-chargeback-logger', { invoiceId: inv.id, amount: 11800, reason: 'other', respondBy: '2999-01-01' }).status).toBe('open');
  });
  it('credit notes: cumulative issued cap, sequential numbers, evidence and audit chain', () => {
    const s = fresh(); const { c, p } = seed(s); const inv = issued(s, c.id, p.id);
    const a = create(s, 'money.credit-notes', { invoiceId: inv.id, amount: 8000, reason: 'Damaged' });
    const b = create(s, 'money.credit-notes', { invoiceId: inv.id, amount: 5000, reason: 'Late' });
    expect(step(s, a.module, a.id, 'issue').data.number).toBe('CN-0001');
    expect(() => step(s, b.module, b.id, 'issue')).toThrow(/INR 38.00 remains/);
    expect(s.db.prepare('SELECT status FROM mb_module_records WHERE id=?').get(b.id)).toEqual({ status: 'draft' });
    expect(() => perform(s, a.module, { action: 'update', id: a.id, version: 2, data: { invoiceId: inv.id, amount: 1, reason: 'x' } })).toThrow(/cannot be edited/);
    const c2 = create(s, 'money.credit-notes', { invoiceId: inv.id, amount: 3800, reason: 'Rest' });
    expect(step(s, c2.module, c2.id, 'issue').data.number).toBe('CN-0002');
    expect(s.invoices()[0].payload.total).toBe(11800);
    expect(s.evidence().some((e) => e.action === 'module.money.credit-notes.issue')).toBe(true);
    expect(s.verifyAudit()).toBe(true);
  });
  it('proforma converts to a real order draft priced from the catalogue; expired ones are refused', () => {
    const s = fresh(); const { c, p } = seed(s);
    expect(() => create(s, 'money.proforma-to-invoice', { customerId: c.id, lines: [{ productId: p.id, quantity: 2 }], validUntil: daysAgo(1) })).toThrow(/past/);
    const pf = create(s, 'money.proforma-to-invoice', { customerId: c.id, lines: [{ productId: p.id, quantity: 2 }], validUntil: '2999-01-01' });
    expect(view(s, pf.module).records[0].computed!['Total (current prices)']).toBe('INR 236.00');
    expect(() => step(s, pf.module, pf.id, 'convert')).toThrow(/Cannot convert/);
    step(s, pf.module, pf.id, 'send');
    const done = step(s, pf.module, pf.id, 'convert');
    const order = s.orders().find((o) => o.id === done.data.orderId)!;
    expect(order).toMatchObject({ status: 'awaiting_review' });
    expect(order.payload.total).toBe(23600);
    const pf2 = create(s, 'money.proforma-to-invoice', { customerId: c.id, lines: [{ productId: p.id, quantity: 1 }], validUntil: '2999-01-01' });
    step(s, pf2.module, pf2.id, 'send');
    s.db.prepare("UPDATE mb_module_records SET data=json_set(data,'$.validUntil','2001-01-01') WHERE id=?").run(pf2.id);
    expect(() => step(s, pf2.module, pf2.id, 'convert')).toThrow(/expired/);
  });
  it('idempotent commands return the original record without duplicate effects', () => {
    const s = fresh(); const { c, p } = seed(s); const inv = issued(s, c.id, p.id);
    const key = '0b6f3c1e-8d7a-4f5b-9c2d-1a2b3c4d5e6f';
    const body = { action: 'create', data: { invoiceId: inv.id, amount: 100, reason: 'x' } };
    const one = s.command(key, { module: 'money.credit-notes', body }, () => perform(s, 'money.credit-notes', body));
    const two = s.command(key, { module: 'money.credit-notes', body }, () => perform(s, 'money.credit-notes', body));
    expect(two.id).toBe(one.id);
    expect(view(s, 'money.credit-notes').records).toHaveLength(1);
  });
});
