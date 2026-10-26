import { afterEach, describe, expect, it } from 'vitest';
import { BusinessStore } from '@/lib/muzebos/store';
import { perform, view, today } from '@/lib/muzebos/modules/engine';
import { TALK_GROWTH_MODULES } from '@/lib/muzebos/modules/catalog-talk-growth';
import { couponDiscount, placeholderCount, zScore } from '@/lib/muzebos/modules/hooks-growth';
import { ALL_FEATURES, pageForSegments } from '@/lib/muzebos/registry';

const stores: BusinessStore[] = [];
afterEach(() => { while (stores.length) stores.pop()!.close(); });
const fresh = () => { const s = new BusinessStore(':memory:'); stores.push(s); return s; };
const create = (s: BusinessStore, m: string, data: Record<string, unknown>) => perform(s, m, { action: 'create', data });
const step = (s: BusinessStore, m: string, id: string, transition: string, input: Record<string, unknown> = {}) => {
  const r = s.db.prepare('SELECT version FROM mb_module_records WHERE id=?').get(id) as { version: number };
  return perform(s, m, { action: 'transition', id, version: r.version, transition, input });
};
const day = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

describe('batch (e) wiring', () => {
  it('six talk/growth modules are available pages; every one states that nothing is sent or posted', () => {
    expect(TALK_GROWTH_MODULES.map((m) => m.pillar).sort((a, b) => a! - b!)).toEqual([46, 55, 91, 92, 93, 99]);
    for (const m of TALK_GROWTH_MODULES) {
      const p = ALL_FEATURES.find((f) => f.id === m.id)!;
      expect(p.status, m.id).toBe('available');
      const [section, slug] = p.route.split('/').slice(2);
      expect(pageForSegments(section, slug)?.id).toBe(m.id);
      expect(m.limits.join(' ')).toMatch(/not sent|Nothing is sent|nothing is posted|not applied|no click tracking|no traffic/i);
      expect(Object.keys(m.transitions).join(' ')).not.toMatch(/send/i);
    }
  });
});

describe('talk', () => {
  it('template placeholders must be sequential numbers; approve hashes; code+language unique', () => {
    expect(placeholderCount('Hi {{1}}, order {{2}} ships {{1}}')).toBe(2);
    expect(() => placeholderCount('Hi {{2}}')).toThrow('{{1}} is missing');
    expect(() => placeholderCount('Hi {{name}}')).toThrow('must be a number');
    const s = fresh(); const m = 'talk.template-manager';
    const t = create(s, m, { code: 'order_ship', channel: 'whatsapp', language: 'en', body: 'Hi {{1}}, order {{2}} shipped' });
    expect(t.data.variables).toBe(2);
    expect(view(s, m).records[0].computed!.Preview).toBe('Hi [sample 1], order [sample 2] shipped');
    expect(() => create(s, m, { code: 'ORDER_SHIP', channel: 'sms', language: 'en', body: 'x' })).toThrow('already exists');
    create(s, m, { code: 'ORDER_SHIP', channel: 'sms', language: 'hi', body: 'x' });
    expect(step(s, m, t.id, 'approve').data.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(() => perform(s, m, { action: 'update', id: t.id, version: 2, data: { code: 'A', channel: 'sms', language: 'en', body: 'y' } })).toThrow('cannot be edited');
  });
  it('canned replies: unique shortcut and SMS segment estimate', () => {
    const s = fresh(); const m = 'talk.canned-replies';
    create(s, m, { shortcut: 'thanks', title: 'Thanks', body: 'x'.repeat(161) });
    expect(() => create(s, m, { shortcut: 'THANKS', title: 'T', body: 'y' })).toThrow('already exists');
    create(s, m, { shortcut: 'hi', title: 'Hi', body: 'नमस्ते' });
    const c = Object.fromEntries(view(s, m).records.map((r) => [r.data.shortcut, r.computed!['SMS segments (est.)']]));
    expect(c).toEqual({ THANKS: '2', HI: '1 (unicode)' });
  });
});

describe('growth', () => {
  it('content calendar publish requires an https URL and records it', () => {
    const s = fresh(); const m = 'growth.content-calendar';
    const c = create(s, m, { title: 'Reel', channel: 'instagram', publishOn: day(3) });
    expect(() => step(s, m, c.id, 'publish', { publishedUrl: 'https://x.com/p' })).toThrow('Cannot');
    step(s, m, c.id, 'schedule');
    expect(() => step(s, m, c.id, 'publish', { publishedUrl: 'http://x.com/p' })).toThrow('https');
    expect(step(s, m, c.id, 'publish', { publishedUrl: 'https://instagram.com/p/1' }).data.publishedUrl).toBe('https://instagram.com/p/1');
  });
  it('coupons: integer discounts, window, minimum, cap, and kind consistency', () => {
    expect(couponDiscount('percent', 1250, 0, 99999)).toBe(12500);
    expect(couponDiscount('percent', 333, 0, 150)).toBe(5);
    expect(couponDiscount('fixed', 0, 50000, 30000)).toBe(30000);
    const s = fresh(); const m = 'growth.coupon-engine';
    expect(() => create(s, m, { code: 'X', kind: 'percent', amount: 100, validFrom: today(), validTo: day(5), maxRedemptions: 1 })).toThrow('percent coupon');
    expect(() => create(s, m, { code: 'X', kind: 'fixed', amount: 100, validFrom: day(5), validTo: today(), maxRedemptions: 1 })).toThrow('on or after');
    const c = create(s, m, { code: 'diwali10', kind: 'percent', percentBps: 1000, minOrder: 50000, validFrom: today(), validTo: day(5), maxRedemptions: 2 });
    expect(c.data).toMatchObject({ code: 'DIWALI10', redemptions: 0 });
    expect(() => step(s, m, c.id, 'redeem', { orderTotal: 49999 })).toThrow('below the minimum');
    step(s, m, c.id, 'redeem', { orderTotal: 100005 }); const r2 = step(s, m, c.id, 'redeem', { orderTotal: 60000 });
    expect(r2.data).toMatchObject({ redemptions: 2, discountGiven: 10001 + 6000 });
    expect(() => step(s, m, c.id, 'redeem', { orderTotal: 60000 })).toThrow('limit reached');
    expect(() => perform(s, m, { action: 'update', id: c.id, version: 3, data: { code: 'DIWALI10', kind: 'percent', percentBps: 1000, validFrom: today(), validTo: day(5), maxRedemptions: 1 } })).toThrow('cannot go below');
    const f = create(s, m, { code: 'LATER', kind: 'fixed', amount: 100, validFrom: day(2), validTo: day(5), maxRedemptions: 1 });
    expect(() => step(s, m, f.id, 'redeem', { orderTotal: 1000 })).toThrow('valid');
  });
  it('UTM links are normalised, built with URL encoding and unique per combination', () => {
    const s = fresh(); const m = 'growth.utm-tracker';
    const u = create(s, m, { label: 'IG bio', baseUrl: 'https://shop.example/p?ref=1&utm_source=old', source: 'Instagram', medium: 'Social', campaign: 'Diwali Sale' });
    expect(u.data.url).toBe('https://shop.example/p?ref=1&utm_source=instagram&utm_medium=social&utm_campaign=diwali_sale');
    expect(() => create(s, m, { label: 'dup', baseUrl: 'https://shop.example/p?ref=1&utm_source=old', source: 'instagram', medium: 'social', campaign: 'diwali_sale' })).toThrow('already exists');
    expect(() => create(s, m, { label: 'bad', baseUrl: 'https://a.b', source: 'a&b', medium: 'x', campaign: 'y' })).toThrow('Source');
  });
  it('experiments compute rates and a pooled z-score', () => {
    expect(zScore(1000, 100, 1000, 130)).toBeCloseTo(2.10, 2);
    const s = fresh(); const m = 'growth.growth-experiments';
    const e = create(s, m, { name: 'CTA', hypothesis: 'Green converts', metric: 'checkout rate', variantA: 'blue', variantB: 'green' });
    step(s, m, e.id, 'start');
    expect(() => step(s, m, e.id, 'conclude', { aVisitors: 10, aConversions: 11, bVisitors: 10, bConversions: 1 })).toThrow('exceed');
    expect(step(s, m, e.id, 'conclude', { aVisitors: 1000, aConversions: 100, bVisitors: 1000, bConversions: 130 }).data.result).toBe('A 10.00% vs B 13.00%, z=2.10: B ahead');
  });
});
