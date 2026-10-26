import { createHash } from 'node:crypto';
import { BusinessError, type BusinessStore } from '../store';
import { formatMoney, type ModuleRecord } from './types';
import type { Hooks } from './hooks';
import { productById, records, today } from './engine';
/** Effects and guards for slice 9a DB-only modules (catalog-db.ts). */
const n = (v: unknown) => Number(v ?? 0);
const s = (v: unknown) => String(v ?? '');
const half = (a: number, bps: number) => Number((BigInt(a) * BigInt(bps) + 5000n) / 10000n);
const count = (recs: ModuleRecord[], st: string) => String(recs.filter((r) => r.status === st).length);
const addDays = (d: string, k: number) => new Date(Date.parse(`${d}T00:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10);
const hex = /^#[0-9a-fA-F]{6}$/;
export function gstSplit(taxable: number, rateBps: number, intra: boolean) {
  const tax = half(taxable, rateBps);
  if (!intra) return { cgst: 0, sgst: 0, igst: tax, total: taxable + tax };
  const cgst = Math.floor(tax / 2);
  return { cgst, sgst: tax - cgst, igst: 0, total: taxable + tax };
}
/** Stable bucket 0..9999 from FNV-1a of experiment+visitor. */
export function bucket(key: string) { let h = 0x811c9dc5; for (const c of Buffer.from(key)) { h ^= c; h = Math.imul(h, 0x01000193) >>> 0; } return h % 10000; }
export function vcard(d: Record<string, unknown>) {
  const esc = (v: unknown) => s(v).replace(/([,;\\])/g, '\\$1');
  return ['BEGIN:VCARD', 'VERSION:3.0', `FN:${esc(d.name)}`, `TITLE:${esc(d.title)}`, `ORG:${esc(d.company)}`, `EMAIL:${esc(d.email)}`, `TEL:${esc(d.phone)}`, ...(d.website ? [`URL:${s(d.website)}`] : []), 'END:VCARD'].join('\n');
}
function nextDue(start: string, every: number, from = today()) {
  if (start >= from) return start;
  const k = Math.ceil((Date.parse(`${from}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 / every);
  return addDays(start, k * every);
}
const invoicesWith = (store: BusinessStore, ids: string[]) => store.invoices().filter((i) => ids.every((id) => i.payload.lines.some((l) => l.productId === id)));
const parseDef = (def: string) => def.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [label, type] = l.split(':').map((x) => x.trim()); return { label, type }; });

export const DB_HOOKS: Record<string, Hooks> = {
  'orders.subscription-scheduler': {
    validate: (_s, d, ex) => ({ nextDue: ex?.data.nextDue && ex.data.startDate === d.startDate ? ex.data.nextDue : nextDue(s(d.startDate), n(d.intervalDays)), runs: n(ex?.data.runs) }),
    transition: (store, r, t) => {
      if (t !== 'run') return;
      const order = store.draft({ customerId: r.data.customerId, channel: 'walk_in', lines: [{ productId: r.data.productId, quantity: r.data.quantity }] });
      return { data: { lastOrderId: order.id, runs: n(r.data.runs) + 1, nextDue: addDays(s(r.data.nextDue), n(r.data.intervalDays)) } };
    },
    stats: (_s, recs) => [{ label: 'Active', value: count(recs, 'active') }, { label: 'Due today or overdue', value: String(recs.filter((r) => r.status === 'active' && s(r.data.nextDue) <= today()).length) }],
  },
  'orders.interaction-scoring': {
    stats: (store, recs) => { const by = new Map<string, number>(); for (const r of recs) if (r.status === 'active') by.set(s(r.data.customerId), (by.get(s(r.data.customerId)) ?? 0) + n(r.data.weight)); const top = [...by].sort((a, b) => b[1] - a[1])[0]; const name = top && store.customers().find((c) => c.id === top[0])?.name; return [{ label: 'Customers scored', value: String(by.size) }, { label: 'Top', value: top ? `${name ?? 'unknown'} (${top[1]})` : 'none' }]; },
  },
  'orders.poi-location-directory': { unique: ['name'] },
  'orders.wholesale-contract-ledger': {
    unique: ['reference'],
    validate: (_s, d, ex) => { if (s(d.endDate) < s(d.startDate)) throw new BusinessError('End must be on or after start', 422); const drawn = n(ex?.data.drawn); if (n(d.value) < drawn) throw new BusinessError(`Value cannot drop below the ${formatMoney(drawn)} already drawn`, 422); return { drawn }; },
    transition: (_s, r, t, i) => { if (t !== 'drawdown') return; const left = n(r.data.value) - n(r.data.drawn); if (n(i.amount) > left) throw new BusinessError(`Only ${formatMoney(left)} remains on this contract`, 422); return { data: { drawn: n(r.data.drawn) + n(i.amount) } }; },
    compute: (_s, r) => ({ Remaining: formatMoney(n(r.data.value) - n(r.data.drawn)) }),
  },
  'orders.attribution-mapper': {
    unique: ['invoiceId'],
    stats: (store, recs) => { const by = new Map<string, number>(); for (const r of recs.filter((x) => x.status === 'active')) { const inv = store.invoices().find((i) => i.id === r.data.invoiceId); by.set(s(r.data.source), (by.get(s(r.data.source)) ?? 0) + (inv?.payload.total ?? 0)); } return [...by].map(([k, v]) => ({ label: k, value: formatMoney(v) })); },
  },
  'orders.risk-pre-screen': {
    validate: (_s, d) => { const fails = [!d.addressVerified, !d.phoneVerified, !d.priorPaidInvoice].filter(Boolean).length + (n(d.orderValue) >= 5_000_000 ? 1 : 0); return { risk: `${fails >= 2 ? 'high' : fails === 1 ? 'medium' : 'low'} (${fails} failed)` }; },
  },
  'money.gst-billing-engine': {
    compute: (_s, r) => { const g = gstSplit(n(r.data.taxable), n(r.data.rateBps), r.data.supplierState === r.data.placeOfSupply); return { CGST: formatMoney(g.cgst), SGST: formatMoney(g.sgst), IGST: formatMoney(g.igst), Total: formatMoney(g.total) }; },
  },
  'money.tcs-and-tax-collected': {
    unique: ['invoiceId'],
    validate: (store, d) => { const inv = store.invoices().find((i) => i.id === d.invoiceId); if (!inv) throw new BusinessError('Invoice not found', 422); return { base: inv.payload.total, tcs: half(inv.payload.total, n(d.rateBps)) }; },
    stats: (_s, recs) => [{ label: 'TCS recorded', value: formatMoney(recs.filter((r) => r.status !== 'void').reduce((a, r) => a + n(r.data.tcs), 0)) }, { label: 'Deposited', value: count(recs, 'deposited') }],
  },
  'talk.chat-bot-builder': {
    unique: ['name'],
    transition: (store, r, t, i) => {
      if (t !== 'test') return;
      const msg = s(i.sample).toLowerCase();
      const hit = records(store, 'talk.chat-bot-builder').find((x) => x.status === 'published' && s(x.data.keywords).split(',').map((k) => k.trim().toLowerCase()).filter(Boolean).some((k) => msg.includes(k)));
      return { data: { lastTest: hit ? `"${s(i.sample).slice(0, 40)}" -> ${s(hit.data.name)}` : `"${s(i.sample).slice(0, 40)}" -> no published flow matches` } };
    },
  },
  'talk.auto-responder': { validate: (_s, d) => { if (n(d.fromMinute) === n(d.toMinute)) throw new BusinessError('From and to must differ', 422); } },
  'talk.bot-to-human-handover': { stats: (_s, recs) => [{ label: 'Waiting', value: count(recs, 'waiting') }, { label: 'Assigned', value: count(recs, 'assigned') }] },
  'talk.csat-survey': {
    validate: (_s, d) => { if (s(d.on) > today()) throw new BusinessError('Date cannot be in the future', 422); },
    stats: (_s, recs) => { const a = recs.filter((r) => r.status === 'active'); return [{ label: 'Responses', value: String(a.length) }, { label: 'CSAT', value: a.length ? `${Math.round((a.filter((r) => n(r.data.score) >= 4).length * 100) / a.length)}%` : 'no responses' }]; },
  },
  'talk.spam-filter': {
    unique: ['kind+value'],
    transition: (store, r, t, i) => { if (t !== 'check') return; const txt = s(i.sample).toLowerCase(); const hit = records(store, 'talk.spam-filter').filter((x) => x.status === 'active').find((x) => txt.includes(s(x.data.value).toLowerCase())); return { data: { lastCheck: hit ? `spam (matches "${s(hit.data.value)}")` : 'not spam' } }; },
  },
  'talk.sentiment-monitor': { stats: (_s, recs) => { const a = recs.filter((r) => r.status === 'active'); const c = (v: string) => a.filter((r) => r.data.sentiment === v).length; return [{ label: 'Positive', value: String(c('positive')) }, { label: 'Negative', value: String(c('negative')) }, { label: 'Net', value: String(c('positive') - c('negative')) }]; } },
  'talk.reviews-collector': { stats: (_s, recs) => { const a = recs.filter((r) => r.status === 'approved'); return [{ label: 'Approved', value: String(a.length) }, { label: 'Average', value: a.length ? (a.reduce((x, r) => x + n(r.data.rating), 0) / a.length).toFixed(2) : 'none' }]; } },
  'stock.bom-configurator': {
    validate: (_s, d) => { if ((d.components as { productId: string }[]).some((l) => l.productId === d.productId)) throw new BusinessError('A product cannot be its own component', 422); },
    compute: (store, r): Record<string, string> => { const ls = r.data.components as { productId: string; quantity: number }[]; const ps = ls.map((l) => ({ l, p: store.products().find((x) => x.id === l.productId) })); if (ps.some((x) => !x.p)) return { Cost: 'component missing' }; return { 'Cost at catalog price': formatMoney(ps.reduce((a, x) => a + x.p!.price * x.l.quantity, 0)), 'Buildable from stock': String(Math.min(...ps.map((x) => Math.floor(x.p!.stock / x.l.quantity)))) }; },
  },
  'stock.consignment-manager': {
    validate: (_s, d, ex) => { const sold = n(ex?.data.sold); if (n(d.quantityIn) < sold) throw new BusinessError(`Already sold ${sold}`, 422); return { sold }; },
    transition: (_s, r, t, i) => { if (t !== 'sell') return; const left = n(r.data.quantityIn) - n(r.data.sold); if (n(i.quantity) > left) throw new BusinessError(`Only ${left} consigned units remain`, 422); return { data: { sold: n(r.data.sold) + n(i.quantity) } }; },
    compute: (store, r): Record<string, string> => { const p = store.products().find((x) => x.id === r.data.productId); if (!p) return { Payable: 'product missing' }; const gross = p.price * n(r.data.sold); return { 'Payable to consignor': formatMoney(gross - half(gross, n(r.data.commissionBps))) }; },
  },
  'stock.pod-asset-matcher': { unique: ['productId+printArea'] },
  'stock.rma-stock-isolator': {
    transition: (store, r, t) => { if (t === 'restock') store.moveStock({ productId: s(r.data.productId), locationId: null, quantity: n(r.data.quantity), reason: 'rma_restock', ref: r.id, affectsTotal: true }); },
    stats: (_s, recs) => [{ label: 'Units in quarantine', value: String(recs.filter((r) => r.status === 'quarantined').reduce((a, r) => a + n(r.data.quantity), 0)) }],
  },
  'growth.online-store-builder': { unique: ['slug'] },
  'growth.website-builder': { unique: ['slug'] },
  'growth.seo-and-content': {
    unique: ['url'],
    compute: (_s, r) => ({ 'Title length': `${s(r.data.title).length}/60${s(r.data.title).length > 60 ? ' (too long)' : ''}`, 'Description length': `${s(r.data.description).length}/160${s(r.data.description).length > 160 ? ' (too long)' : ''}` }),
  },
  'growth.referrals-and-loyalty': {
    unique: ['code', 'customerId'],
    validate: (_s, _d, ex) => ({ points: n(ex?.data.points) }),
    transition: (_s, r, t, i) => { if (t === 'earn') return { data: { points: n(r.data.points) + n(i.points) } }; if (t === 'redeem') { if (n(i.points) > n(r.data.points)) throw new BusinessError(`Only ${n(r.data.points)} points available`, 422); return { data: { points: n(r.data.points) - n(i.points) } }; } },
  },
  'growth.audience-builder': {
    compute: (store, r) => { const by = new Map<string, { c: number; t: number }>(); for (const i of store.invoices()) { const k = i.payload.customer.id; const v = by.get(k) ?? { c: 0, t: 0 }; by.set(k, { c: v.c + 1, t: v.t + i.payload.total }); } return { 'Matching customers': String([...by.values()].filter((v) => v.c >= n(r.data.minInvoices) && v.t >= n(r.data.minSpend)).length) }; },
  },
  'growth.landing-page-builder': { unique: ['slug'] },
  'growth.trend-spotter': { unique: ['topic'], stats: (_s, recs) => recs.filter((r) => r.status === 'active').sort((a, b) => n(b.data.interest) - n(a.data.interest)).slice(0, 3).map((r, i) => ({ label: `#${i + 1}`, value: `${s(r.data.topic)} (${n(r.data.interest)})` })) },
  'growth.a-b-variant-dispatcher': {
    unique: ['name'],
    transition: (_s, r, t, i) => { if (t !== 'assign') return; const b = bucket(`${r.id}:${s(i.visitor)}`); return { data: { lastAssignment: `${s(i.visitor)} -> ${b < n(r.data.splitBps) ? 'B' : 'A'} (bucket ${b})` } }; },
  },
  'operations.file-approvals': { validate: (_s, d) => ({ sha256: createHash('sha256').update(s(d.content), 'utf8').digest('hex') }), compute: (_s, r) => ({ sha256: s(r.data.sha256).slice(0, 16) + '...' }) },
  'operations.automation-library': { unique: ['name'] },
  'builder.media-and-assets-gallery': { validate: (_s, d) => { if (d.type === 'image' && !d.alt) throw new BusinessError('Alt text is required for images', 422); } },
  'builder.content-block-studio': { unique: ['key'] },
  'builder.form-and-intake-constructor': {
    validate: (_s, d) => { const fs = parseDef(s(d.definition)); if (!fs.length || fs.some((x) => !x.label || !['text', 'email', 'int'].includes(x.type))) throw new BusinessError('Each line must be label:text, label:email or label:int', 422); },
    transition: (_s, r, t, i) => {
      if (t !== 'test') return;
      const vals = Object.fromEntries(s(i.sample).split('\n').map((l) => l.split('=')).filter((p) => p.length >= 2).map(([k, ...v]) => [k.trim(), v.join('=').trim()]));
      const errs = parseDef(s(r.data.definition)).flatMap(({ label, type }) => { const v = vals[label]; if (!v) return [`${label} missing`]; if (type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return [`${label} not an email`]; if (type === 'int' && !/^-?\d+$/.test(v)) return [`${label} not a whole number`]; return []; });
      return { data: { lastTest: errs.length ? `invalid: ${errs.join(', ')}` : 'valid' } };
    },
  },
  'builder.asset-transform-pipeline': { unique: ['name'] },
  'builder.deep-linking-registry': { unique: ['code'] },
  'builder.localization-matrix': {
    unique: ['key+locale'],
    stats: (_s, recs) => { const a = recs.filter((r) => r.status === 'active'); const keys = new Set(a.map((r) => r.data.key)); const loc = [...new Set(a.map((r) => s(r.data.locale)))]; return loc.map((l) => ({ label: l, value: `${a.filter((r) => r.data.locale === l).length}/${keys.size} keys` })); },
  },
  'builder.design-token-exporter': {
    unique: ['name'],
    compute: (store, r) => ({ CSS: records(store, 'builder.design-system-tokens').filter((t) => t.status === 'active').map((t) => `--${s(r.data.prefix).toLowerCase()}-${s(t.data.name).toLowerCase()}: ${s(t.data.value)};`).join(' ') || 'no active tokens' }),
  },
  'builder.app-builder-and-pwa-wrapper': {
    validate: (_s, d) => { if (!hex.test(s(d.themeColor)) || !hex.test(s(d.backgroundColor))) throw new BusinessError('Colours must be #rrggbb', 422); if (!s(d.startUrl).startsWith('/')) throw new BusinessError('Start URL must be a path starting with /', 422); },
    compute: (_s, r) => ({ Manifest: JSON.stringify({ name: r.data.name, short_name: r.data.shortName, start_url: r.data.startUrl, display: 'standalone', theme_color: r.data.themeColor, background_color: r.data.backgroundColor }) }),
  },
  'builder.design-system-tokens': {
    unique: ['name'],
    validate: (_s, d) => { const v = s(d.value); const ok = d.kind === 'color' ? hex.test(v) : d.kind === 'font' ? v.length > 0 : /^\d+(\.\d+)?(px|rem|em|%)$/.test(v); if (!ok) throw new BusinessError(d.kind === 'color' ? 'Colour must be #rrggbb' : d.kind === 'font' ? 'Font required' : 'Use a CSS length like 8px or 0.5rem', 422); },
  },
  'builder.ugc-store-gallery': { validate: (_s, d) => { if (!d.consent) throw new BusinessError('Author consent is required', 422); } },
  'brain.evaluation-harness': {
    transition: (_s, r, t, i) => { if (t !== 'score') return; const a = s(i.answer).trim().toLowerCase(), e = s(r.data.expected).trim().toLowerCase(); const pass = r.data.mode === 'exact' ? a === e : a.includes(e); return { data: { lastResult: `${pass ? 'pass' : 'fail'} on ${today()}` } }; },
    stats: (_s, recs) => [{ label: 'Passing', value: String(recs.filter((r) => s(r.data.lastResult).startsWith('pass')).length) }, { label: 'Failing', value: String(recs.filter((r) => s(r.data.lastResult).startsWith('fail')).length) }],
  },
  'brain.system-cards-publisher': { unique: ['name'] },
  'brain.recommendations': {
    unique: ['productId+otherId'],
    validate: (_s, d) => { if (d.productId === d.otherId) throw new BusinessError('Pick two different products', 422); },
    compute: (store, r) => ({ 'Invoices with both': String(invoicesWith(store, [s(r.data.productId), s(r.data.otherId)]).length) }),
  },
  'brain.forecasting': {
    compute: (store, r) => {
      const w = n(r.data.windowDays), since = addDays(today(), -w);
      const units = store.invoices().filter((i) => i.createdAt.slice(0, 10) > since).flatMap((i) => i.payload.lines).filter((l) => l.productId === r.data.productId).reduce((a, l) => a + l.quantity, 0);
      const p = store.products().find((x) => x.id === r.data.productId);
      const perDay = units / w;
      return { [`Units in last ${w}d`]: String(units), 'Avg per day': perDay.toFixed(2), 'Days of stock': p ? (perDay ? (p.stock / perDay).toFixed(1) : 'no sales') : 'product missing' };
    },
  },
  'brain.anomaly-detector': {
    compute: (store, r) => {
      const t = store.invoices().map((i) => ({ num: i.number, v: i.payload.total }));
      if (t.length < 3) return { Flagged: `needs 3+ invoices (have ${t.length})` };
      const mean = t.reduce((a, x) => a + x.v, 0) / t.length, sd = Math.sqrt(t.reduce((a, x) => a + (x.v - mean) ** 2, 0) / t.length);
      const hits = sd ? t.filter((x) => Math.abs(x.v - mean) / sd > n(r.data.sigma) / 10) : [];
      return { Flagged: hits.length ? hits.map((x) => x.num).join(', ') : 'none' };
    },
  },
  'foundation.business-card-studio': { compute: (_s, r) => ({ vCard: vcard(r.data) }) },
  'foundation.aml-transaction-monitor': { compute: (store, r) => { const hits = store.invoices().filter((i) => i.payload.total >= n(r.data.threshold)); return { Hits: String(hits.length), Invoices: hits.slice(0, 5).map((i) => i.number).join(', ') || 'none' }; } },
  'foundation.customs-and-tariff-hsn-engine': { unique: ['hsn'], validate: (_s, d) => { if (!/^(\d{4}|\d{6}|\d{8})$/.test(s(d.hsn))) throw new BusinessError('HSN/SAC must be 4, 6 or 8 digits', 422); } },
};
