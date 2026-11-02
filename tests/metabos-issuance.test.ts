import { afterEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { BusinessStore, canonicalJson, payloadHash } from '@/lib/metabos/store';
const run = promisify(execFile);
const stores: BusinessStore[] = []; const dirs: string[] = [];
const fresh = (f = ':memory:') => { const s = new BusinessStore(f); stores.push(s); return s; };
const tmpFile = () => { const d = mkdtempSync(path.join(tmpdir(), 'mb-iss-')); dirs.push(d); return path.join(d, 'db.sqlite'); };
afterEach(() => { stores.splice(0).forEach((s) => s.db.open && s.close()); dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })); });
function seed(s: BusinessStore, stock = 10) {
  const c = s.customer({ name: 'Asha', email: 'asha@example.com' });
  const p = s.product({ name: 'Chai', sku: `CHAI-${randomUUID().slice(0, 6)}`, price: 12345, taxBps: 1800, stock });
  return { c, p };
}
const count = (s: BusinessStore, t: string) => (s.db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as { n: number }).n;

describe('canonical payload hash', () => {
  it('ignores key order but not values', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { y: 1, x: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[2,{"x":2,"y":1}]},"b":1}');
    expect(payloadHash({ a: 1, b: 2 })).toBe(payloadHash({ b: 2, a: 1 }));
    expect(payloadHash({ a: 1 })).not.toBe(payloadHash({ a: 2 }));
    expect(() => canonicalJson({ a: Number.NaN })).toThrow();
  });
});

describe('8-step atomic issuance', () => {
  it('happy path: draft -> approve -> issue, integer minor units, stock, approval consumed, evidence', () => {
    const s = fresh(); const { c, p } = seed(s);
    const order = s.draft({ customerId: c.id, lines: [{ productId: p.id, quantity: 3 }] });
    expect(order.hash).toBe(payloadHash(order.payload));
    expect(order.payload).toMatchObject({ subtotal: 37035, tax: 6666, total: 43701 }); // 37035*18% = 6666.3 -> 6666 half-up
    for (const v of [order.payload.subtotal, order.payload.tax, order.payload.total]) expect(Number.isInteger(v)).toBe(true);
    const approval = s.approve(order.id, order.hash);
    expect(approval).toMatchObject({ payloadHash: order.hash, consumedAt: null });
    expect(s.approve(order.id, order.hash)).toEqual(approval); // re-approve same payload is a no-op
    const inv = s.issue(order.id, order.hash);
    expect(inv).toMatchObject({ number: 'MB-000001', payment: 'pending' });
    expect(inv.payload).toEqual(order.payload);
    expect(s.products()[0].stock).toBe(7);
    expect(s.approval(order.id)).toMatchObject({ invoiceId: inv.id });
    expect(s.approval(order.id)?.consumedAt).toBeTruthy();
    expect(s.evidence().map((e) => e.action)).toEqual(['customer.created', 'product.created', 'approval.requested', 'approval.granted', 'invoice.issued']);
    expect(s.verifyAudit()).toBe(true);
    expect(() => s.issue(order.id, order.hash)).toThrow('Approval already consumed');
  });
  it('approve-and-issue in one step records the bound approval in the same transaction', () => {
    const s = fresh(); const { c, p } = seed(s);
    const o = s.draft({ customerId: c.id, lines: [{ productId: p.id, quantity: 1 }] });
    s.issue(o.id, o.hash);
    expect(s.approval(o.id)?.payloadHash).toBe(o.hash);
  });
  it('rejects a payload changed after approval, leaving no invoice, movement or stock change', () => {
    const s = fresh(); const { c, p } = seed(s);
    const o = s.draft({ customerId: c.id, lines: [{ productId: p.id, quantity: 2 }] });
    s.approve(o.id, o.hash);
    const tampered = { ...o.payload, total: 1 };
    s.db.prepare('UPDATE mb_orders SET payload=? WHERE id=?').run(JSON.stringify(tampered), o.id);
    expect(() => s.issue(o.id, o.hash)).toThrow('Invoice payload changed after approval');
    expect([count(s, 'mb_invoices'), count(s, 'mb_movements')]).toEqual([0, 0]);
    expect(s.products()[0].stock).toBe(10);
    expect(s.approval(o.id)?.consumedAt).toBeNull();
    // Same tamper with a recomputed order hash is also refused: the approval holds the original hash.
    s.db.prepare('UPDATE mb_orders SET hash=? WHERE id=?').run(payloadHash(tampered), o.id);
    expect(() => s.issue(o.id, payloadHash(tampered))).toThrow('Invoice payload changed after approval');
    expect(() => s.approve(o.id, payloadHash(tampered))).toThrow('different payload');
    expect(count(s, 'mb_invoices')).toBe(0);
  });
  it('refuses issuing with a hash other than the reviewed one', () => {
    const s = fresh(); const { c, p } = seed(s);
    const o = s.draft({ customerId: c.id, lines: [{ productId: p.id, quantity: 1 }] });
    expect(() => s.issue(o.id, 'f'.repeat(64))).toThrow('Reviewed invoice payload changed');
    expect(s.approval(o.id)).toBeUndefined();
  });
  it('rechecks stock inside the transaction: the second of two drafts for the same units is refused, atomically', () => {
    const s = fresh(); const { c, p } = seed(s, 5);
    const a = s.draft({ customerId: c.id, lines: [{ productId: p.id, quantity: 4 }] });
    const b = s.draft({ customerId: c.id, lines: [{ productId: p.id, quantity: 4 }] });
    s.issue(a.id, a.hash);
    expect(() => s.issue(b.id, b.hash)).toThrow('Stock changed');
    expect(s.products()[0].stock).toBe(1);
    expect(count(s, 'mb_invoices')).toBe(1);
    expect(s.approval(b.id)).toBeUndefined(); // approval written in the failed transaction rolled back
  });
  it('a repeated request with the same idempotency key returns the original result; a changed request is refused', () => {
    const s = fresh(); const { c, p } = seed(s);
    const o = s.draft({ customerId: c.id, lines: [{ productId: p.id, quantity: 1 }] });
    const key = randomUUID(); const cmd = { action: 'issue', id: o.id, hash: o.hash };
    const first = s.command(key, cmd, () => s.issue(o.id, o.hash));
    const again = s.command(key, cmd, () => s.issue(o.id, o.hash));
    expect(again).toEqual(JSON.parse(JSON.stringify(first)));
    expect(count(s, 'mb_invoices')).toBe(1);
    expect(s.products()[0].stock).toBe(9);
    expect(() => s.command(key, { ...cmd, hash: 'a'.repeat(64) }, () => null)).toThrow('Idempotency key reused');
  });
});

describe('concurrent issuance across processes cannot oversell', () => {
  it('8 orders for 4 units each against 10 units, issued by 2 processes at once: exactly 2 succeed', async () => {
    const file = tmpFile(); const s = fresh(file); const { c, p } = seed(s, 10);
    const orders = Array.from({ length: 8 }, () => s.draft({ customerId: c.id, lines: [{ productId: p.id, quantity: 4 }] }));
    s.close();
    const startAt = Date.now() + 2500;
    const worker = path.join(process.cwd(), 'tests', 'helpers', 'issue-worker.ts');
    const half = (k: number) => orders.filter((_, i) => i % 2 === k).map((o) => `${o.id}:${o.hash}`);
    const [r1, r2] = await Promise.all([0, 1].map((k) => run(process.execPath, ['--import', 'tsx', worker, file, String(startAt), ...half(k)], { cwd: process.cwd() })));
    const outcomes = [...JSON.parse(r1.stdout), ...JSON.parse(r2.stdout)] as string[];
    expect(outcomes.filter((o) => o.startsWith('ok')).length).toBe(2);
    expect(outcomes.filter((o) => o === 'refused:409').length).toBe(6);
    const after = fresh(file);
    expect(after.products()[0].stock).toBe(2);
    expect(count(after, 'mb_invoices')).toBe(2);
    expect(new Set(after.invoices().map((i) => i.number))).toEqual(new Set(['MB-000001', 'MB-000002']));
    expect(after.verifyAudit()).toBe(true);
  }, 60_000);
});
