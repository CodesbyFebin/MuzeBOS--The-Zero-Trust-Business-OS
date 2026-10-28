import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { BusinessStore } from '@/lib/metabos/store';
import { missionSnapshot, activityHref, localDay, LOW_STOCK_UNITS } from '@/lib/metabos/mission';
const stores: BusinessStore[] = []; const dirs: string[] = [];
const fresh = (f = ':memory:') => { const s = new BusinessStore(f); stores.push(s); return s; };
afterEach(() => { stores.splice(0).forEach((s) => s.db.open && s.close()); dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })); });

describe('Slice 2: Mission Control counts', () => {
  it('keeps outstanding issued invoices separate from settled ones and does not invent payment requests', () => {
    const s = fresh(); const c = s.customer({ name: 'A' }); const p = s.product({ name: 'Tea', sku: 'TEA', price: 1000, taxBps: 0, stock: 10 });
    const o1 = s.draft({ customerId: c.id, lines: [{ productId: p.id, quantity: 1 }] }); s.issue(o1.id, o1.hash);
    const o2 = s.draft({ customerId: c.id, lines: [{ productId: p.id, quantity: 2 }] }); const inv2 = s.issue(o2.id, o2.hash);
    s.reconcile(inv2.id, 'UTR-1');
    const k = missionSnapshot(s, [], []).counters;
    expect(k).toMatchObject({ paymentPending: 1, paymentPendingMinor: 1000, settled: 1, settledMinor: 2000, paymentRequested: null, issuedInvoices: 2 });
  });
  it('reports low stock (at or below the disclosed threshold) apart from stockouts', () => {
    const s = fresh();
    s.product({ name: 'Low', sku: 'LOW', price: 1, taxBps: 0, stock: LOW_STOCK_UNITS });
    s.product({ name: 'Out', sku: 'OUT', price: 1, taxBps: 0, stock: 0 });
    s.product({ name: 'Fine', sku: 'FINE', price: 1, taxBps: 0, stock: LOW_STOCK_UNITS + 1 });
    const m = missionSnapshot(s, [], []);
    expect(m.counters).toMatchObject({ lowStock: 1, outOfStock: 1 });
    expect(m.lowStock.map((x) => x.sku)).toEqual(['LOW']);
  });
  it('counts reminders and tasks due today in the operator timezone', () => {
    const s = fresh(); const at = new Date('2026-10-26T04:00:00Z'); // 09:30 IST
    s.reminder({ title: 'later today IST', dueAt: '2026-10-26T17:00:00Z' }); // 22:30 IST same day
    s.reminder({ title: 'tomorrow IST', dueAt: '2026-10-26T19:00:00Z' }); // 00:30 IST next day
    s.reminder({ title: 'earlier today, overdue', dueAt: '2026-10-26T00:00:00Z' });
    const ist = missionSnapshot(s, [], [], at, -330);
    expect(ist.counters.dueToday).toBe(2); expect(ist.counters.overdue).toBe(1);
    expect(missionSnapshot(s, [], [], at, 0).counters.dueToday).toBe(3);
    expect(localDay(at, -330)).toEqual({ start: Date.parse('2026-10-25T18:30:00Z'), end: Date.parse('2026-10-26T18:30:00Z') });
  });
});

describe('Slice 2: reminders', () => {
  it('complete and reopen persist across reopening the database and are audited', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'mb-s2-')); dirs.push(dir); const f = path.join(dir, 'db.sqlite');
    const s = fresh(f); const r = s.reminder({ title: 'Persist me', dueAt: '2026-10-26T10:00:00+05:30' });
    expect(r.dueAt).toBe('2026-10-26T04:30:00.000Z');
    s.completeReminder(r.id); s.reopenReminder(r.id); s.completeReminder(r.id); s.reopenReminder(r.id); s.close();
    const t = fresh(f); expect(t.reminders()[0]).toMatchObject({ id: r.id, status: 'open', completedAt: null });
    expect(t.evidence().map((e) => e.action).filter((a) => a.startsWith('reminder'))).toEqual(['reminder.created', 'reminder.completed', 'reminder.reopened', 'reminder.completed', 'reminder.reopened']);
    expect(t.verifyAudit()).toBe(true);
    expect(() => t.reopenReminder(r.id)).toThrow('Completed reminder not found');
  });
  it('links a reminder to an existing record and rejects unknown records', () => {
    const s = fresh(); const c = s.customer({ name: 'Asha' });
    s.reminder({ title: 'Call Asha', link: { kind: 'customer', id: c.id } });
    expect(() => s.reminder({ title: 'x', link: { kind: 'invoice', id: c.id } })).toThrow('Linked invoice not found');
    expect(() => s.reminder({ title: 'x', link: { kind: 'planet', id: c.id } })).toThrow();
    const todo = missionSnapshot(s, [], []).todo[0];
    expect(todo.link).toEqual({ kind: 'customer', id: c.id, label: 'Asha', href: '/business?view=customers' });
  });
  it('migrates a v4 database by adding link columns without losing reminders', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'mb-s2m-')); dirs.push(dir); const f = path.join(dir, 'old.sqlite');
    const old = new Database(f);
    old.exec("CREATE TABLE mb_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); CREATE TABLE mb_reminders(id TEXT PRIMARY KEY,title TEXT NOT NULL,dueAt TEXT,status TEXT NOT NULL CHECK(status IN ('open','done')),createdAt TEXT NOT NULL,completedAt TEXT); INSERT INTO mb_reminders VALUES('11111111-1111-4111-8111-111111111111','old',NULL,'open','2026-01-01T00:00:00Z',NULL); INSERT INTO mb_migrations VALUES(1,'x'),(2,'x'),(3,'x'),(4,'x');");
    old.close();
    const s = fresh(f); expect(s.reminders()[0]).toMatchObject({ title: 'old', linkKind: null, linkId: null });
    s.close(); expect(fresh(f).reminders()).toHaveLength(1); // idempotent second open
  });
});

describe('Slice 2: activity feed links to source records', () => {
  it('maps every action family the store writes', () => {
    expect(activityHref('invoice.issued')).toBe('/business?view=invoices');
    expect(activityHref('payment.manually_reconciled')).toBe('/business?view=invoices');
    expect(activityHref('approval.requested')).toBe('/business?view=orders');
    expect(activityHref('booking.created')).toBe('/workspace/orders/bookings');
    expect(activityHref('webhook.received')).toBe('/workspace/system/webhooks');
    expect(activityHref('mystery.thing')).toBeNull();
    const s = fresh(); s.customer({ name: 'Z' });
    expect(missionSnapshot(s, [], []).feed[0]).toMatchObject({ action: 'customer.created', href: '/business?view=customers' });
  });
});
