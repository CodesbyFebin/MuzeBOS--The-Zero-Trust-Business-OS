/** Ask-your-data (read-only), DPDP export/redact and sales goals on a real in-memory store. No mocks. */
import { describe, expect, it } from 'vitest';
import { BusinessStore } from '@/lib/metabos/store';
import { ask, exportSubject, redactSubject, runSelect, salesGoals, setSalesGoal } from '@/lib/metabos/data/service';
import { ingest, parseMetaWebhook } from '@/lib/metabos/talk/service';

const seed = (s: BusinessStore) => { const c = s.customer({ name: 'Asha', email: 'asha@example.test' }); const p = s.product({ name: 'Mug', sku: 'MUG-1', price: 10000, taxBps: 1800, stock: 3 }); const o = s.draft({ customerId: c.id, lines: [{ productId: p.id, quantity: 2 }] }); s.approve(o.id, o.hash); return { c, inv: s.issue(o.id, o.hash) }; };

describe('ask your data', () => {
  it('answers fixed questions with the exact SQL and real rows', () => {
    const s = new BusinessStore(':memory:'); seed(s);
    const r = ask(s, 'what was revenue in the last 7 days');
    expect(r.intent).toBe('revenue'); expect(r.rows[0]).toMatchObject({ invoices: 1, total_paise: 23600 });
    expect(ask(s, 'top products').rows[0]).toMatchObject({ product: 'Mug', units: 2 });
    expect(ask(s, 'which invoices are unpaid').rows).toHaveLength(1);
    expect(ask(s, 'tell me a joke').intent).toBeNull();
  });
  it('owner SELECT is read-only and limited to allowed tables', () => {
    const s = new BusinessStore(':memory:'); seed(s);
    expect(runSelect(s, 'SELECT name FROM mb_customers').rows).toEqual([{ name: 'Asha' }]);
    expect(() => runSelect(s, 'DELETE FROM mb_customers')).toThrow(/One SELECT/);
    expect(() => runSelect(s, 'SELECT 1; DROP TABLE mb_customers')).toThrow(/One SELECT/);
    expect(() => runSelect(s, 'SELECT * FROM mb_audit')).toThrow(/not allowed/);
    expect(() => runSelect(s, 'SELECT c.name, a.hash FROM mb_customers c, mb_audit a')).toThrow(/not allowed/);
    expect(() => runSelect(s, 'SELECT * FROM sqlite_master')).toThrow(/not allowed/);
    expect(() => runSelect(s, 'WITH x AS (SELECT * FROM mb_audit) SELECT * FROM x')).toThrow(/not allowed/);
    expect(s.customers()).toHaveLength(1);
  });
});

describe('DPDP export and redact', () => {
  it('exports everything tied to a customer and pseudonymises while keeping amounts', async () => {
    const s = new BusinessStore(':memory:'); const { c, inv } = seed(s);
    await ingest(s, parseMetaWebhook('whatsapp', { entry: [{ changes: [{ value: { contacts: [{ wa_id: '919876543210', profile: { name: 'Asha' } }], messages: [{ id: 'w1', from: '919876543210', timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'my address is 12 MG Road' } }] } }] }] }), {});
    const b = exportSubject(s, 'owner', c.id, ['+919876543210']);
    expect(b.invoices).toHaveLength(1); expect(b.conversations).toHaveLength(1); expect(b.messages).toHaveLength(1);
    expect(() => redactSubject(s, 'owner', c.id, 'asha')).toThrow(/exactly/);
    const r = redactSubject(s, 'owner', c.id, 'Asha', ['+919876543210']);
    const after = s.invoices().find((i) => i.id === inv.id)!;
    expect(after.payload.customer.name).toBe(r.alias); expect(after.payload.total).toBe(23600); expect(after.number).toBe(inv.number);
    expect(s.customers()[0]).toMatchObject({ name: r.alias, email: '' });
    expect(s.db.prepare('SELECT body FROM mb_messages').get()).toEqual({ body: '[redacted]' });
    expect(JSON.stringify(s.db.prepare('SELECT * FROM mb_conversations').all())).not.toContain('919876543210');
    expect(s.evidence().filter((e) => e.action.startsWith('privacy.'))).toHaveLength(2);
    expect(s.verifyAudit()).toBe(true);
  });
});

describe('sales goals', () => {
  it('compares targets with invoiced and collected totals from real invoices', () => {
    const s = new BusinessStore(':memory:'); const { inv } = seed(s);
    const period = inv.createdAt.slice(0, 7);
    expect(salesGoals(s)[0]).toMatchObject({ period, targetMinor: null, invoicedMinor: 23600 });
    setSalesGoal(s, 'owner', period, 47200);
    expect(salesGoals(s)[0]).toMatchObject({ targetMinor: 47200, pctOfTarget: 50, collectedMinor: 0 });
    expect(() => setSalesGoal(s, 'owner', '2026-13', 1)).toThrow(/YYYY-MM/);
    expect(() => setSalesGoal(s, 'owner', period, 1.5)).toThrow(/whole paise/);
  });
});
