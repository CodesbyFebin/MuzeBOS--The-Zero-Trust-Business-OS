/** Hub overviews count only stored records; empty stores say so instead of showing sample numbers. */
import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BusinessStore } from '@/lib/metabos/store';
import { HUBS, hubView } from '@/lib/metabos/hubs';
const fresh = () => new BusinessStore(path.join(mkdtempSync(path.join(tmpdir(), 'mb-hubs-')), 'h.sqlite'));
const fact = (v: ReturnType<typeof hubView>, label: string) => v.facts.find((f) => f.label === label)?.value;
describe('hub overviews', () => {
  it('every hub on an empty store is marked empty, with zero counts and a source on each fact', () => {
    const s = fresh();
    for (const h of HUBS) { const v = hubView(s, h); expect(v.empty).toBe(true); for (const f of v.facts) { expect(f.source.length).toBeGreaterThan(2); if (f.unit === 'count' || f.unit === 'paise') expect(f.value).toBe(0); } }
  });
  it('money and growth count an issued invoice; activity sees its evidence and a verified chain', () => {
    const s = fresh(); const c = s.customer({ name: 'Asha', email: 'a@example.com' }); const p = s.product({ name: 'X', sku: 'X1', price: 250, taxBps: 0, stock: 9 });
    const o = s.draft({ customerId: c.id, lines: [{ productId: p.id, quantity: 2 }] }); s.approve(o.id, o.hash); const inv = s.issue(o.id, o.hash) as { payload?: { total: number } } | undefined;
    const money = hubView(s, 'money'); expect(money.empty).toBe(false); expect(fact(money, 'Unpaid invoices')).toBe(1);
    expect(fact(money, 'Unpaid amount')).toBe(s.invoices()[0].payload.total); void inv;
    expect(fact(hubView(s, 'growth'), 'Invoices, last 30 days')).toBe(1);
    const act = hubView(s, 'activity'); expect(fact(act, 'Hash chain')).toBe('verified'); expect(fact(act, 'Evidence events')).toBe(s.evidence().length); expect(act.rows.length).toBeGreaterThan(0);
  });
  it('agents lists every department agent even with no tasks', () => {
    const v = hubView(fresh(), 'agents'); expect(v.rows.map((r) => r.agent)).toEqual(['inventory', 'customers', 'finance', 'operations', 'writer']);
  });
});
