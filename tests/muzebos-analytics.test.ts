import { describe, expect, it } from 'vitest';
import { analyticsCsv, computeAnalytics, divHalfUp, localDate, parseRange, UNAVAILABLE } from '@/lib/muzebos/analytics';
import type { Invoice, Order } from '@/lib/muzebos/store';

const NOW = new Date('2026-03-15T12:00:00Z');
const payload = (total: number, name = 'Asha') => ({ customer: { name }, subtotal: total - 100, tax: 100, total } as unknown as Invoice['payload']);
const inv = (id: string, total: number, createdAt: string, extra: Partial<Invoice> = {}): Invoice => ({ id, number: `INV-${id}`, orderId: `o${id}`, payload: payload(total), createdAt, payment: 'pending', reference: null, ...extra });
const ord = (id: string, status: string, createdAt: string, channel?: Order['channel'], expiresAt = '2099-01-01T00:00:00Z'): Order => ({ id, status, payload: payload(1000), hash: 'h', expiresAt, createdAt, channel });

describe('analytics metric definitions', () => {
  const invoices = [inv('1', 1000, '2026-01-10T10:00:00Z', { payment: 'manually_reconciled' }), inv('2', 2001, '2026-03-01T10:00:00Z'), inv('3', 500, '2026-03-02T10:00:00Z')];
  const orders = [ord('o1', 'issued', '2026-01-10T09:00:00Z', 'whatsapp'), ord('o2', 'issued', '2026-03-01T09:00:00Z', 'web'), ord('o3', 'issued', '2026-03-02T09:00:00Z'), ord('o4', 'awaiting_review', '2026-03-03T09:00:00Z', 'phone', '2026-03-04T00:00:00Z'), ord('o5', 'awaiting_review', '2026-03-14T09:00:00Z'), ord('o6', 'rejected', '2026-03-05T09:00:00Z')];
  const a = computeAnalytics(invoices, orders, { from: null, to: null }, 0, NOW);
  it('sums issued, settled and outstanding', () => { expect(a.kpis).toMatchObject({ issuedRevenue: 3501, settledRevenue: 1000, outstanding: 2501, invoices: 3 }); });
  it('rounds AOV half-up to the paisa', () => { expect(a.kpis.aov).toBe(1167); expect(divHalfUp(5, 2)).toBe(3); expect(divHalfUp(7, 3)).toBe(2); });
  it('counts expired drafts separately and computes conversion', () => { expect(a.orders).toEqual({ total: 6, awaiting_review: 1, issued: 3, rejected: 1, expired: 1 }); expect(a.kpis.conversion).toBe(0.5); });
  it('zero-fills monthly series up to now', () => { expect(a.monthly.map((m) => [m.month, m.issuedRevenue])).toEqual([['2026-01', 1000], ['2026-02', 0], ['2026-03', 2501]]); });
  it('groups channels with share, default manual', () => { expect(a.channels.map((c) => [c.channel, c.invoices])).toEqual([['web', 1], ['whatsapp', 1], ['manual', 1]]); expect(a.channels[0].share).toBeCloseTo(1 / 3); });
  it('filters by inclusive local-date range', () => { const r = computeAnalytics(invoices, orders, parseRange('2026-03-01', '2026-03-01'), 0, NOW); expect(r.kpis.invoices).toBe(1); expect(r.monthly).toEqual([{ month: '2026-03', issuedRevenue: 2001, invoices: 1 }]); });
  it('uses the timezone offset for the calendar day', () => { expect(localDate('2026-01-31T20:00:00Z', 330)).toBe('2026-02-01'); const r = computeAnalytics([inv('9', 10, '2026-01-31T20:00:00Z')], [], parseRange('2026-02-01', null), 330, NOW); expect(r.kpis.invoices).toBe(1); });
  it('rejects inverted ranges and ignores malformed dates', () => { expect(() => parseRange('2026-02-02', '2026-02-01')).toThrow(RangeError); expect(parseRange('x', '2026-1-1')).toEqual({ from: null, to: null }); });
  it('keeps profit, ROAS and cash flow unavailable with missing inputs', () => { expect(a.unavailable.map((u) => u.metric)).toEqual(['Profit', 'ROAS', 'Cash flow']); for (const u of UNAVAILABLE) expect(u.missing.length).toBeGreaterThan(0); });
  it('exports CSV with neutralised formula cells', () => {
    const evil = inv('7', 1234, '2026-03-03T00:00:00Z'); evil.payload = payload(1234, '=HYPERLINK("x")');
    const csv = analyticsCsv([evil], [], { from: null, to: null });
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe('invoice,date,customer,channel,subtotal_inr,tax_inr,total_inr,payment');
    expect(lines[1]).toBe(`INV-7,2026-03-03,"'=HYPERLINK(""x"")",manual,11.34,1.00,12.34,pending`);
  });
});

describe('analytics with empty data', () => {
  it('returns zeros, nulls and empty series', () => {
    const a = computeAnalytics([], [], { from: null, to: null }, 0, NOW);
    expect(a.empty).toBe(true);
    expect(a.kpis).toEqual({ issuedRevenue: 0, settledRevenue: 0, outstanding: 0, invoices: 0, aov: null, conversion: null });
    expect(a.monthly).toEqual([]); expect(a.channels).toEqual([]); expect(a.orders.total).toBe(0);
  });
  it('zero-fills an explicit empty range and exports a header-only CSV', () => {
    const a = computeAnalytics([], [], parseRange('2026-01-01', '2026-02-28'), 0, NOW);
    expect(a.monthly).toEqual([{ month: '2026-01', issuedRevenue: 0, invoices: 0 }, { month: '2026-02', issuedRevenue: 0, invoices: 0 }]);
    expect(analyticsCsv([], [], { from: null, to: null })).toBe('invoice,date,customer,channel,subtotal_inr,tax_inr,total_inr,payment\r\n');
  });
});
