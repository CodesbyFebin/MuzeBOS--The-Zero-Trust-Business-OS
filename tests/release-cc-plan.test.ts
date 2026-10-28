/** Command Center ask → review → act plans: step states, stale-review guard, permissions, evidence. */
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BusinessStore, businessStore } from '@/lib/muzebos/store';
import { askPlan, reviewPlan, decidePlan, plans, kindsForAsk } from '@/lib/muzebos/cc-plan';
import { setupWorkspace, invite, outbox, redeemMagicLink, USER_COOKIE } from '@/lib/muzebos/biz/accounts';
import { member, DEPARTMENTS } from '@/lib/muzebos/biz/members';
const DAY = 86_400_000; const dir = mkdtempSync(path.join(tmpdir(), 'mb-plan-')); let n = 0; const stores: BusinessStore[] = [];
const open = () => { const s = new BusinessStore(path.join(dir, `${n++}.sqlite`)); stores.push(s); return s; };
afterEach(() => { stores.splice(0).forEach((s) => s.db.open && s.close()); });
afterAll(() => { const s = businessStore(); if (s.db.open) s.close(); rmSync(dir, { recursive: true, force: true }); });
const seed = (s: BusinessStore) => {
  const c = s.customer({ name: 'Kaveri Traders', email: 'k@example.com' }); const p = s.product({ name: 'Rice', sku: `R${n}`, price: 45000, taxBps: 0, stock: 50 });
  const o = s.draft({ customerId: c.id, lines: [{ productId: p.id, quantity: 1 }] }); s.approve(o.id, o.hash); return s.issue(o.id, o.hash);
};
const states = (p: { steps: { state: string }[] }) => p.steps.map((x) => x.state);

describe('Command Center plan', () => {
  it('maps asks to friction kinds by keyword', () => {
    expect(kindsForAsk('Which invoices are overdue?')).toEqual(['overdue_invoice', 'broken_promise']);
    expect(kindsForAsk('low stock?')).toEqual(['low_stock', 'stock_unbalanced']); expect(kindsForAsk('hello there')).toEqual([]);
  });
  it('ask → review → approve moves through step states and records evidence; nothing is executed', () => {
    const s = open(); const inv = seed(s); const now = Date.now() + 31 * DAY;
    const p = askPlan(s, 'owner', { ask: 'Which invoices are overdue?' }, now);
    expect(p.items.map((f) => f.refs[0].id)).toContain(inv.id); expect(states(p)).toEqual(['done', 'ready', 'blocked']);
    expect(() => decidePlan(s, 'owner', p.id, true, now)).toThrow(/not awaiting approval/);
    const r = reviewPlan(s, 'owner', p.id, now); expect(states(r)).toEqual(['done', 'done', 'awaiting_approval']);
    const d = decidePlan(s, 'owner', p.id, true, now); expect(states(d)).toEqual(['done', 'done', 'done']); expect(d.status).toBe('done');
    expect(s.invoices().find((i) => i.id === inv.id)!.payment).toBe('pending');
    expect(s.evidence().map((e) => e.action)).toEqual(expect.arrayContaining(['plan.ask', 'plan.review', 'plan.approve']));
    expect(s.verifyAudit()).toBe(true);
  });
  it('refuses approval when the records changed after review, and sends it back to review', () => {
    const s = open(); const inv = seed(s); const now = Date.now() + 31 * DAY;
    const p = askPlan(s, 'owner', { ask: 'overdue invoices' }, now); reviewPlan(s, 'owner', p.id, now);
    s.reconcile(inv.id, 'UTR123456789');
    expect(() => decidePlan(s, 'owner', p.id, true, now)).toThrow(/changed since review/);
    expect(states(plans(s, 5, now)[0])).toEqual(['done', 'ready', 'blocked']); expect(s.evidence().map((e) => e.action)).toContain('plan.stale');
  });
  it('reject ends the plan; an ask with no matches completes with nothing to act on', () => {
    const s = open(); seed(s); const now = Date.now() + 31 * DAY;
    const p = askPlan(s, 'owner', { ask: 'overdue' }, now); reviewPlan(s, 'owner', p.id, now);
    expect(decidePlan(s, 'owner', p.id, false, now)).toMatchObject({ status: 'rejected' });
    const empty = askPlan(s, 'owner', { ask: 'any audit problems?' }, now);
    expect(empty).toMatchObject({ status: 'done' }); expect(states(empty)).toEqual(['done', 'done', 'blocked']);
  });
  it('API: member role cannot ask (403); manager can review but approval needs jev.decide', async () => {
    process.env.MUZEBOS_DB = path.join(dir, 'api.sqlite'); const s = businessStore();
    const owner = setupWorkspace(s, { workspace: 'P', name: 'Owner', email: 'o@example.com', password: 'long enough secret' }).token;
    invite(s, member(s, 'owner'), { name: 'Staff', email: 'st@example.com', role: 'member', department: DEPARTMENTS[0] }, 'http://localhost');
    const staff = redeemMagicLink(s, /link=([^\s]+)/.exec(outbox(s)[0].body)![1]).token;
    const { POST, GET } = await import('@/app/api/muzebos/command-center/route');
    const post = (token: string, body: object) => POST(new Request('http://localhost/api/muzebos/command-center', { method: 'POST', headers: { origin: 'http://localhost', host: 'localhost', 'content-type': 'application/json', cookie: `${USER_COOKIE}=${token}` }, body: JSON.stringify(body) }));
    expect((await post(staff, { action: 'plan.ask', ask: 'overdue invoices' })).status).toBe(403);
    expect((await post(owner, { action: 'plan.ask', ask: 'stock levels' })).status).toBe(200);
    const v = await (await GET(new Request('http://localhost/api/muzebos/command-center', { headers: { cookie: `${USER_COOKIE}=${owner}` } }))).json();
    expect(v.plans).toHaveLength(1); expect(v.plans[0].steps.map((x: { kind: string }) => x.kind)).toEqual(['ask', 'review', 'act']);
  });
});
