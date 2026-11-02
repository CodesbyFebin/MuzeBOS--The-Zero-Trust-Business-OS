/**
 * Business analytics computed only from local records (issued invoices and order drafts).
 * Every metric has a written definition below; nothing is estimated or sampled.
 * Amounts are integer minor units (paise).
 */
import type { Invoice, Order, OrderChannel } from './store';

export const METRIC_DEFINITIONS = {
  issuedRevenue: 'Sum of totals (incl. tax) of invoices issued in the range. Issued is not the same as paid.',
  settledRevenue: 'Sum of totals of invoices in the range marked manually reconciled. Not provider-verified.',
  outstanding: 'Issued revenue minus settled revenue for invoices in the range.',
  invoices: 'Number of invoices issued in the range.',
  aov: 'Average order value: issued revenue divided by invoices issued, rounded half-up to the paisa. Unavailable with no invoices.',
  orders: 'Order drafts created in the range, by status (awaiting review, issued, rejected, expired).',
  conversion: 'Share of order drafts created in the range that were issued. Unavailable with no drafts.',
  channels: 'Invoices in the range grouped by the channel recorded on their order (manual if not recorded).',
} as const;

export const UNAVAILABLE = [
  { metric: 'Profit', missing: ['Cost of goods per product (products only store a sale price)', 'Operating expenses (no expense records exist)'] },
  { metric: 'ROAS', missing: ['Ad spend per campaign (no ad account is connected)', 'Attribution of orders to campaigns (orders record a channel, not a campaign)'] },
  { metric: 'Cash flow', missing: ['Outgoing payments and expenses', 'Provider-verified settlement dates (settlement is recorded manually without a date of receipt)'] },
] as const;

export type Range = { from: string | null; to: string | null };
export type MonthPoint = { month: string; issuedRevenue: number; invoices: number };
export type ChannelPoint = { channel: OrderChannel; invoices: number; issuedRevenue: number; share: number };
export type Analytics = {
  range: Range; tzOffsetMinutes: number;
  kpis: { issuedRevenue: number; settledRevenue: number; outstanding: number; invoices: number; aov: number | null; conversion: number | null };
  orders: { total: number; awaiting_review: number; issued: number; rejected: number; expired: number };
  monthly: MonthPoint[]; channels: ChannelPoint[];
  unavailable: typeof UNAVAILABLE; definitions: typeof METRIC_DEFINITIONS; empty: boolean;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Local calendar day (YYYY-MM-DD) of an instant for a UTC offset in minutes (e.g. +330 for IST). */
export const localDate = (iso: string, tz: number) => new Date(Date.parse(iso) + tz * 60_000).toISOString().slice(0, 10);
export const inRange = (iso: string, r: Range, tz: number) => { const d = localDate(iso, tz); return (!r.from || d >= r.from) && (!r.to || d <= r.to); };
export function parseRange(from: string | null, to: string | null): Range {
  const f = from && DAY.test(from) ? from : null; const t = to && DAY.test(to) ? to : null;
  if (f && t && f > t) throw new RangeError('Start date is after end date');
  return { from: f, to: t };
}
/** Half-up integer division for non-negative integers. */
export const divHalfUp = (a: number, b: number) => Number((2n * BigInt(a) + BigInt(b)) / (2n * BigInt(b)));
function months(first: string, last: string) {
  const out: string[] = []; let [y, m] = first.split('-').map(Number); const [ly, lm] = last.split('-').map(Number);
  while (y < ly || (y === ly && m <= lm)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}

export function computeAnalytics(invoicesAll: Invoice[], ordersAll: Order[], range: Range, tz = 0, now = new Date()): Analytics {
  const invoices = invoicesAll.filter((i) => inRange(i.createdAt, range, tz));
  const orders = ordersAll.filter((o) => inRange(o.createdAt, range, tz));
  const channelOf = new Map(ordersAll.map((o) => [o.id, (o.channel ?? 'manual') as OrderChannel]));
  const issuedRevenue = invoices.reduce((s, i) => s + i.payload.total, 0);
  const settledRevenue = invoices.filter((i) => i.payment === 'manually_reconciled').reduce((s, i) => s + i.payload.total, 0);
  const counts = { total: orders.length, awaiting_review: 0, issued: 0, rejected: 0, expired: 0 };
  for (const o of orders) {
    if (o.status === 'awaiting_review' && Date.parse(o.expiresAt) <= now.getTime()) counts.expired++;
    else if (o.status in counts) counts[o.status as 'awaiting_review' | 'issued' | 'rejected']++;
  }
  const byMonth = new Map<string, MonthPoint>();
  for (const i of invoices) { const m = localDate(i.createdAt, tz).slice(0, 7); const p = byMonth.get(m) ?? { month: m, issuedRevenue: 0, invoices: 0 }; p.issuedRevenue += i.payload.total; p.invoices++; byMonth.set(m, p); }
  let monthly: MonthPoint[] = [];
  const keys = [...byMonth.keys()].sort();
  const first = range.from?.slice(0, 7) ?? keys[0]; const last = range.to?.slice(0, 7) ?? (keys.length ? localDate(now.toISOString(), tz).slice(0, 7) : undefined);
  if (first && last && first <= last) { const span = months(first, last); monthly = (span.length > 36 ? span.slice(-36) : span).map((m) => byMonth.get(m) ?? { month: m, issuedRevenue: 0, invoices: 0 }); }
  const byChannel = new Map<OrderChannel, ChannelPoint>();
  for (const i of invoices) { const c = channelOf.get(i.orderId) ?? 'manual'; const p = byChannel.get(c) ?? { channel: c, invoices: 0, issuedRevenue: 0, share: 0 }; p.invoices++; p.issuedRevenue += i.payload.total; byChannel.set(c, p); }
  const channels = [...byChannel.values()].map((p) => ({ ...p, share: invoices.length ? p.invoices / invoices.length : 0 })).sort((a, b) => b.issuedRevenue - a.issuedRevenue || a.channel.localeCompare(b.channel));
  return {
    range, tzOffsetMinutes: tz,
    kpis: { issuedRevenue, settledRevenue, outstanding: issuedRevenue - settledRevenue, invoices: invoices.length, aov: invoices.length ? divHalfUp(issuedRevenue, invoices.length) : null, conversion: orders.length ? counts.issued / orders.length : null },
    orders: counts, monthly, channels, unavailable: UNAVAILABLE, definitions: METRIC_DEFINITIONS, empty: invoices.length === 0 && orders.length === 0,
  };
}

const csvCell = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };
const rupees = (minor: number) => (minor / 100).toFixed(2);
/** Invoice-level CSV for the range. Formula-leading cells are neutralised. */
export function analyticsCsv(invoicesAll: Invoice[], ordersAll: Order[], range: Range, tz = 0) {
  const channelOf = new Map(ordersAll.map((o) => [o.id, o.channel ?? 'manual']));
  const rows = invoicesAll.filter((i) => inRange(i.createdAt, range, tz)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((i) => [i.number, localDate(i.createdAt, tz), i.payload.customer.name, channelOf.get(i.orderId) ?? 'manual', rupees(i.payload.subtotal), rupees(i.payload.tax), rupees(i.payload.total), i.payment]);
  return [['invoice', 'date', 'customer', 'channel', 'subtotal_inr', 'tax_inr', 'total_inr', 'payment'], ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
