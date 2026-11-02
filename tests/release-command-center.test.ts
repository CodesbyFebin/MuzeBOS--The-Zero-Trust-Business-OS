/** Command Center: Friction Radar + Promise Tracker, Payment Proof Inbox, Verified Brief, Approval Bundles, Near-Miss Memory, Exception Playbooks. */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BusinessStore } from '@/lib/muzebos/store';
import { WorkflowEngine, LOW_STOCK_REMINDER } from '@/lib/muzebos/workflows';
import { frictionRadar, addPromise, closePromise, promises, submitProof, proofInbox, decideProof, verifiedBrief, approvalBundles, approveBundle, nearMisses, PLAYBOOKS, DAY_MS } from '@/lib/muzebos/command-center';
const dirs: string[] = []; const stores: BusinessStore[] = [];
const open = () => { const d = mkdtempSync(path.join(tmpdir(), 'mb-cc-')); dirs.push(d); const s = new BusinessStore(path.join(d, 'b.sqlite')); stores.push(s); return s; };
afterEach(() => { stores.splice(0).forEach((s) => s.db.open && s.close()); dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })); });
const seed = (s: BusinessStore, stock = 10) => {
  const c = s.customer({ name: 'Kaveri Traders', email: 'k@example.com' }); const p = s.product({ name: 'Rice 5kg', sku: `R${s.products().length}`, price: 45000, taxBps: 500, stock });
  const o = s.draft({ customerId: c.id, lines: [{ productId: p.id, quantity: 2 }] }); s.approve(o.id, o.hash); return { inv: s.issue(o.id, o.hash), p };
};
const kinds = (s: BusinessStore, t = Date.now()) => frictionRadar(s, t).map((f) => f.kind);

describe('Command Center', () => {
  it('Friction Radar finds overdue, low stock, missing UPI and unbalanced stock from records, each with a playbook and refs', () => {
    const s = open(); const { inv, p } = seed(s, 6);
    expect(kinds(s)).toEqual(expect.arrayContaining(['low_stock', 'merchant_upi_missing'])); expect(kinds(s)).not.toContain('overdue_invoice');
    const later = frictionRadar(s, Date.now() + 40 * DAY_MS); const od = later.find((f) => f.kind === 'overdue_invoice')!;
    expect(od.refs).toEqual([{ record: 'mb_invoices', id: inv.id }]); expect(od.playbook).toBe(PLAYBOOKS.overdue_invoice);
    s.db.prepare('UPDATE mb_products SET stock=50 WHERE id=?').run(p.id); expect(kinds(s)).toContain('stock_unbalanced');
    expect(frictionRadar(s).map((f) => f.severity)).toEqual([...frictionRadar(s).map((f) => f.severity)].sort((a, b) => a - b));
    for (const k of Object.keys(PLAYBOOKS)) expect(PLAYBOOKS[k as keyof typeof PLAYBOOKS].steps.length).toBeGreaterThan(0);
  });
  it('Promise Tracker: linked promise is kept only by a bank reference; past due without one is broken', () => {
    const s = open(); const { inv } = seed(s);
    const pr = addPromise(s, { party: 'Kaveri', text: 'Pays MB invoice', dueAt: new Date(Date.now() + DAY_MS).toISOString(), invoiceId: inv.id });
    expect(promises(s)[0].state).toBe('open'); expect(promises(s, Date.now() + 2 * DAY_MS)[0].state).toBe('broken');
    expect(frictionRadar(s, Date.now() + 2 * DAY_MS).some((f) => f.kind === 'broken_promise')).toBe(true);
    s.reconcile(inv.id, 'UTR000111222'); expect(promises(s, Date.now() + 2 * DAY_MS)[0].state).toBe('kept');
    closePromise(s, pr.id, 'dropped'); expect(() => closePromise(s, pr.id, 'kept')).toThrow();
  });
  it('Payment Proof Inbox: a claim never reconciles by itself; exact amount required; references are single-use', () => {
    const s = open(); const { inv } = seed(s);
    const pf = submitProof(s, { reference: 'UTR123456', amount: 94500, payer: 'Kaveri' });
    expect(s.invoices()[0].payment).toBe('pending'); expect(proofInbox(s)[0].candidates.map((c) => c.invoiceId)).toEqual([inv.id]);
    const wrong = submitProof(s, { reference: 'UTR999999', amount: 100, payer: 'X' });
    expect(() => decideProof(s, wrong.id, { accept: true, invoiceId: inv.id })).toThrow(/does not equal/);
    expect(() => submitProof(s, { reference: 'UTR123456', amount: 94500, payer: 'K' })).toThrow(/already/);
    decideProof(s, pf.id, { accept: true, invoiceId: inv.id });
    expect(s.invoices()[0]).toMatchObject({ payment: 'manually_reconciled', reference: 'UTR123456' });
    expect(() => decideProof(s, pf.id, { accept: false, reason: 'x' })).toThrow(/already/);
    expect(s.verifyAudit()).toBe(true);
  });
  it('Verified Brief: figures are aggregates with sources and flips to UNVERIFIED on a broken chain', () => {
    const s = open(); seed(s); seed(s); const b = verifiedBrief(s);
    expect(b.facts.find((f) => f.label === 'Invoices issued')!.value).toBe(2); expect(b.facts.find((f) => f.label === 'Outstanding (paise)')!.value).toBe(189000);
    expect(b.chainIntact).toBe(true); expect(b.digest).toMatch(/^[a-f0-9]{64}$/); expect(b.facts.every((f) => f.source.length > 0)).toBe(true);
    s.db.prepare("UPDATE mb_audit SET detail='x' WHERE seq=1").run(); const t = verifiedBrief(s);
    expect(t.chainIntact).toBe(false); expect(t.note).toMatch(/^UNVERIFIED/); expect(kinds(s)[0]).toBe('audit_chain_broken');
  });
  it('Approval Bundles approve every waiting run under one hash; any drift approves nothing and is a near miss', () => {
    const s = open(); seed(s, 3); const e = new WorkflowEngine(s);
    e.start(LOW_STOCK_REMINDER.id, { threshold: 5 }); e.start(LOW_STOCK_REMINDER.id, { threshold: 4 });
    const [b] = approvalBundles(s, e); expect(b.runs).toHaveLength(2);
    expect(() => approveBundle(s, b.workflowId, 'f'.repeat(64), e)).toThrow(/nothing approved/);
    expect(e.runs().filter((r) => r.status === 'awaiting_approval')).toHaveLength(2);
    expect(nearMisses(s).counts['bundle.denied']).toBe(1);
    const res = approveBundle(s, b.workflowId, b.bundleHash, e); expect(res.every((r) => !r.denied && r.status === 'running')).toBe(true);
    expect(approvalBundles(s, e)).toHaveLength(0); expect(s.evidence().at(-1)!.action).toBe('bundle.approved');
  });
  it('Near-Miss Memory lists refused actions from evidence, newest first', () => {
    const s = open(); const { inv } = seed(s); const pf = submitProof(s, { reference: 'UTR777777', amount: 5, payer: 'x' });
    expect(() => decideProof(s, pf.id, { accept: true, invoiceId: inv.id })).toThrow(); decideProof(s, pf.id, { accept: false, reason: 'not on statement' });
    const n = nearMisses(s); expect(n.items.map((i) => i.action)).toEqual(['proof.rejected', 'proof.mismatch_refused']);
  });
});
