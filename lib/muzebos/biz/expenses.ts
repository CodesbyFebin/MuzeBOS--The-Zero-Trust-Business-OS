/**
 * Expense claims with a no-self-approval rule, designed for multi-user use. Clean-room design based
 * on the observed behaviour of boombignose-erp-harness-ai (AGPL-3.0; behaviour only, no code) and
 * coreBOS. Rules, all enforced on the server:
 *  - Nobody approves or rejects their own claim, whatever their role.
 *  - Only an owner or a manager may decide; a manager only within their own department and up to
 *    MANAGER_LIMIT. Above that, an owner must decide.
 *  - A decision is bound to the hash of the exact claim, as Jev does, so an edited claim cannot ride
 *    an old approval. Decided claims are frozen.
 * Built during the Meta Global AI Developer Hackathon.
 */
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { BusinessError, type BusinessStore } from '../store';
import { member, DEPARTMENTS, type Department } from './members';

export const MANAGER_LIMIT = 25_000_00; // ₹25,000 in paise
export const EXPENSE_CATEGORIES = ['travel', 'supplies', 'software', 'marketing', 'shipping', 'other'] as const;
export type ExpenseStatus = 'submitted' | 'approved' | 'rejected' | 'withdrawn';
export type Expense = { id: string; submittedBy: string; department: Department; amount: number; category: string; description: string; spentOn: string; status: ExpenseStatus; hash: string; decidedBy: string | null; decidedAt: string | null; reason: string | null; createdAt: string };
const Input = z.object({ amount: z.number().int().min(1).max(100_000_000_00), category: z.enum(EXPENSE_CATEGORIES), description: z.string().trim().min(3).max(500), spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), department: z.enum(DEPARTMENTS).optional() }).strict();

function ensure(s: BusinessStore) {
  s.db.exec(`CREATE TABLE IF NOT EXISTS mb_expenses (id TEXT PRIMARY KEY, submittedBy TEXT NOT NULL, department TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0), category TEXT NOT NULL, description TEXT NOT NULL, spentOn TEXT NOT NULL, status TEXT NOT NULL, hash TEXT NOT NULL, decidedBy TEXT, decidedAt TEXT, reason TEXT, createdAt TEXT NOT NULL, CHECK(decidedBy IS NULL OR decidedBy <> submittedBy))`);
}
const hashOf = (e: Pick<Expense, 'id' | 'submittedBy' | 'department' | 'amount' | 'category' | 'description' | 'spentOn'>) => createHash('sha256').update(JSON.stringify([e.id, e.submittedBy, e.department, e.amount, e.category, e.description, e.spentOn])).digest('hex');

export function submitExpense(s: BusinessStore, actorId: string, raw: unknown): Expense {
  ensure(s); const who = member(s, actorId); const d = Input.parse(raw);
  const base = { id: randomUUID(), submittedBy: who.id, department: d.department ?? who.department, amount: d.amount, category: d.category, description: d.description, spentOn: d.spentOn };
  const e: Expense = { ...base, status: 'submitted', hash: hashOf(base), decidedBy: null, decidedAt: null, reason: null, createdAt: new Date().toISOString() };
  s.transact(() => { s.db.prepare('INSERT INTO mb_expenses VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(e.id, e.submittedBy, e.department, e.amount, e.category, e.description, e.spentOn, e.status, e.hash, null, null, null, e.createdAt); s.appendEvidence('expense.submitted', e.id, `${e.amount} by ${who.id}`); });
  return e;
}
export function getExpense(s: BusinessStore, id: string): Expense { ensure(s); const e = s.db.prepare('SELECT * FROM mb_expenses WHERE id=?').get(id) as Expense | undefined; if (!e) throw new BusinessError('Expense not found', 404); return e; }
export function listExpenses(s: BusinessStore): Expense[] { ensure(s); return s.db.prepare('SELECT * FROM mb_expenses ORDER BY createdAt DESC, rowid DESC').all() as Expense[]; }

/** Why this actor may not decide this claim, or null if they may. Used by the UI and enforced in decide(). */
export function cannotDecide(s: BusinessStore, actorId: string, e: Expense): string | null {
  const who = member(s, actorId);
  if (who.id === e.submittedBy) return 'Nobody can approve their own expense';
  if (who.role === 'member') return 'Only an owner or a manager can decide expenses';
  if (who.role === 'manager' && who.department !== e.department) return 'Managers decide only their own department';
  if (who.role === 'manager' && e.amount > MANAGER_LIMIT) return 'Above the manager limit; an owner must decide';
  return null;
}
export function decideExpense(s: BusinessStore, actorId: string, raw: unknown): Expense {
  const c = z.object({ expenseId: z.string().max(64), decision: z.enum(['approve', 'reject']), hash: z.string().length(64), reason: z.string().trim().max(500).default('') }).strict().parse(raw);
  const e = getExpense(s, c.expenseId);
  if (e.status !== 'submitted') throw new BusinessError(`Expense is ${e.status}; decisions are final`, 409);
  if (c.hash !== e.hash || hashOf(e) !== e.hash) throw new BusinessError('Approval does not match the current claim', 409);
  const why = cannotDecide(s, actorId, e); if (why) { s.transact(() => s.appendEvidence('expense.decision.refused', e.id, `${actorId}: ${why}`)); throw new BusinessError(why, 403); }
  if (c.decision === 'reject' && !c.reason) throw new BusinessError('Give a reason for rejecting', 400);
  const status = c.decision === 'approve' ? 'approved' : 'rejected'; const t = new Date().toISOString();
  s.transact(() => { const r = s.db.prepare("UPDATE mb_expenses SET status=?, decidedBy=?, decidedAt=?, reason=? WHERE id=? AND status='submitted' AND hash=?").run(status, actorId, t, c.reason || null, e.id, e.hash); if (r.changes !== 1) throw new BusinessError('Expense changed; reload', 409); s.appendEvidence(`expense.${status}`, e.id, `by ${actorId}`); });
  return getExpense(s, e.id);
}
export function withdrawExpense(s: BusinessStore, actorId: string, id: string): Expense {
  const e = getExpense(s, id); if (e.submittedBy !== actorId) throw new BusinessError('Only the submitter can withdraw', 403);
  if (e.status !== 'submitted') throw new BusinessError(`Expense is ${e.status}`, 409);
  s.transact(() => { s.db.prepare("UPDATE mb_expenses SET status='withdrawn' WHERE id=? AND status='submitted'").run(id); s.appendEvidence('expense.withdrawn', id, `by ${actorId}`); });
  return getExpense(s, id);
}
