/** Gate 3: overdue-invoice reminder — stored records, citations, bounded draft, Jev approval, connected-sender-only send, Activity. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BusinessStore } from '@/lib/muzebos/store';
import { WorkflowEngine } from '@/lib/muzebos/workflows';
import { findOverdue, draftReminder, proposeReminder, validateDraft, dispatchOutbound, outbound, setTermsDays, liveGate, DRAFT_LIMITS, DAY_MS } from '@/lib/muzebos/overdue';
const dirs: string[] = []; const stores: BusinessStore[] = [];
const open = () => { const d = mkdtempSync(path.join(tmpdir(), 'mb-gate3-')); dirs.push(d); const s = new BusinessStore(path.join(d, 'b.sqlite')); stores.push(s); return s; };
afterEach(() => { stores.splice(0).forEach((s) => s.db.open && s.close()); dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })); });
const seed = (s: BusinessStore, email = 'kaveri@example.com') => {
  const c = s.customer({ name: 'Kaveri Traders', email }); const p = s.product({ name: 'Rice 5kg', sku: 'RICE5', price: 45000, taxBps: 500, stock: 10 });
  const o = s.draft({ customerId: c.id, lines: [{ productId: p.id, quantity: 2 }] }); s.approve(o.id, o.hash); return s.issue(o.id, o.hash);
};
const later = (days: number) => Date.now() + days * DAY_MS;
const LIVE_ENV = { META_MODEL_API_KEY: 'test-key-not-real', META_PRICE_IN_PER_MTOK_USD: '1', META_PRICE_OUT_PER_MTOK_USD: '2' };
const ok = (content: string, usage = { prompt_tokens: 100, completion_tokens: 80 }) => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }], usage }), { status: 200 });
const actions = (s: BusinessStore) => s.evidence().map((e) => e.action);

describe('Gate 3 overdue invoices', () => {
  it('finds only pending, unreferenced invoices past the derived due date, with citations and uncertainty', () => {
    const s = open(); const inv = seed(s);
    expect(findOverdue(s, later(10))).toHaveLength(0);
    const [f] = findOverdue(s, later(31));
    expect(f.number).toBe(inv.number); expect(f.amountText).toBe('INR 945.00'); expect(f.termsSource).toBe('assumed_default');
    expect(f.citations.map((c) => c.field)).toEqual(expect.arrayContaining(['number', 'createdAt', 'payment', 'reference', 'payload.total', 'payload.customer.email']));
    expect(f.uncertainty.join(' ')).toMatch(/assumed default/); expect(f.uncertainty.join(' ')).toMatch(/without a bank reference/);
    setTermsDays(s, 7); const [g] = findOverdue(s, later(8)); expect(g.termsSource).toBe('configured'); expect(g.daysOverdue).toBe(1);
    s.reconcile(inv.id, 'UTR123456789'); expect(findOverdue(s, later(60))).toHaveLength(0);
  });
  it('without a key or price the draft is a labelled FIXTURE and the live gate is BLOCKED; no network call', async () => {
    const s = open(); const inv = seed(s); const fetcher = vi.fn();
    const r = await draftReminder(s, inv.id, { env: {}, fetcher: fetcher as never, nowMs: later(40) });
    expect(r.mode).toBe('fixture'); expect(r.label).toMatch(/^FIXTURE/); expect(r.gate.reason).toMatch(/^BLOCKED/); expect(fetcher).not.toHaveBeenCalled();
    const noPrice = await draftReminder(s, inv.id, { env: { META_MODEL_API_KEY: 'x' }, fetcher: fetcher as never, nowMs: later(40) });
    expect(noPrice.gate.reason).toMatch(/price not configured/); expect(fetcher).not.toHaveBeenCalled();
    expect(validateDraft(r.draft, r.finding).ok).toBe(true);
  });
  it('a live draft is bounded (max_tokens, timeout signal) and validated; a bad model draft falls back to fixture', async () => {
    const s = open(); const inv = seed(s); const nowMs = later(40); const [f] = findOverdue(s, nowMs);
    const good = vi.fn(async (_u: unknown, init: RequestInit) => { const b = JSON.parse(String(init.body)); expect(b.max_tokens).toBe(DRAFT_LIMITS.maxOutputTokens); expect(init.signal).toBeInstanceOf(AbortSignal); return ok(JSON.stringify({ subject: `Reminder for ${f.number}`, body: `Hello, invoice ${f.number} for ${f.amountText} is past due. If paid, please reply with the bank reference. Thanks.` })); });
    const live = await draftReminder(s, inv.id, { env: LIVE_ENV, fetcher: good as never, nowMs });
    expect(live.mode).toBe('live'); expect(live.label).toMatch(/^LIVE/);
    const bad = vi.fn(async () => ok(JSON.stringify({ subject: 'Pay now', body: 'Your invoice has been paid? Pay at https://evil.example or we take legal action immediately.' })));
    const fb = await draftReminder(s, inv.id, { env: LIVE_ENV, fetcher: bad as never, nowMs });
    expect(fb.mode).toBe('fixture'); expect(fb.fallbackReason).toMatch(/rejected/);
    const slow = vi.fn(async () => { const e = new Error('t'); e.name = 'TimeoutError'; throw e; });
    expect((await draftReminder(s, inv.id, { env: LIVE_ENV, fetcher: slow as never, nowMs })).fallbackReason).toMatch(/timed out/);
    expect(actions(s)).toEqual(expect.arrayContaining(['overdue.draft.live', 'overdue.draft.fallback']));
  });
  it('enforces daily call and cost caps before calling', async () => {
    const s = open(); seed(s); const nowMs = later(40);
    expect(liveGate(s, { ...LIVE_ENV, META_PRICE_OUT_PER_MTOK_USD: '1000' }, nowMs).reason).toMatch(/per-call cap/);
    s.db.prepare("INSERT INTO mb_settings VALUES(?,?)").run(`overdue.spend.${new Date(nowMs).toISOString().slice(0, 10)}`, JSON.stringify({ calls: DRAFT_LIMITS.maxCallsPerDay, usd: 0 }));
    expect(liveGate(s, LIVE_ENV, nowMs)).toMatchObject({ available: false }); expect(liveGate(s, LIVE_ENV, nowMs).reason).toMatch(/call cap/);
  });
  it('requires Jev approval; without a connected sender nothing is sent and that is recorded', async () => {
    const s = open(); const inv = seed(s); const nowMs = later(40); const d = await draftReminder(s, inv.id, { env: {}, nowMs });
    const e = new WorkflowEngine(s, { senderConnected: () => false });
    const run = proposeReminder(s, { invoiceId: inv.id, ...d.draft, mode: d.mode, model: d.model }, nowMs, e);
    expect(run.status).toBe('awaiting_approval'); expect(() => e.execute(run.id)).toThrow(/approved/);
    e.approve(run.id, run.payloadHash); const done = e.execute(run.id);
    expect(done.status).toBe('succeeded'); expect(e.steps(run.id)[0].output).toMatchObject({ sent: false });
    expect(outbound(s)).toHaveLength(0); expect(actions(s)).toEqual(expect.arrayContaining(['overdue.reminder.proposed', 'overdue.reminder.not_sent']));
    expect(s.verifyAudit()).toBe(true);
  });
  it('with a connected sender it queues once and hands off; a failure is recorded, not retried', async () => {
    const s = open(); const inv = seed(s); const nowMs = later(40); const d = await draftReminder(s, inv.id, { env: {}, nowMs });
    const e = new WorkflowEngine(s, { senderConnected: () => true });
    const run = proposeReminder(s, { invoiceId: inv.id, ...d.draft, mode: d.mode, model: d.model }, nowMs, e);
    e.approve(run.id, run.payloadHash); e.execute(run.id);
    const send = vi.fn(async () => ({ ok: true })); const out = await dispatchOutbound(s, send);
    expect(out).toEqual([expect.objectContaining({ status: 'handed_off' })]); expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'kaveri@example.com' }));
    expect(await dispatchOutbound(s, send)).toHaveLength(0); expect(send).toHaveBeenCalledTimes(1);
    expect(actions(s)).toEqual(expect.arrayContaining(['overdue.reminder.queued', 'overdue.reminder.handed_off']));
  });
  it('reconciling after approval makes the run stale and nothing is sent; edited invalid drafts are refused', async () => {
    const s = open(); const inv = seed(s); const nowMs = later(40); const d = await draftReminder(s, inv.id, { env: {}, nowMs });
    const e = new WorkflowEngine(s, { senderConnected: () => true });
    expect(() => proposeReminder(s, { invoiceId: inv.id, subject: 'Hi there', body: 'Please pay your outstanding balance soon, thank you very much.', mode: 'fixture', model: null }, nowMs, e)).toThrow(/must cite invoice number/);
    const run = proposeReminder(s, { invoiceId: inv.id, ...d.draft, mode: d.mode, model: d.model }, nowMs, e);
    e.approve(run.id, run.payloadHash); s.reconcile(inv.id, 'UTR987654321');
    const r = e.execute(run.id); expect(r.status).toBe('failed'); expect(r.error).toMatch(/Payload changed/);
    expect(outbound(s)).toHaveLength(0);
  });
});
