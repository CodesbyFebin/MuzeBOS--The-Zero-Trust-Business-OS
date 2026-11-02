import { BusinessError, type BusinessStore } from '../store';
import { formatMoney, type ModuleRecord } from './types';
import { productById, records, today } from './engine';
import { lineTotal, type Hooks } from './hooks';

const n = (v: unknown) => Number(v ?? 0);
const s = (v: unknown) => String(v ?? '');
const count = (recs: ModuleRecord[], st: string) => String(recs.filter((r) => r.status === st).length);
const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
function invoice(store: BusinessStore, id: string) {
  const inv = store.invoices().find((i) => i.id === id);
  if (!inv) throw new BusinessError('Invoice not found', 422);
  return inv;
}
/** micro-INR per unit x minor units of the foreign currency (2 decimals) -> paise, half-up. */
export function convertToPaise(foreignMinor: number, inrPerUnitMicro: number) {
  return Number((BigInt(foreignMinor) * BigInt(inrPerUnitMicro) + 500_000n) / 1_000_000n);
}
const sumPaise = (recs: ModuleRecord[]) => recs.reduce((a, r) => a + n(r.data.amount), 0);

export const MONEY_HOOKS: Record<string, Hooks> = {
  'orders.tax-jurisdiction-matrix': {
    unique: ['code'],
    compute: (_s, r): Record<string, string> => ({ Rate: pct(n(r.data.rateBps)), 'Tax on INR 1,000.00': formatMoney(lineTotal(100_000, 1, n(r.data.rateBps)).tax), ...(s(r.data.effectiveFrom) > today() ? { Pending: `from ${s(r.data.effectiveFrom)}` } : {}) }),
    stats: (_s, recs) => [{ label: 'Active', value: count(recs, 'active') }],
  },
  'money.pricing-and-discounts': {
    validate: (store, d) => { if (s(d.endsOn) < s(d.startsOn)) throw new BusinessError('Ends on must be on or after starts on', 422); productById(store, s(d.productId)); },
    transition: (store, r, t) => {
      if (t !== 'activate') return;
      if (s(r.data.endsOn) < today()) throw new BusinessError('This rule has already ended; edit the dates first', 409);
      const clash = records(store, r.module).find((x) => x.id !== r.id && x.status === 'active' && x.data.productId === r.data.productId);
      if (clash) throw new BusinessError(`Another active rule exists for this product (${s(clash.data.name)})`, 409);
    },
    compute: (store, r): Record<string, string> => {
      const p = store.products().find((x) => x.id === r.data.productId);
      if (!p) return { Price: 'product missing' };
      const t = today(), live = r.status === 'active' && s(r.data.startsOn) <= t && t <= s(r.data.endsOn);
      return { 'List price': formatMoney(p.price), 'Discounted unit (pre-tax)': formatMoney(lineTotal(p.price, 1, 0, n(r.data.discountBps)).subtotal), 'In effect today': live ? 'yes' : 'no' };
    },
    stats: (_s, recs) => [{ label: 'Active', value: count(recs, 'active') }, { label: 'Draft', value: count(recs, 'draft') }],
  },
  'money.multi-currency-converter': {
    unique: ['currency'],
    validate: (_s, d) => {
      if (!/^[A-Z]{3}$/.test(s(d.currency))) throw new BusinessError('Currency must be a three-letter ISO 4217 code', 422);
      if (d.currency === 'INR') throw new BusinessError('INR is the base currency', 422);
      if (s(d.asOf) > today()) throw new BusinessError('As-of date cannot be in the future', 422);
    },
    compute: (_s, r): Record<string, string> => {
      const age = daysBetween(s(r.data.asOf), today());
      return { 'INR per unit': (n(r.data.inrPerUnitMicro) / 1_000_000).toFixed(6), [`100.00 ${s(r.data.currency)}`]: formatMoney(convertToPaise(10_000, n(r.data.inrPerUnitMicro))), Freshness: age > 7 ? `stale (${age} days old)` : `${age} day(s) old` };
    },
    stats: (_s, recs) => [{ label: 'Active rates', value: count(recs, 'active') }, { label: 'Stale (>7 days)', value: String(recs.filter((r) => r.status === 'active' && daysBetween(s(r.data.asOf), today()) > 7).length) }],
  },
  'money.dispute-and-chargeback-logger': {
    validate: (store, d, existing) => {
      const inv = invoice(store, s(d.invoiceId));
      const prior = sumPaise(records(store, 'money.dispute-and-chargeback-logger').filter((r) => r.id !== existing?.id && r.data.invoiceId === d.invoiceId && ['open', 'evidence_submitted', 'lost'].includes(r.status)));
      if (n(d.amount) + prior > inv.payload.total) throw new BusinessError(`Disputed total would exceed invoice ${inv.number} total ${formatMoney(inv.payload.total)}`, 422);
    },
    compute: (_s, r): Record<string, string> => { const d = daysBetween(today(), s(r.data.respondBy)); return r.status === 'open' ? { Deadline: d < 0 ? `overdue by ${-d} day(s)` : `${d} day(s) left` } : {}; },
    stats: (_s, recs) => [{ label: 'Open', value: count(recs, 'open') }, { label: 'Open amount', value: formatMoney(sumPaise(recs.filter((r) => r.status === 'open' || r.status === 'evidence_submitted'))) }, { label: 'Lost', value: formatMoney(sumPaise(recs.filter((r) => r.status === 'lost'))) }],
  },
  'money.credit-notes': {
    validate: (store, d) => { invoice(store, s(d.invoiceId)); },
    transition: (store, r, t) => {
      if (t !== 'issue') return;
      const inv = invoice(store, s(r.data.invoiceId));
      const all = records(store, r.module);
      const issued = sumPaise(all.filter((x) => x.status === 'issued' && x.data.invoiceId === r.data.invoiceId));
      if (issued + n(r.data.amount) > inv.payload.total) throw new BusinessError(`Credit would exceed invoice ${inv.number}: ${formatMoney(inv.payload.total - issued)} remains creditable`, 422);
      const seq = all.filter((x) => x.data.number).length + 1;
      return { data: { number: `CN-${String(seq).padStart(4, '0')}` } };
    },
    compute: (store, r): Record<string, string> => { const inv = store.invoices().find((i) => i.id === r.data.invoiceId); return inv ? { 'Invoice total': formatMoney(inv.payload.total) } : {}; },
    stats: (_s, recs) => [{ label: 'Issued', value: count(recs, 'issued') }, { label: 'Issued value', value: formatMoney(sumPaise(recs.filter((r) => r.status === 'issued'))) }],
  },
  'money.proforma-to-invoice': {
    validate: (_s, d) => { if (s(d.validUntil) < today()) throw new BusinessError('Valid until cannot be in the past', 422); },
    transition: (store, r, t) => {
      if (t === 'send' && s(r.data.validUntil) < today()) throw new BusinessError('This proforma has expired; edit the validity first', 409);
      if (t !== 'convert') return;
      if (s(r.data.validUntil) < today()) throw new BusinessError('This proforma has expired', 409);
      const order = store.draft({ customerId: r.data.customerId, lines: r.data.lines });
      return { data: { orderId: order.id } };
    },
    compute: (store, r): Record<string, string> => {
      let total = 0;
      for (const l of r.data.lines as { productId: string; quantity: number }[]) { const p = store.products().find((x) => x.id === l.productId); if (!p) return { Total: 'product missing' }; total += lineTotal(p.price, l.quantity, p.taxBps).total; }
      return { 'Total (current prices)': formatMoney(total), ...(r.data.orderId ? { 'Order draft': s(r.data.orderId).slice(0, 8) } : {}) };
    },
    stats: (_s, recs) => [{ label: 'Draft', value: count(recs, 'draft') }, { label: 'Sent', value: count(recs, 'sent') }, { label: 'Converted', value: count(recs, 'converted') }],
  },
};
