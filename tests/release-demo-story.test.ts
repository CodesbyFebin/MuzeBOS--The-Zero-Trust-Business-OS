/** The 5-step demo story, end to end against the seeded DEMO records (fixture draft; no network). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BusinessStore } from '@/lib/metabos/store';
import { WorkflowEngine } from '@/lib/metabos/workflows';
import { seedDemoStory } from '@/lib/metabos/demo-story';
import { frictionRadar, decideProof, promises } from '@/lib/metabos/command-center';
import { draftReminder, proposeReminder, dispatchOutbound, outbound } from '@/lib/metabos/overdue';
const dirs: string[] = []; const stores: BusinessStore[] = [];
afterEach(() => { stores.splice(0).forEach((s) => s.db.open && s.close()); dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })); });
const open = () => { const d = mkdtempSync(path.join(tmpdir(), 'mb-demo-')); dirs.push(d); const s = new BusinessStore(path.join(d, 'b.sqlite')); stores.push(s); return s; };

describe('5-step demo story', () => {
  it('refuses to seed over existing records', () => {
    const s = open(); s.customer({ name: 'Real', email: '' }); expect(() => seedDemoStory(s)).toThrow(/Refusing/);
  });
  it('walks Command Center → draft → Jev approval → matched payment claim → verified evidence', async () => {
    const s = open(); const ids = seedDemoStory(s); const t = Date.now() + 60_000;
    // 1
    const kinds = frictionRadar(s, t).map((f) => f.kind);
    expect(kinds).toEqual(expect.arrayContaining(['overdue_invoice', 'unmatched_proof', 'order_awaiting_review', 'low_stock']));
    expect(kinds).not.toContain('merchant_upi_missing');
    // 2
    const fetcher = vi.fn(); const d = await draftReminder(s, ids.overdueInvoiceId, { env: {}, fetcher: fetcher as never, nowMs: t });
    expect(d.mode).toBe('fixture'); expect(d.label).toMatch(/^FIXTURE/); expect(fetcher).not.toHaveBeenCalled();
    // 3
    const e = new WorkflowEngine(s, { senderConnected: () => false });
    const run = proposeReminder(s, { invoiceId: ids.overdueInvoiceId, ...d.draft, mode: d.mode, model: d.model }, t, e);
    expect(run.status).toBe('awaiting_approval'); const { denied } = e.tryApprove(run.id, run.payloadHash); expect(denied).toBe(false);
    e.execute(run.id); await dispatchOutbound(s, async () => { throw new Error('must not send'); });
    expect(outbound(s).every((m) => m.status !== 'handed_off')).toBe(true);
    // 4
    expect(s.invoices().find((i) => i.id === ids.claimedInvoiceId)!.payment).toBe('pending');
    decideProof(s, ids.proofId, { accept: true, invoiceId: ids.claimedInvoiceId });
    expect(s.invoices().find((i) => i.id === ids.claimedInvoiceId)).toMatchObject({ payment: 'manually_reconciled', reference: 'DEMOUTR0001' });
    expect(promises(s, t)[0].state).toBe('open');
    // 5
    const acts = s.evidence().map((x) => x.action);
    expect(acts[0]).toBe('demo.seeded'); expect(acts).toEqual(expect.arrayContaining(['proof.received', 'proof.matched', 'promise.recorded']));
    expect(acts.some((a) => /overdue/.test(a))).toBe(true); expect(s.verifyAudit()).toBe(true);
  });
});
