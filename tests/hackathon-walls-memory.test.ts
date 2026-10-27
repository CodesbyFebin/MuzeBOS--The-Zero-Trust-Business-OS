import { describe, it, expect, afterEach } from 'vitest';
import { BusinessStore } from '../lib/muzebos/store';
import { readScope, canRead } from '../lib/muzebos/biz/departments';
import { addMember } from '../lib/muzebos/biz/members';
import { submitExpense } from '../lib/muzebos/biz/expenses';
import { remember, agentDraft, promote, contextFor, requestCompaction, readCompaction, listMemory } from '../lib/muzebos/biz/memory';
import { InferenceStore } from '../lib/muzebos/inference/store';
import { routes } from '../lib/muzebos/inference/routing';
import { runServerOnce } from '../lib/muzebos/inference/providers';

const env = { META_MODEL_API_KEY: 'fixture', MUZEBOS_INFERENCE_PAID: '1', MUZEBOS_META_MODEL: 'muse-spark-1.3' };
const opened: BusinessStore[] = [];
const fresh = () => { const b = new BusinessStore(':memory:'); opened.push(b); return b; };
afterEach(() => opened.splice(0).forEach((b) => b.close()));
const reply = (content: string) => (async () => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }))) as unknown as typeof fetch;
const evidence = (b: BusinessStore, kind: string) => (b.db.prepare('SELECT COUNT(*) n FROM mb_audit WHERE action=?').get(kind) as { n: number }).n;

describe('department walls', () => {
  it('lets finance read invoices, refuses writer and logs the refusal, and keeps operations to its own expenses', () => {
    const b = fresh();
    expect(readScope(b, 'finance', 'invoices')).toEqual([]);
    expect(() => readScope(b, 'writer', 'customers')).toThrow(/cannot read customers/);
    expect(evidence(b, 'wall.refused')).toBe(1);
    expect(canRead('inventory', 'cash')).toBe(false);
    const m = addMember(b, 'owner', { name: 'Ravi', role: 'member', department: 'inventory' });
    submitExpense(b, 'owner', { amount: 100_00, category: 'supplies', description: 'Ops', spentOn: '2026-10-01' });
    submitExpense(b, m.id, { amount: 200_00, category: 'supplies', description: 'Inv', spentOn: '2026-10-01' });
    expect(readScope(b, 'operations', 'expenses')).toHaveLength(1);
    expect(readScope(b, 'finance', 'expenses')).toHaveLength(2);
    expect(() => readScope(b, 'nobody', 'expenses')).toThrow(/Unknown department/);
  });
});

describe('layered memory', () => {
  it('enforces who writes where, keeps agent notes as drafts, and builds wall-respecting context', () => {
    const b = fresh();
    const fin = addMember(b, 'owner', { name: 'Asha', role: 'member', department: 'finance' });
    remember(b, 'owner', { layer: 'L4', text: 'Owner prefers weekly cash summaries' });
    remember(b, fin.id, { layer: 'L2', scope: 'finance', text: 'GST filing is due on the 20th' });
    expect(() => remember(b, fin.id, { layer: 'L2', scope: 'customers', text: 'Not mine' })).toThrow(/own department/);
    expect(() => remember(b, fin.id, { layer: 'L4', text: 'Sneaky preference' })).toThrow(/owner/);
    remember(b, 'owner', { layer: 'L2', scope: 'customers', text: 'Customer Meena wants delivery on Fridays' });
    remember(b, fin.id, { layer: 'L1', scope: 's1', text: 'Discussed the overdue invoice today' });
    const draft = agentDraft(b, 'finance', { layer: 'L3', text: 'Agents think margins are thin' });
    expect(draft.status).toBe('draft');
    expect(() => agentDraft(b, 'finance', { layer: 'L2', scope: 'customers', text: 'Cross wall' })).toThrow(/own department/);
    expect(() => agentDraft(b, 'finance', { layer: 'L4', text: 'Owner wants' })).toThrow(/owner preferences/);
    let c = contextFor(b, 'finance', 's1', 'gst filing');
    expect(c.entries.map((e) => e.layer)).toEqual(['L4', 'L2', 'L1']);
    expect(c.entries.some((e) => e.text.includes('Meena'))).toBe(false);
    expect(() => promote(b, fin.id, draft.id)).toThrow(/owners and managers/);
    promote(b, 'owner', draft.id);
    c = contextFor(b, 'finance', 'other-session', 'margins');
    expect(c.entries.map((e) => e.layer)).toEqual(['L4', 'L3', 'L2']);
    expect(contextFor(b, 'finance', 's1', '', 40).entries).toHaveLength(1);
  });

  it('stores an approved Muse compaction only as an L3 draft, once', async () => {
    const b = fresh();
    expect(() => requestCompaction(b, { env })).toThrow(/No trusted/);
    remember(b, 'owner', { layer: 'L2', scope: 'finance', text: 'GST filing is due on the 20th' });
    const t = requestCompaction(b, { env, paidConsent: true });
    expect(() => readCompaction(b, t.id, { env })).toThrow(/approved, completed/);
    const s = new InferenceStore(b, () => routes(env)); s.approve(t.id, s.task(t.id).hash);
    await runServerOnce(s, 'test', env, reply('{"note":"GST is filed by the 20th."}'));
    const m = readCompaction(b, t.id, { env });
    expect(m).toMatchObject({ layer: 'L3', status: 'draft', author: `muse:${t.id}` });
    expect(() => readCompaction(b, t.id, { env })).toThrow(/already stored/);
    expect(listMemory(b)).toHaveLength(2);
  });
});
