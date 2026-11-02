import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { BusinessStore } from '../lib/metabos/store';
import { createDeal, moveDeal, pipelineSummary, winProbability, requestNextStep, readNextStep } from '../lib/metabos/biz/pipeline';
import { submitExpense, decideExpense, withdrawExpense, cannotDecide, MANAGER_LIMIT } from '../lib/metabos/biz/expenses';
import { addMember, listMembers } from '../lib/metabos/biz/members';
import { founderDashboard, setCash, requestFounderBrief, readFounderBrief } from '../lib/metabos/biz/dashboard';
import { InferenceStore } from '../lib/metabos/inference/store';
import { routes } from '../lib/metabos/inference/routing';
import { runServerOnce } from '../lib/metabos/inference/providers';

const env = { META_MODEL_API_KEY: 'fixture', MUZEBOS_INFERENCE_PAID: '1', MUZEBOS_META_MODEL: 'muse-spark-1.3' };
const opened: BusinessStore[] = [];
const fresh = () => { const b = new BusinessStore(':memory:'); opened.push(b); return b; };
afterEach(() => opened.splice(0).forEach((b) => b.close()));
const reply = (content: string) => (async () => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }))) as unknown as typeof fetch;
const approveAndRun = async (b: BusinessStore, id: string, out: string) => { const s = new InferenceStore(b, () => routes(env)); const t = s.task(id); s.approve(t.id, t.hash); await runServerOnce(s, 'test', env, reply(out)); };
function invoice(b: BusinessStore, customerId: string, total: number, createdAt: string, paid: boolean) {
  const c = b.customers().find((x) => x.id === customerId)!; const o = randomUUID();
  const payload = JSON.stringify({ merchant: {}, customer: c, lines: [], currency: 'INR', subtotal: total, tax: 0, total });
  b.db.prepare("INSERT INTO mb_orders(id,customerId,status,payload,hash,expiresAt,createdAt) VALUES (?,?,'issued',?,'h',?,?)").run(o, customerId, payload, createdAt, createdAt);
  b.db.prepare('INSERT INTO mb_invoices(id,number,orderId,payload,createdAt,payment) VALUES (?,?,?,?,?,?)').run(randomUUID(), randomUUID(), o, payload, createdAt, paid ? 'manually_reconciled' : 'pending');
}

describe('sales pipeline', () => {
  it('weights deals by stage probability, allows overrides while open, freezes closed deals', () => {
    const b = fresh();
    const a = createDeal(b, { title: 'Cafe Rio wholesale', amount: 100_000_00 });
    const c = createDeal(b, { title: 'Hotel linen', amount: 40_000_00, stage: 'proposal' });
    expect(winProbability(a)).toBe(10);
    moveDeal(b, a.id, { stage: 'negotiation', probability: 60 });
    expect(pipelineSummary(b).weightedAmount).toBe(60_000_00 + 20_000_00);
    expect(() => moveDeal(b, c.id, { stage: 'lost' })).toThrow(/why/);
    moveDeal(b, c.id, { stage: 'won' });
    expect(() => moveDeal(b, c.id, { stage: 'lead' })).toThrow(/closed/);
    expect(pipelineSummary(b).winRate).toBe(100);
    expect(() => createDeal(b, { title: 'x y', amount: 1.5 })).toThrow();
  });
  it('Muse Spark next-step advice goes through the inference gate and never changes the deal', async () => {
    const b = fresh(); const d = createDeal(b, { title: 'Cafe Rio wholesale', amount: 100_000_00 });
    const t = requestNextStep(b, d.id, { env, paidConsent: true });
    expect(() => readNextStep(b, t.id, { env })).toThrow(/approved/);
    await approveAndRun(b, t.id, '{"nextStep":"Send a sample box","probability":35}');
    expect(readNextStep(b, t.id, { env })).toMatchObject({ nextStep: 'Send a sample box', probability: 35, applied: false });
    expect(winProbability(b.db.prepare('SELECT * FROM mb_deals').get() as never)).toBe(10);
  });
});

describe('expense approvals', () => {
  it('nobody approves their own claim; managers are limited by department and amount', () => {
    const b = fresh();
    expect(listMembers(b)[0].role).toBe('owner');
    const fin = addMember(b, 'owner', { name: 'Meera', role: 'manager', department: 'finance' });
    const ops = addMember(b, 'owner', { name: 'Ravi', role: 'member', department: 'operations' });
    expect(() => addMember(b, fin.id, { name: 'X', role: 'owner', department: 'finance' })).toThrow(/owner/);
    const own = submitExpense(b, 'owner', { amount: 500_00, category: 'software', description: 'Domain renewal', spentOn: '2026-10-01' });
    expect(() => decideExpense(b, 'owner', { expenseId: own.id, decision: 'approve', hash: own.hash })).toThrow(/own expense/);
    expect(cannotDecide(b, fin.id, own)).toMatch(/department/);
    const big = submitExpense(b, ops.id, { amount: MANAGER_LIMIT + 1, category: 'shipping', description: 'Courier contract', spentOn: '2026-10-02', department: 'finance' });
    expect(() => decideExpense(b, fin.id, { expenseId: big.id, decision: 'approve', hash: big.hash })).toThrow(/limit/);
    expect(() => decideExpense(b, 'owner', { expenseId: big.id, decision: 'approve', hash: 'f'.repeat(64) })).toThrow(/match/);
    expect(decideExpense(b, 'owner', { expenseId: big.id, decision: 'approve', hash: big.hash }).status).toBe('approved');
    expect(() => decideExpense(b, 'owner', { expenseId: big.id, decision: 'reject', hash: big.hash, reason: 'x' })).toThrow(/final/);
    expect(() => b.db.prepare('UPDATE mb_expenses SET decidedBy=submittedBy WHERE id=?').run(own.id)).toThrow();
    expect(() => withdrawExpense(b, fin.id, own.id)).toThrow(/submitter/);
    expect(withdrawExpense(b, 'owner', own.id).status).toBe('withdrawn');
  });
});

describe('founder dashboard', () => {
  it('computes runway and repeat revenue from real records only', async () => {
    const b = fresh(); const now = new Date('2026-10-15T00:00:00Z');
    const a = b.customer({ name: 'Asha', email: 'a@example.com' }); const z = b.customer({ name: 'Zed', email: 'z@example.com' });
    expect(founderDashboard(b, now).runwayNote).toMatch(/Enter your cash/);
    for (const m of ['07', '08', '09']) invoice(b, a.id, 30_000_00, `2026-${m}-10T00:00:00Z`, true);
    invoice(b, z.id, 90_000_00, '2026-09-12T00:00:00Z', false);
    const mgr = addMember(b, 'owner', { name: 'Meera', role: 'manager', department: 'finance' });
    for (const m of ['07', '08', '09']) { const e = submitExpense(b, mgr.id, { amount: 50_000_00, category: 'supplies', description: 'Stock', spentOn: `2026-${m}-05` }); decideExpense(b, 'owner', { expenseId: e.id, decision: 'approve', hash: e.hash }); }
    setCash(b, 'owner', { amount: 200_000_00, asOf: '2026-10-01' });
    expect(() => setCash(b, mgr.id, { amount: 1, asOf: '2026-10-01' })).toThrow(/owner/);
    const d = founderDashboard(b, now);
    expect(d.avgCollected).toBe(30_000_00); expect(d.avgExpenses).toBe(50_000_00); expect(d.netBurn).toBe(20_000_00);
    expect(d.runwayMonths).toBe(10);
    expect(d.recurringCustomers).toBe(1); expect(d.recurringRevenue).toBe(30_000_00);
    expect(d.receivables).toBe(90_000_00);
    const t = requestFounderBrief(b, { env, paidConsent: true, now });
    await approveAndRun(b, t.id, '{"summary":"Runway is ten months at current burn.","risks":["One large unpaid invoice"]}');
    expect(readFounderBrief(b, t.id, { env }).risks).toHaveLength(1);
  });
});
