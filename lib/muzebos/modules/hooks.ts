import { BusinessError, type BusinessStore } from '../store';
import { formatMoney, type ModuleRecord } from './types';
import { productById, records, today } from './engine';
import { MONEY_HOOKS } from './hooks-money';

export type Hooks = {
  /** Field combinations that must be unique within the module, e.g. ['code'] or ['productId+serial']. */
  unique?: string[];
  /** Server-side domain validation for create/update; may return derived fields. */
  validate?: (store: BusinessStore, data: Record<string, unknown>, existing: ModuleRecord | null) => Record<string, unknown> | void;
  /** Domain guard and effect of a transition; runs inside the same transaction as the state change. */
  transition?: (store: BusinessStore, rec: ModuleRecord, name: string, input: Record<string, unknown>) => { status?: string; data?: Record<string, unknown> } | void;
  compute?: (store: BusinessStore, rec: ModuleRecord) => Record<string, string>;
  stats?: (store: BusinessStore, recs: ModuleRecord[]) => { label: string; value: string }[];
};
const n = (v: unknown) => Number(v ?? 0);
const s = (v: unknown) => String(v ?? '');
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const count = (recs: ModuleRecord[], st: string) => String(recs.filter((r) => r.status === st).length);

/** Line total in paise for qty units with half-up integer tax rounding (same rule as invoices). */
export function lineTotal(price: number, qty: number, taxBps: number, discountBps = 0) {
  const gross = price * qty;
  const discount = Number((BigInt(gross) * BigInt(discountBps) + 5000n) / 10000n);
  const subtotal = gross - discount;
  const tax = Number((BigInt(subtotal) * BigInt(taxBps) + 5000n) / 10000n);
  return { subtotal, discount, tax, total: subtotal + tax };
}
export function ean13Valid(v: string) {
  if (!/^\d{13}$/.test(v)) return false;
  const d = v.split('').map(Number);
  const sum = d.slice(0, 12).reduce((a, x, i) => a + x * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === d[12];
}
function invoiced(store: BusinessStore, invoiceId: string, productId: string) {
  const inv = store.invoices().find((i) => i.id === invoiceId);
  if (!inv) throw new BusinessError('Invoice not found', 422);
  const line = inv.payload.lines.find((l) => l.productId === productId);
  if (!line) throw new BusinessError('That product is not on this invoice', 422);
  return line;
}

const BASE_HOOKS: Record<string, Hooks> = {
  'orders.pos-terminal': {
    validate: (store, d) => { const p = productById(store, s(d.productId)); if (p.stock < n(d.quantity)) throw new BusinessError(`Insufficient stock: ${p.name} has ${p.stock}`, 409); },
    transition: (store, r, t) => {
      if (t !== 'submit') return;
      const order = store.draft({ customerId: r.data.customerId, channel: 'walk_in', lines: [{ productId: r.data.productId, quantity: r.data.quantity }] });
      return { data: { orderId: order.id } };
    },
    compute: (store, r) => { const p = store.products().find((x) => x.id === r.data.productId); return { Total: p ? formatMoney(lineTotal(p.price, n(r.data.quantity), p.taxBps).total) : 'product missing', ...(r.data.orderId ? { 'Order draft': s(r.data.orderId).slice(0, 8) } : {}) }; },
    stats: (_s, recs) => [{ label: 'Open', value: count(recs, 'open') }, { label: 'Submitted', value: count(recs, 'submitted') }],
  },
  'orders.returns-and-refunds': {
    validate: (store, d, existing) => {
      const line = invoiced(store, s(d.invoiceId), s(d.productId));
      const prior = records(store, 'orders.returns-and-refunds').filter((r) => r.id !== existing?.id && r.status !== 'rejected' && r.data.invoiceId === d.invoiceId && r.data.productId === d.productId).reduce((a, r) => a + n(r.data.quantity), 0);
      if (n(d.quantity) + prior > line.quantity) throw new BusinessError(`Only ${line.quantity - prior} of ${line.quantity} invoiced units remain returnable`, 422);
    },
    transition: (store, r, t, input) => {
      const line = invoiced(store, s(r.data.invoiceId), s(r.data.productId));
      if (t === 'receive' && r.data.restock) store.moveStock({ productId: s(r.data.productId), locationId: null, quantity: n(r.data.quantity), reason: 'return', ref: r.id, affectsTotal: true });
      if (t === 'refund') return { data: { refundReference: input.refundReference, refundAmount: Math.round(line.total * n(r.data.quantity) / line.quantity) } };
    },
    compute: (store, r) => { try { const l = invoiced(store, s(r.data.invoiceId), s(r.data.productId)); return { 'Refund value': formatMoney(r.data.refundAmount !== undefined ? n(r.data.refundAmount) : Math.round(l.total * n(r.data.quantity) / l.quantity)) }; } catch { return { 'Refund value': 'invoice missing' }; } },
    stats: (_s, recs) => [{ label: 'Awaiting decision', value: count(recs, 'requested') }, { label: 'Refunded', value: formatMoney(recs.reduce((a, r) => a + n(r.data.refundAmount), 0)) }],
  },
  'orders.gift-cards-and-credits': {
    unique: ['code'],
    validate: (_s, d) => ({ balance: d.amount }),
    transition: (_s, r, t, input) => {
      if (r.data.expiresOn && s(r.data.expiresOn) < today()) throw new BusinessError('This credit has expired', 409);
      if (t !== 'redeem') return;
      const amt = n(input.redeemAmount), bal = n(r.data.balance);
      if (amt > bal) throw new BusinessError(`Redeem amount exceeds balance ${formatMoney(bal)}`, 422);
      return { status: bal - amt === 0 ? 'exhausted' : 'active', data: { balance: bal - amt } };
    },
    compute: (_s, r) => ({ Balance: formatMoney(n(r.data.balance)), ...(r.data.expiresOn && s(r.data.expiresOn) < today() ? { Expired: 'yes' } : {}) }),
    stats: (_s, recs) => [{ label: 'Outstanding liability', value: formatMoney(recs.filter((r) => r.status === 'active').reduce((a, r) => a + n(r.data.balance), 0)) }],
  },
  'orders.b2b-quote-cpq': {
    validate: (_s, d, existing) => { if (!existing && s(d.validUntil) < today()) throw new BusinessError('Valid-until date is in the past', 422); },
    transition: (_s, r, t) => { if ((t === 'accept' || t === 'send') && s(r.data.validUntil) < today()) throw new BusinessError('Quote has expired; edit is closed, create a new quote', 409); },
    compute: (store, r) => {
      const p = store.products().find((x) => x.id === r.data.productId);
      if (!p) return { Total: 'product missing' };
      const t = lineTotal(p.price, n(r.data.quantity), p.taxBps, n(r.data.discountBps));
      return { Subtotal: formatMoney(t.subtotal), Discount: formatMoney(t.discount), Tax: formatMoney(t.tax), Total: formatMoney(t.total), ...(s(r.data.validUntil) < today() && ['draft', 'sent'].includes(r.status) ? { Expired: 'yes' } : {}) };
    },
    stats: (_s, recs) => [{ label: 'Sent', value: count(recs, 'sent') }, { label: 'Accepted', value: count(recs, 'accepted') }],
  },
  'orders.pre-order-and-waitlist': {
    transition: (store, r, t) => { if (t === 'fulfil') { const p = productById(store, s(r.data.productId)); if (p.stock < n(r.data.quantity)) throw new BusinessError(`Not enough stock to fulfil: ${p.stock} available`, 409); } },
    compute: (store, r) => { const p = store.products().find((x) => x.id === r.data.productId); return { Availability: !p ? 'product missing' : p.stock >= n(r.data.quantity) ? `in stock (${p.stock})` : `short (${p.stock})` }; },
    stats: (store, recs) => [{ label: 'Waiting', value: count(recs, 'waiting') }, { label: 'Now fulfillable', value: String(recs.filter((r) => ['waiting', 'notified'].includes(r.status) && (store.products().find((p) => p.id === r.data.productId)?.stock ?? 0) >= n(r.data.quantity)).length) }],
  },
  'stock.low-stock-alert': {
    unique: ['productId'],
    compute: (store, r) => { const p = store.products().find((x) => x.id === r.data.productId); return { Stock: p ? String(p.stock) : 'missing', Alert: !p ? '-' : r.status !== 'active' ? 'paused' : p.stock <= n(r.data.threshold) ? 'LOW' : 'ok' }; },
    stats: (store, recs) => [{ label: 'Low now', value: String(recs.filter((r) => r.status === 'active' && (store.products().find((p) => p.id === r.data.productId)?.stock ?? Infinity) <= n(r.data.threshold)).length) }],
  },
  'stock.warehouse-and-location-matrix': {
    unique: ['code'],
    transition: (store, r, t) => {
      if (t !== 'archive') return;
      const held = store.db.prepare('SELECT COALESCE(SUM(quantity),0) q FROM mb_stock_moves WHERE locationId=?').get(r.id) as { q: number };
      if (held.q !== 0) throw new BusinessError(`Location still holds ${held.q} units; transfer them out first`, 409);
    },
    compute: (store, r) => { const rows = store.db.prepare('SELECT productId, SUM(quantity) q FROM mb_stock_moves WHERE locationId=? GROUP BY productId HAVING q<>0').all(r.id) as { productId: string; q: number }[]; return { 'On hand': String(rows.reduce((a, x) => a + x.q, 0)), SKUs: String(rows.length) }; },
    stats: (store) => [{ label: 'Unassigned units', value: String(Math.max(0, store.products().reduce((a, p) => a + p.stock, 0) - (store.db.prepare('SELECT COALESCE(SUM(quantity),0) q FROM mb_stock_moves WHERE locationId IS NOT NULL').get() as { q: number }).q)) }],
  },
  'stock.barcode-and-qr-generator': {
    unique: ['value'],
    validate: (_s, d) => {
      const v = s(d.value);
      if (d.symbology === 'EAN-13' && !ean13Valid(v)) throw new BusinessError('EAN-13 must be 13 digits with a valid check digit', 422);
      if (d.symbology === 'Code128' && (!/^[\x20-\x7e]+$/.test(v) || v.length > 48)) throw new BusinessError('Code 128 accepts printable ASCII, max 48 characters', 422);
      if (d.symbology === 'QR' && v.length > 160) throw new BusinessError('QR payload max 160 characters here', 422);
    },
  },
  'stock.supplier-purchase-orders': {
    transition: (store, r, t) => { if (t === 'receive') store.moveStock({ productId: s(r.data.productId), locationId: s(r.data.locationId), quantity: n(r.data.quantity), reason: 'po_receipt', ref: r.id, affectsTotal: true }); },
    compute: (_s, r) => ({ Value: formatMoney(n(r.data.unitCost) * n(r.data.quantity)) }),
    stats: (_s, recs) => [{ label: 'Open POs', value: String(recs.filter((r) => ['draft', 'ordered'].includes(r.status)).length) }, { label: 'On order value', value: formatMoney(recs.filter((r) => r.status === 'ordered').reduce((a, r) => a + n(r.data.unitCost) * n(r.data.quantity), 0)) }],
  },
  'stock.variant-matrix': {
    unique: ['sku', 'productId+option+value'],
    validate: (store, d) => { if (store.products().some((p) => p.sku.toUpperCase() === s(d.sku))) throw new BusinessError('SKU already used by a catalogue product', 409); },
  },
  'stock.bundles-and-kits': {
    unique: ['name'],
    compute: (store, r) => {
      const lines = r.data.components as { productId: string; quantity: number }[];
      const ps = store.products();
      const build = Math.min(...lines.map((l) => Math.floor((ps.find((p) => p.id === l.productId)?.stock ?? 0) / l.quantity)));
      return { Buildable: String(build), Components: lines.map((l) => `${ps.find((p) => p.id === l.productId)?.sku ?? '?'} x${l.quantity}`).join(', ') };
    },
  },
  'stock.batch-and-expiry': {
    unique: ['productId+batch'],
    compute: (_s, r) => { const d = daysBetween(today(), s(r.data.expiresOn)); return { 'Days to expiry': String(d), Expiry: d < 0 ? 'EXPIRED' : d <= 30 ? 'within 30 days' : 'ok' }; },
    stats: (_s, recs) => [{ label: 'Expired, not disposed', value: String(recs.filter((r) => r.status !== 'disposed' && s(r.data.expiresOn) < today()).length) }],
  },
  'stock.serial-number-registry': { unique: ['productId+serial'], stats: (_s, recs) => [{ label: 'In stock', value: count(recs, 'in_stock') }, { label: 'Sold', value: count(recs, 'sold') }] },
  'stock.reorder-point-calculator': {
    unique: ['productId'],
    compute: (store, r) => { const rp = n(r.data.dailyUsage) * n(r.data.leadDays) + n(r.data.safetyStock); const p = store.products().find((x) => x.id === r.data.productId); return { 'Reorder point': String(rp), Stock: p ? String(p.stock) : 'missing', Action: p && p.stock <= rp ? 'REORDER NOW' : 'ok' }; },
  },
  'stock.inter-warehouse-transfer': {
    validate: (_s, d) => { if (d.fromId === d.toId) throw new BusinessError('Source and destination must differ', 422); },
    transition: (store, r, t) => {
      if (t === 'dispatch') store.moveStock({ productId: s(r.data.productId), locationId: s(r.data.fromId), quantity: -n(r.data.quantity), reason: 'transfer_out', ref: r.id, affectsTotal: false });
      if (t === 'receive') store.moveStock({ productId: s(r.data.productId), locationId: s(r.data.toId), quantity: n(r.data.quantity), reason: 'transfer_in', ref: r.id, affectsTotal: false });
    },
  },
  'stock.shrinkage-and-damage-ledger': {
    transition: (store, r, t) => {
      if (t !== 'post') return;
      const q = r.data.reason === 'count_found' ? n(r.data.quantity) : -n(r.data.quantity);
      store.moveStock({ productId: s(r.data.productId), locationId: r.data.locationId ? s(r.data.locationId) : null, quantity: q, reason: s(r.data.reason), ref: r.id, affectsTotal: true });
    },
    stats: (_s, recs) => [{ label: 'Units written off', value: String(recs.filter((r) => r.status === 'posted' && r.data.reason !== 'count_found').reduce((a, r) => a + n(r.data.quantity), 0)) }],
  },
};
export const HOOKS: Record<string, Hooks> = { ...BASE_HOOKS, ...MONEY_HOOKS };
