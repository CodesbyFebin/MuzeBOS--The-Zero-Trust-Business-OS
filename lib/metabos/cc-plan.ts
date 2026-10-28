/**
 * Command Center ask → review → act plans. Deterministic (no model): an ask is matched to
 * Friction Radar items by keyword; a person reviews the cited records; a person with jev.decide
 * approves the act step. Approval records the decision only. Nothing is sent or changed automatically.
 * If the matched records change between review and approval, approval is refused (stale review).
 */
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { BusinessError, type BusinessStore } from './store';
import { frictionRadar, type Friction, type FrictionKind } from './command-center';

export const STEP_STATES = ['blocked', 'ready', 'awaiting_approval', 'done', 'rejected'] as const;
export type StepState = typeof STEP_STATES[number];
export type StepKind = 'ask' | 'review' | 'act';
export type PlanStep = { idx: number; kind: StepKind; state: StepState; title: string; detail: string; decidedBy: string | null; decidedAt: string | null };
export type Plan = { id: string; ask: string; kinds: FrictionKind[]; status: 'open' | 'done' | 'rejected'; createdBy: string; createdAt: string; items: Friction[]; steps: PlanStep[] };

const KEYWORDS: [RegExp, FrictionKind[]][] = [
  [/overdue|unpaid|late|owe|invoice|collect/i, ['overdue_invoice', 'broken_promise']],
  [/promise/i, ['broken_promise']],
  [/payment|proof|claim|utr|bank|paid/i, ['unmatched_proof']],
  [/stock|inventory|sku|restock/i, ['low_stock', 'stock_unbalanced']],
  [/approv|waiting|pending run/i, ['approval_waiting']],
  [/order/i, ['order_awaiting_review']],
  [/audit|evidence|chain|tamper/i, ['audit_chain_broken']],
  [/upi|qr/i, ['merchant_upi_missing']],
];
export function kindsForAsk(ask: string): FrictionKind[] {
  const k = new Set<FrictionKind>(); for (const [re, ks] of KEYWORDS) if (re.test(ask)) ks.forEach((x) => k.add(x));
  return [...k];
}
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const matched = (store: BusinessStore, kinds: FrictionKind[], nowMs: number) => frictionRadar(store, nowMs).filter((f) => !kinds.length || kinds.includes(f.kind));
const hashItems = (items: Friction[]) => sha(JSON.stringify(items.map((f) => [f.kind, f.title, f.detail, f.refs])));

function ensure(store: BusinessStore) {
  store.db.exec(`
    CREATE TABLE IF NOT EXISTS mb_plans(id TEXT PRIMARY KEY, ask TEXT NOT NULL, kinds TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('open','done','rejected')), createdBy TEXT NOT NULL, createdAt TEXT NOT NULL, reviewedHash TEXT);
    CREATE TABLE IF NOT EXISTS mb_plan_steps(planId TEXT NOT NULL REFERENCES mb_plans(id), idx INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('ask','review','act')), state TEXT NOT NULL CHECK(state IN ('blocked','ready','awaiting_approval','done','rejected')), title TEXT NOT NULL, detail TEXT NOT NULL, decidedBy TEXT, decidedAt TEXT, PRIMARY KEY(planId, idx));`);
}
const setStep = (store: BusinessStore, planId: string, idx: number, state: StepState, detail: string | null, by: string | null, at: string | null) =>
  store.db.prepare('UPDATE mb_plan_steps SET state=?, detail=COALESCE(?, detail), decidedBy=COALESCE(?, decidedBy), decidedAt=COALESCE(?, decidedAt) WHERE planId=? AND idx=?').run(state, detail, by, at, planId, idx);

export const AskInput = z.object({ ask: z.string().trim().min(3).max(300) }).strict();
export function askPlan(store: BusinessStore, actor: string, raw: unknown, nowMs = Date.now()): Plan {
  ensure(store); const { ask } = AskInput.parse(raw); const kinds = kindsForAsk(ask); const items = matched(store, kinds, nowMs);
  const id = randomUUID(); const at = new Date(nowMs).toISOString();
  const scope = kinds.length ? kinds.map((k) => k.replace(/_/g, ' ')).join(', ') : 'all friction (no keyword matched)';
  store.transact(() => {
    store.db.prepare('INSERT INTO mb_plans VALUES(?,?,?,?,?,?,NULL)').run(id, ask, JSON.stringify(kinds), 'open', actor, at);
    const ins = store.db.prepare('INSERT INTO mb_plan_steps VALUES(?,?,?,?,?,?,?,?)');
    ins.run(id, 0, 'ask', 'done', 'Ask recorded', `Scope: ${scope}. ${items.length} matching item(s) in stored records.`, actor, at);
    ins.run(id, 1, 'review', items.length ? 'ready' : 'done', 'Review the cited records', items.length ? 'Confirm the items below match the records you see.' : 'Nothing matched; nothing to review.', null, items.length ? null : at);
    ins.run(id, 2, 'act', 'blocked', 'Approve the playbook actions', items.length ? 'Waiting for review.' : 'Nothing to act on.', null, null);
    if (!items.length) store.db.prepare("UPDATE mb_plans SET status='done' WHERE id=?").run(id);
    store.appendEvidence('plan.ask', actor, `Plan ${id.slice(0, 8)}: "${ask.slice(0, 80)}" → ${items.length} item(s)`);
  });
  return plan(store, id, nowMs);
}
export function reviewPlan(store: BusinessStore, actor: string, planId: string, nowMs = Date.now()): Plan {
  ensure(store); const p = plan(store, planId, nowMs);
  if (p.steps[1].state !== 'ready') throw new BusinessError(`Review step is ${p.steps[1].state}, not ready`, 409);
  const at = new Date(nowMs).toISOString();
  store.transact(() => {
    store.db.prepare('UPDATE mb_plans SET reviewedHash=? WHERE id=?').run(hashItems(p.items), planId);
    setStep(store, planId, 1, 'done', `Reviewed ${p.items.length} item(s).`, actor, at);
    setStep(store, planId, 2, 'awaiting_approval', `Needs a person with jev.decide. Approving records the decision; each playbook still has to be carried out from its page.`, null, null);
    store.appendEvidence('plan.review', actor, `Plan ${planId.slice(0, 8)} reviewed (${p.items.length} item(s))`);
  });
  return plan(store, planId, nowMs);
}
export function decidePlan(store: BusinessStore, actor: string, planId: string, approve: boolean, nowMs = Date.now()): Plan {
  ensure(store); const p = plan(store, planId, nowMs);
  if (p.steps[2].state !== 'awaiting_approval') throw new BusinessError(`Act step is ${p.steps[2].state}, not awaiting approval`, 409);
  const row = store.db.prepare('SELECT reviewedHash FROM mb_plans WHERE id=?').get(planId) as { reviewedHash: string | null };
  const at = new Date(nowMs).toISOString();
  if (approve && row.reviewedHash !== hashItems(p.items)) {
    store.transact(() => {
      store.db.prepare('UPDATE mb_plans SET reviewedHash=NULL WHERE id=?').run(planId);
      setStep(store, planId, 1, 'ready', 'Records changed since review. Review again.', null, null);
      setStep(store, planId, 2, 'blocked', 'Waiting for a fresh review.', null, null);
      store.appendEvidence('plan.stale', actor, `Plan ${planId.slice(0, 8)} approval refused: records changed since review`);
    });
    throw new BusinessError('Records changed since review; review again before approving', 409);
  }
  store.transact(() => {
    setStep(store, planId, 2, approve ? 'done' : 'rejected', approve ? 'Approved. Decision recorded; nothing was sent or changed automatically.' : 'Rejected.', actor, at);
    store.db.prepare('UPDATE mb_plans SET status=? WHERE id=?').run(approve ? 'done' : 'rejected', planId);
    store.appendEvidence(approve ? 'plan.approve' : 'plan.reject', actor, `Plan ${planId.slice(0, 8)} ${approve ? 'approved' : 'rejected'}`);
  });
  return plan(store, planId, nowMs);
}
type Row = { id: string; ask: string; kinds: string; status: Plan['status']; createdBy: string; createdAt: string };
export function plan(store: BusinessStore, id: string, nowMs = Date.now()): Plan {
  ensure(store); const r = store.db.prepare('SELECT * FROM mb_plans WHERE id=?').get(id) as Row | undefined;
  if (!r) throw new BusinessError('Plan not found', 404);
  const kinds = JSON.parse(r.kinds) as FrictionKind[];
  const steps = store.db.prepare('SELECT idx, kind, state, title, detail, decidedBy, decidedAt FROM mb_plan_steps WHERE planId=? ORDER BY idx').all(id) as PlanStep[];
  return { id: r.id, ask: r.ask, kinds, status: r.status, createdBy: r.createdBy, createdAt: r.createdAt, items: matched(store, kinds, nowMs), steps };
}
export function plans(store: BusinessStore, limit = 20, nowMs = Date.now()): Plan[] {
  ensure(store); return (store.db.prepare('SELECT id FROM mb_plans ORDER BY createdAt DESC, rowid DESC LIMIT ?').all(limit) as { id: string }[]).map((r) => plan(store, r.id, nowMs));
}
