/**
 * Evidence-chain verification for hot read paths (MuZe home). A full walk of mb_audit on every GET is O(rows).
 * Here: rows appended since the last check are verified incrementally from the last verified hash, and the whole
 * chain is re-walked at most every FULL_MS (so an edit to an old row is still caught within that window).
 * A broken chain is never cached as valid.
 */
import { digest, type BusinessStore } from './store';
export const FULL_MS = 30_000;
type State = { seq: number; hash: string; fullAt: number };
const cache = new WeakMap<BusinessStore, State>();
type Row = { seq: number; hash: string; previousHash: string } & Record<string, unknown>;
const walk = (rows: Row[], previous: string) => { for (const r of rows) { const { seq: _s, hash, ...body } = r; if (body.previousHash !== previous || digest(body) !== hash) return null; previous = hash; } return previous; };
export function verifyAuditCached(s: BusinessStore, now = Date.now()): boolean {
  const c = cache.get(s);
  if (!c || now - c.fullAt >= FULL_MS) {
    const rows = s.db.prepare('SELECT * FROM mb_audit ORDER BY seq').all() as Row[]; const last = walk(rows, 'GENESIS');
    if (last === null) { cache.delete(s); return false; }
    cache.set(s, { seq: rows.at(-1)?.seq ?? 0, hash: last, fullAt: now }); return true;
  }
  const rows = s.db.prepare('SELECT * FROM mb_audit WHERE seq > ? ORDER BY seq').all(c.seq) as Row[]; if (!rows.length) return true;
  const last = walk(rows, c.hash); if (last === null) { cache.delete(s); return false; }
  cache.set(s, { ...c, seq: rows.at(-1)!.seq, hash: last }); return true;
}
/** Test hook. */
export const resetAuditCache = (s: BusinessStore) => cache.delete(s);
