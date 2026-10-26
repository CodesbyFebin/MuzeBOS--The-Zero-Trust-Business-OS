import { createHash } from 'node:crypto';
import { BusinessError } from '../store';
import { formatMoney } from './types';
import { today } from './engine';
import type { Hooks } from './hooks';

const n = (v: unknown) => Number(v ?? 0);
const s = (v: unknown) => String(v ?? '');
const slugish = (v: unknown, label: string) => { const x = s(v).trim().toLowerCase().replace(/\s+/g, '_'); if (!/^[a-z0-9][a-z0-9._-]*$/.test(x)) throw new BusinessError(`${label}: letters, digits, dot, dash or underscore only`, 422); return x; };

/** Placeholders must be exactly {{1}}..{{n}} with none skipped. Returns n. */
export function placeholderCount(body: string): number {
  const nums = [...body.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)].map((m) => m[1]);
  for (const x of nums) if (!/^[1-9]\d*$/.test(x)) throw new BusinessError(`Placeholder {{${x}}} must be a number like {{1}}`, 422);
  const set = [...new Set(nums.map(Number))].sort((a, b) => a - b);
  set.forEach((v, i) => { if (v !== i + 1) throw new BusinessError(`Placeholders must be sequential from {{1}}; {{${i + 1}}} is missing`, 422); });
  return set.length;
}
/** Integer discount in paise, half-up for percentages, never above the order total. */
export function couponDiscount(kind: string, percentBps: number, amount: number, orderTotal: number): number {
  const d = kind === 'percent' ? Number((BigInt(orderTotal) * BigInt(percentBps) + 5000n) / 10000n) : amount;
  return Math.min(d, orderTotal);
}
/** Two-proportion z-score (pooled). */
export function zScore(av: number, ac: number, bv: number, bc: number): number {
  const p = (ac + bc) / (av + bv); const se = Math.sqrt(p * (1 - p) * (1 / av + 1 / bv));
  return se === 0 ? 0 : (bc / bv - ac / av) / se;
}
const pct = (c: number, v: number) => `${((c * 100) / v).toFixed(2)}%`;

export const GROWTH_HOOKS: Record<string, Hooks> = {
  'talk.template-manager': {
    unique: ['code+language'],
    validate: (_s, d) => ({ variables: placeholderCount(s(d.body)) }),
    transition: (_s, r, t) => (t === 'approve' ? { data: { sha256: createHash('sha256').update(s(r.data.body), 'utf8').digest('hex') } } : undefined),
    compute: (_s, r) => ({ Preview: s(r.data.body).replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, k) => `[sample ${k}]`).slice(0, 160) }),
    stats: (_s, recs) => [{ label: 'Approved locally', value: String(recs.filter((r) => r.status === 'approved').length) }],
  },
  'talk.canned-replies': {
    unique: ['shortcut'],
    compute: (_s, r) => { const len = [...s(r.data.body)].length; const gsm = /^[\x20-\x7E\n\r]*$/.test(s(r.data.body)); const per = gsm ? (len <= 160 ? 160 : 153) : (len <= 70 ? 70 : 67); return { Characters: String(len), 'SMS segments (est.)': `${Math.max(1, Math.ceil(len / per))}${gsm ? '' : ' (unicode)'}` }; },
  },
  'growth.content-calendar': {
    transition: (_s, r, t, input) => { if (t === 'publish' && !/^https:\/\//.test(s(input.publishedUrl))) throw new BusinessError('Published URL must be https', 422); },
    compute: (_s, r): Record<string, string> => (r.status === 'scheduled' && s(r.data.publishOn) < today() ? { Warning: 'Publish date has passed' } : {}),
    stats: (_s, recs) => [{ label: 'Scheduled', value: String(recs.filter((r) => r.status === 'scheduled').length) }, { label: 'Published', value: String(recs.filter((r) => r.status === 'published').length) }],
  },
  'growth.coupon-engine': {
    unique: ['code'],
    validate: (_s, d, existing) => {
      if (d.kind === 'percent' && (!d.percentBps || d.amount)) throw new BusinessError('A percent coupon needs Percent (bps) and no fixed amount', 422);
      if (d.kind === 'fixed' && (!d.amount || d.percentBps)) throw new BusinessError('A fixed coupon needs a fixed amount and no percent', 422);
      if (s(d.validTo) < s(d.validFrom)) throw new BusinessError('Valid to must be on or after valid from', 422);
      const used = n(existing?.data.redemptions);
      if (n(d.maxRedemptions) < used) throw new BusinessError(`Max redemptions cannot go below the ${used} already recorded`, 422);
      return existing ? {} : { redemptions: 0, discountGiven: 0 };
    },
    transition: (_s, r, t, input) => {
      if (t !== 'redeem') return;
      const d = today(), total = n(input.orderTotal);
      if (d < s(r.data.validFrom) || d > s(r.data.validTo)) throw new BusinessError(`Coupon is valid ${s(r.data.validFrom)} to ${s(r.data.validTo)}`, 409);
      if (n(r.data.redemptions) >= n(r.data.maxRedemptions)) throw new BusinessError('Redemption limit reached', 409);
      if (total < n(r.data.minOrder)) throw new BusinessError(`Order total is below the minimum of ${formatMoney(n(r.data.minOrder))}`, 422);
      const disc = couponDiscount(s(r.data.kind), n(r.data.percentBps), n(r.data.amount), total);
      return { data: { redemptions: n(r.data.redemptions) + 1, discountGiven: n(r.data.discountGiven) + disc } };
    },
    compute: (_s, r) => ({ Value: r.data.kind === 'percent' ? `${(n(r.data.percentBps) / 100).toFixed(2)}%` : formatMoney(n(r.data.amount)), 'Discount on INR 1,000.00': formatMoney(couponDiscount(s(r.data.kind), n(r.data.percentBps), n(r.data.amount), 100000)), 'Given so far': formatMoney(n(r.data.discountGiven)), Window: today() < s(r.data.validFrom) ? 'not started' : today() > s(r.data.validTo) ? 'ended' : 'open' }),
    stats: (_s, recs) => [{ label: 'Redemptions', value: String(recs.reduce((a, r) => a + n(r.data.redemptions), 0)) }, { label: 'Discount given', value: formatMoney(recs.reduce((a, r) => a + n(r.data.discountGiven), 0)) }],
  },
  'growth.utm-tracker': {
    unique: ['baseUrl+source+medium+campaign+content'],
    validate: (_s, d) => {
      const out = { source: slugish(d.source, 'Source'), medium: slugish(d.medium, 'Medium'), campaign: slugish(d.campaign, 'Campaign'), ...(d.content ? { content: slugish(d.content, 'Content') } : {}) };
      const u = new URL(s(d.baseUrl));
      for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) u.searchParams.delete(k);
      u.searchParams.set('utm_source', out.source); u.searchParams.set('utm_medium', out.medium); u.searchParams.set('utm_campaign', out.campaign);
      if (out.content) u.searchParams.set('utm_content', out.content);
      return { ...out, url: u.toString() };
    },
    compute: (_s, r) => ({ 'Tagged URL': s(r.data.url) }),
  },
  'growth.growth-experiments': {
    transition: (_s, _r, t, i) => {
      if (t !== 'conclude') return;
      const [av, ac, bv, bc] = [n(i.aVisitors), n(i.aConversions), n(i.bVisitors), n(i.bConversions)];
      if (ac > av || bc > bv) throw new BusinessError('Conversions cannot exceed visitors', 422);
      const z = zScore(av, ac, bv, bc);
      const verdict = Math.abs(z) >= 1.96 ? (z > 0 ? 'B ahead' : 'A ahead') : 'inconclusive';
      return { data: { aVisitors: av, aConversions: ac, bVisitors: bv, bConversions: bc, result: `A ${pct(ac, av)} vs B ${pct(bc, bv)}, z=${z.toFixed(2)}: ${verdict}` } };
    },
  },
};
