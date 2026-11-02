/**
 * Per-department permission walls. Each department (agent role) reads only the data scopes
 * mapped to it; every refused read is recorded as evidence. Clean-room design based on the
 * observed behaviour of Agent-Staff (department data isolation); no code or text used.
 * Built during the Meta Global AI Developer Hackathon.
 */
import { BusinessError, type BusinessStore } from '../store';
import { DEPARTMENTS, type Department } from './members';
import { listExpenses } from './expenses';
import { listDeals } from './pipeline';
import { cash } from './dashboard';

export const SCOPES = ['customers', 'invoices', 'expenses', 'pipeline', 'cash'] as const;
export type Scope = typeof SCOPES[number];
/** Which data each department may read. Anything not listed is behind the wall. */
export const WALLS: Record<Department, readonly Scope[]> = {
  inventory: ['pipeline'],
  customers: ['customers', 'pipeline'],
  finance: ['customers', 'invoices', 'expenses', 'cash'],
  operations: ['expenses'],
  writer: [],
};
export function canRead(department: Department, scope: Scope) { return WALLS[department].includes(scope); }
/** Reads a scope for a department, or refuses with 403 and an evidence entry. Operations sees only its own expenses. */
export function readScope(s: BusinessStore, department: string, scope: string): unknown[] {
  if (!(DEPARTMENTS as readonly string[]).includes(department)) throw new BusinessError('Unknown department', 400);
  if (!(SCOPES as readonly string[]).includes(scope)) throw new BusinessError('Unknown scope', 400);
  const d = department as Department; const sc = scope as Scope;
  if (!canRead(d, sc)) { s.transact(() => s.appendEvidence('wall.refused', `${d}:${sc}`, `${d} may not read ${sc}`)); throw new BusinessError(`The ${d} department cannot read ${sc}`, 403); }
  if (sc === 'customers') return s.customers();
  if (sc === 'invoices') return s.invoices();
  if (sc === 'pipeline') return listDeals(s);
  if (sc === 'expenses') return listExpenses(s).filter((e) => d === 'finance' || e.department === d);
  const c = cash(s); return c ? [c] : [];
}
export function wallMatrix() { return DEPARTMENTS.map((d) => ({ department: d, scopes: SCOPES.map((sc) => ({ scope: sc, allowed: canRead(d, sc) })) })); }
