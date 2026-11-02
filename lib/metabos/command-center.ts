/**
 * Command Center: Friction Radar plus six features, all computed from stored records.
 * No model call is made here; every item cites the record it came from.
 */
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { BusinessError, type BusinessStore } from './store';
import { WorkflowEngine } from './workflows';
import { findOverdue } from './overdue-core';
import { stockLedger } from './records';

export const DAY_MS = 86_400_000;
export const LOW_STOCK_DEFAULT = 5;
type Ref = { record: string; id: string };
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

function ensure(store: BusinessStore) {
  store.db.exec(`
    CREATE TABLE IF NOT EXISTS mb_promises(id TEXT PRIMARY KEY, invoiceId TEXT REFERENCES mb_invoices(id), party TEXT NOT NULL, text TEXT NOT NULL, dueAt TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('open','kept','dropped')), createdAt TEXT NOT NULL, closedAt TEXT);
    CREATE TABLE IF NOT EXISTS mb_payment_proofs(id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE, amount INTEGER NOT NULL CHECK(amount>0), payer TEXT NOT NULL, note TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','matched','rejected')), invoiceId TEXT, receivedAt TEXT NOT NULL, decidedAt TEXT);`);
}

// ── 2 Promise Tracker ──────────────────────────────────────────────────────
export const PromiseInput = z.object({ party: z.string().trim().min(1).max(120), text: z.string().trim().min(1).max(300), dueAt: z.string().datetime(), invoiceId: z.string().uuid().nullable().default(null) }).strict();
export type PromiseRow = { id: string; invoiceId: string | null; party: string; text: string; dueAt: string; status: 'open' | 'kept' | 'dropped'; createdAt: string; closedAt: string | null };
export function addPromise(store: BusinessStore, raw: unknown) {
  ensure(store); const p = PromiseInput.parse(raw);
  if (p.invoiceId && !store.invoices().some((i) => i.id === p.invoiceId)) throw new BusinessError('Invoice not found', 404);
  const row: PromiseRow = { id: randomUUID(), ...p, status: 'open', createdAt: new Date().toISOString(), closedAt: null };
  return store.transact(() => { store.db.prepare('INSERT INTO mb_promises VALUES(@id,@invoiceId,@party,@text,@dueAt,@status,@createdAt,@closedAt)').run(row); store.appendEvidence('promise.recorded', row.id, `${row.party}: ${row.text} by ${row.dueAt.slice(0, 10)}`); return row; });
}
export function closePromise(store: BusinessStore, id: string, status: 'kept' | 'dropped') {
  ensure(store); const r = store.db.prepare('UPDATE mb_promises SET status=?, closedAt=? WHERE id=? AND status=\'open\'').run(status, new Date().toISOString(), id);
  if (!r.changes) throw new BusinessError('Open promise not found', 404); store.appendEvidence(`promise.${status}`, id, `Marked ${status} by a person`);
}
/** A promise linked to an invoice is "kept" only by a recorded bank reference, never by a claim. */
export function promises(store: BusinessStore, nowMs = Date.now()) {
  ensure(store); const inv = new Map(store.invoices().map((i) => [i.id, i]));
  return (store.db.prepare('SELECT * FROM mb_promises ORDER BY dueAt').all() as PromiseRow[]).map((p) => {
    const linked = p.invoiceId ? inv.get(p.invoiceId) : undefined;
    const state = p.status !== 'open' ? p.status : linked?.payment === 'manually_reconciled' ? 'kept' : Date.parse(p.dueAt) < nowMs ? 'broken' : 'open';
    return { ...p, state, evidence: linked ? { record: 'mb_invoices', id: linked.id, payment: linked.payment, reference: linked.reference } : null };
  });
}

// ── 3 Payment Proof Inbox ──────────────────────────────────────────────────
export const ProofInput = z.object({ reference: z.string().trim().regex(/^[A-Za-z0-9-]{6,40}$/), amount: z.number().int().min(1).max(10_000_000_000), payer: z.string().trim().min(1).max(120), note: z.string().trim().max(300).default('') }).strict();
export type Proof = { id: string; reference: string; amount: number; payer: string; note: string; status: 'pending' | 'matched' | 'rejected'; invoiceId: string | null; receivedAt: string; decidedAt: string | null };
export function submitProof(store: BusinessStore, raw: unknown) {
  ensure(store); const p = ProofInput.parse(raw);
  if (store.db.prepare('SELECT 1 FROM mb_payment_proofs WHERE reference=?').get(p.reference) || store.invoices().some((i) => i.reference === p.reference)) throw new BusinessError('This reference was already submitted or used', 409);
  const row: Proof = { id: randomUUID(), ...p, status: 'pending', invoiceId: null, receivedAt: new Date().toISOString(), decidedAt: null };
  return store.transact(() => { store.db.prepare('INSERT INTO mb_payment_proofs VALUES(@id,@reference,@amount,@payer,@note,@status,@invoiceId,@receivedAt,@decidedAt)').run(row); store.appendEvidence('proof.received', row.id, `Claimed payment ref ${row.reference}, ${row.amount} paise`); return row; });
}
/** Candidates: pending invoices whose stored total equals the claimed amount exactly. Suggestion only. */
export function proofInbox(store: BusinessStore) {
  ensure(store); const pending = store.invoices().filter((i) => i.payment === 'pending' && !i.reference);
  return (store.db.prepare('SELECT * FROM mb_payment_proofs ORDER BY receivedAt DESC').all() as Proof[]).map((p) => ({ ...p, candidates: p.status !== 'pending' ? [] : pending.filter((i) => i.payload.total === p.amount).map((i) => ({ invoiceId: i.id, number: i.number, customer: i.payload.customer.name, total: i.payload.total })) }));
}
export function decideProof(store: BusinessStore, proofId: string, decision: { accept: true; invoiceId: string } | { accept: false; reason: string }) {
  ensure(store); const p = store.db.prepare('SELECT * FROM mb_payment_proofs WHERE id=?').get(proofId) as Proof | undefined;
  if (!p) throw new BusinessError('Proof not found', 404); if (p.status !== 'pending') throw new BusinessError(`Proof is already ${p.status}`, 409);
  const t = new Date().toISOString();
  if (!decision.accept) { store.db.prepare("UPDATE mb_payment_proofs SET status='rejected', decidedAt=? WHERE id=?").run(t, proofId); store.appendEvidence('proof.rejected', proofId, decision.reason.slice(0, 200)); return; }
  const inv = store.invoices().find((i) => i.id === decision.invoiceId);
  if (!inv) throw new BusinessError('Invoice not found', 404);
  if (inv.payload.total !== p.amount) { store.appendEvidence('proof.mismatch_refused', proofId, `Claimed ${p.amount} ≠ invoice ${inv.number} total ${inv.payload.total}`); throw new BusinessError('Claimed amount does not equal the invoice total', 409); }
  store.transact(() => { store.reconcile(inv.id, p.reference); store.db.prepare("UPDATE mb_payment_proofs SET status='matched', invoiceId=?, decidedAt=? WHERE id=?").run(inv.id, t, proofId); store.appendEvidence('proof.matched', proofId, `Matched to ${inv.number} by a person`); });
}

// ── 1 Friction Radar + 7 Exception Playbooks ───────────────────────────────
export type FrictionKind = 'audit_chain_broken' | 'overdue_invoice' | 'broken_promise' | 'unmatched_proof' | 'approval_waiting' | 'order_awaiting_review' | 'stock_unbalanced' | 'low_stock' | 'merchant_upi_missing';
export const PLAYBOOKS: Record<FrictionKind, { title: string; steps: string[]; href: string }> = {
  audit_chain_broken: { title: 'Audit chain does not verify', steps: ['Stop approving or issuing.', 'Export evidence to record the state.', 'Restore the last verified backup.', 'Find the first row that fails verification.'], href: '/workspace/evidence' },
  overdue_invoice: { title: 'Invoice past its due date', steps: ['Check the Payment Proof Inbox for a matching claim.', 'Draft a reminder and approve the exact text.', 'Record any promised date in the Promise Tracker.'], href: '/workspace/money/overdue' },
  broken_promise: { title: 'A promise passed its date', steps: ['Confirm with a bank reference whether it was met.', 'If not, contact the party and record a new date or drop it.'], href: '/workspace/money/command-center#promises' },
  unmatched_proof: { title: 'Payment claim waiting', steps: ['Check the bank statement for the reference.', 'Match to the invoice with the same total, or reject with a reason.', 'Never mark paid from a screenshot alone.'], href: '/workspace/money/command-center#proofs' },
  approval_waiting: { title: 'Run waiting for approval', steps: ['Review the planned payload.', 'Approve the exact hash or reject. Runs expire on their deadline.'], href: '/workspace/money/command-center#bundles' },
  order_awaiting_review: { title: 'Order draft not reviewed', steps: ['Review lines and totals.', 'Approve and issue, or reject.'], href: '/workspace/orders' },
  stock_unbalanced: { title: 'Stock does not match its ledger', steps: ['Count the shelf.', 'Record a stock move with a reason so the ledger balances.', 'Look for direct edits in the evidence log.'], href: '/workspace/money/command-center#radar' },
  low_stock: { title: 'Low stock', steps: ['Start the low-stock reminder workflow.', 'Approve the restock list.'], href: '/workspace/orders' },
  merchant_upi_missing: { title: 'No UPI ID configured', steps: ['Add the merchant UPI ID so invoices can carry a payment QR.'], href: '/workspace/account' },
};
const SEVERITY: Record<FrictionKind, number> = { audit_chain_broken: 0, stock_unbalanced: 1, overdue_invoice: 1, broken_promise: 1, unmatched_proof: 2, approval_waiting: 2, order_awaiting_review: 3, low_stock: 3, merchant_upi_missing: 4 };
export type Friction = { kind: FrictionKind; severity: number; title: string; detail: string; refs: Ref[]; playbook: typeof PLAYBOOKS[FrictionKind] };
export function frictionRadar(store: BusinessStore, nowMs = Date.now(), lowStock = LOW_STOCK_DEFAULT): Friction[] {
  const out: Omit<Friction, 'severity' | 'playbook'>[] = [];
  if (!store.verifyAudit()) out.push({ kind: 'audit_chain_broken', title: 'Evidence chain does not verify', detail: 'verifyAudit() returned false', refs: [{ record: 'mb_audit', id: '*' }] });
  for (const f of findOverdue(store, nowMs)) out.push({ kind: 'overdue_invoice', title: `${f.number} · ${f.customerName}`, detail: `${f.daysOverdue} days past derived due date (${f.termsSource === 'configured' ? 'configured' : 'assumed'} ${f.termsDays}-day terms)`, refs: [{ record: 'mb_invoices', id: f.invoiceId }] });
  for (const p of promises(store, nowMs)) if (p.state === 'broken') out.push({ kind: 'broken_promise', title: `${p.party}: ${p.text}`, detail: `Due ${p.dueAt.slice(0, 10)}, no bank reference recorded`, refs: [{ record: 'mb_promises', id: p.id }] });
  for (const p of proofInbox(store)) if (p.status === 'pending') out.push({ kind: 'unmatched_proof', title: `Claim ${p.reference} from ${p.payer}`, detail: `${p.candidates.length} invoice(s) with the exact amount`, refs: [{ record: 'mb_payment_proofs', id: p.id }] });
  for (const r of new WorkflowEngine(store, { clock: () => nowMs }).runs(200)) if (r.status === 'awaiting_approval') out.push({ kind: 'approval_waiting', title: r.workflowId, detail: `Deadline ${r.deadlineAt}`, refs: [{ record: 'mb_workflow_runs', id: r.id }] });
  for (const o of store.orders()) if (o.status === 'awaiting_review') out.push({ kind: 'order_awaiting_review', title: `Order for ${o.payload.customer.name}`, detail: `Drafted ${o.createdAt.slice(0, 10)}`, refs: [{ record: 'mb_orders', id: o.id }] });
  for (const l of stockLedger(store)) if (!l.balanced) out.push({ kind: 'stock_unbalanced', title: l.sku, detail: `stock ${l.stock} ≠ opening ${l.opening ?? 'unknown'} + orders ${l.orderMovements} + moves ${l.stockMoves}`, refs: [{ record: 'mb_products', id: l.productId }] });
  for (const p of store.products()) if (p.stock <= lowStock) out.push({ kind: 'low_stock', title: `${p.sku} · ${p.name}`, detail: `${p.stock} left (threshold ${lowStock}, default)`, refs: [{ record: 'mb_products', id: p.id }] });
  if (!store.merchant().upi) out.push({ kind: 'merchant_upi_missing', title: 'Merchant UPI ID not set', detail: 'Invoice QR codes are unavailable', refs: [{ record: 'mb_settings', id: 'merchant' }] });
  return out.map((f) => ({ ...f, severity: SEVERITY[f.kind], playbook: PLAYBOOKS[f.kind] })).sort((a, b) => a.severity - b.severity);
}

// ── 4 Verified Business Brief ──────────────────────────────────────────────
/** Every figure is a deterministic aggregate with its SQL/source; no generated prose. */
export function verifiedBrief(store: BusinessStore, nowMs = Date.now()) {
  const inv = store.invoices(); const pend = inv.filter((i) => i.payment === 'pending');
  const sum = (xs: typeof inv) => xs.reduce((a, i) => a + i.payload.total, 0);
  const radar = frictionRadar(store, nowMs);
  const facts = [
    { label: 'Invoices issued', value: inv.length, source: 'count(mb_invoices)' },
    { label: 'Outstanding (paise)', value: sum(pend), source: "sum(payload.total) where payment='pending'" },
    { label: 'Collected with bank reference (paise)', value: sum(inv.filter((i) => i.payment === 'manually_reconciled')), source: "sum(payload.total) where payment='manually_reconciled'" },
    { label: 'Overdue invoices', value: radar.filter((f) => f.kind === 'overdue_invoice').length, source: 'findOverdue()' },
    { label: 'Payment claims waiting', value: radar.filter((f) => f.kind === 'unmatched_proof').length, source: "mb_payment_proofs where status='pending'" },
    { label: 'Runs awaiting approval', value: radar.filter((f) => f.kind === 'approval_waiting').length, source: "mb_workflow_runs where status='awaiting_approval'" },
    { label: 'Open friction items', value: radar.length, source: 'frictionRadar()' },
  ];
  const chainIntact = store.verifyAudit(); const ev = store.evidence();
  const body = JSON.stringify({ facts, chainIntact, lastSeq: ev.at(-1)?.seq ?? 0 });
  return { generatedAt: new Date(nowMs).toISOString(), facts, chainIntact, asOfEvidenceSeq: ev.at(-1)?.seq ?? 0, digest: sha(body), mode: 'computed' as const, note: chainIntact ? 'Computed from stored records; evidence chain verified.' : 'UNVERIFIED: evidence chain does not verify.' };
}

// ── 5 Approval Bundles ─────────────────────────────────────────────────────
const bundleHashOf = (runs: { id: string; payloadHash: string }[]) => sha(runs.map((r) => `${r.id}:${r.payloadHash}`).sort().join('\n'));
export function approvalBundles(store: BusinessStore, engine = new WorkflowEngine(store)) {
  const by = new Map<string, { id: string; payloadHash: string; deadlineAt: string }[]>();
  for (const r of engine.runs(500)) if (r.status === 'awaiting_approval') by.set(r.workflowId, [...(by.get(r.workflowId) ?? []), { id: r.id, payloadHash: r.payloadHash, deadlineAt: r.deadlineAt }]);
  return [...by].map(([workflowId, runs]) => ({ workflowId, runs, bundleHash: bundleHashOf(runs) }));
}
/** Approve (not execute) every run in the bundle iff the bundle hash still matches; any drift approves nothing. */
export function approveBundle(store: BusinessStore, workflowId: string, bundleHash: string, engine = new WorkflowEngine(store)) {
  const b = approvalBundles(store, engine).find((x) => x.workflowId === workflowId);
  if (!b || b.bundleHash !== bundleHash) { store.appendEvidence('bundle.denied', workflowId, `Bundle hash ${bundleHash.slice(0, 12)} is stale or unknown; nothing approved`); throw new BusinessError('Bundle changed since review; nothing approved', 409); }
  const results = b.runs.map((r) => { const { run, denied } = engine.tryApprove(r.id, r.payloadHash); return { runId: r.id, status: run.status, denied }; });
  store.appendEvidence('bundle.approved', workflowId, `${results.filter((r) => !r.denied).length}/${results.length} runs approved under ${bundleHash.slice(0, 12)}`);
  return results;
}

// ── 6 Near-Miss Memory ─────────────────────────────────────────────────────
const NEAR = /(denied|timed_out|verify_failed|mismatch_refused|rejected|stale|not_sent|fallback)/;
export function nearMisses(store: BusinessStore, limit = 100) {
  const rows = store.evidence().filter((e) => NEAR.test(e.action)).reverse().slice(0, limit);
  const counts: Record<string, number> = {}; for (const r of rows) counts[r.action] = (counts[r.action] ?? 0) + 1;
  return { counts, items: rows.map((r) => ({ seq: r.seq, action: r.action, target: r.target, detail: r.detail.slice(0, 200), at: r.createdAt })), note: 'Blocked or refused actions, read from the evidence log. Each one is something that was stopped, not something that happened.' };
}

export function commandCenter(store: BusinessStore, nowMs = Date.now()) {
  return { radar: frictionRadar(store, nowMs), promises: promises(store, nowMs), proofs: proofInbox(store), brief: verifiedBrief(store, nowMs), bundles: approvalBundles(store), nearMisses: nearMisses(store), playbooks: PLAYBOOKS };
}
