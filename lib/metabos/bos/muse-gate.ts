/**
 * Two-reviewer gate for MUSE sends. A MUSE dispatch ("[MUSE plan]" body) cannot be approved by a single /api/dispatch decide:
 * Reviewer A signs, a different Reviewer B signs, and only then is the dispatch approved. One reject rejects it.
 */
import { z } from 'zod';
import { BusinessError, type BusinessStore } from '../store';
import { decide, listDispatches, needsTwoReviewersMarked } from '../dispatch/service';
import { reviewers } from './operator';
export const MuseReviewInput = z.object({ dispatchId: z.string().uuid(), payloadHash: z.string().regex(/^[0-9a-f]{64}$/), approve: z.boolean() }).strict();
const ensure = (s: BusinessStore) => s.db.exec('CREATE TABLE IF NOT EXISTS mb_bos_reviews(runId TEXT NOT NULL, reviewer TEXT NOT NULL, payloadHash TEXT NOT NULL, createdAt TEXT NOT NULL, PRIMARY KEY(runId, reviewer))');
export function isMuseDispatch(s: BusinessStore, id: string) {
  const d = listDispatches(s).find((x) => x.id === id); if (!d) return false;
  const p = d.payload as { body?: unknown; subject?: unknown };
  return String(p?.body ?? '').startsWith('[MUSE plan]') || String(p?.subject ?? '').startsWith('[MUSE plan]') || needsTwoReviewersMarked(s, id);
}
export function museReview(s: BusinessStore, reviewer: string, raw: unknown) {
  const i = MuseReviewInput.parse(raw); ensure(s);
  const d = listDispatches(s).find((x) => x.id === i.dispatchId); if (!d || !isMuseDispatch(s, d.id)) throw new BusinessError('Not a MUSE or two-reviewer dispatch', 404);
  if (d.status !== 'pending') throw new BusinessError(`Dispatch is ${d.status}`, 409);
  if (d.payloadHash !== i.payloadHash) throw new BusinessError('Payload hash does not match the proposal', 409);
  if (!i.approve) { s.transact(() => s.appendEvidence('bos.review.rejected', d.id, `Rejected by ${reviewer}`)); return { dispatch: decide(s, reviewer, d.id, d.payloadHash, false), reviewers: reviewers(s, d.id) }; }
  const prior = reviewers(s, d.id);
  if (prior.includes(reviewer)) throw new BusinessError('You already signed this send; a second, different reviewer must approve', 409);
  s.transact(() => { s.db.prepare('INSERT INTO mb_bos_reviews VALUES(?,?,?,?)').run(d.id, reviewer, d.payloadHash, new Date().toISOString()); s.appendEvidence('bos.review.signed', d.id, `Reviewer ${prior.length ? 'B' : 'A'}: ${reviewer}; payload ${d.payloadHash.slice(0, 12)}`); });
  if (prior.length === 0) return { dispatch: d, reviewers: reviewers(s, d.id) };
  return { dispatch: decide(s, reviewer, d.id, d.payloadHash, true), reviewers: reviewers(s, d.id) };
}
