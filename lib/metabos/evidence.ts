/**
 * Evidence explorer over the hash-chained audit log (mb_audit). Actor, entity and result
 * are DERIVED from the recorded action name; they are not separately signed fields.
 */
import { digest, type Audit } from './store';

export const EVIDENCE_EXPLANATION = {
  proves: [
    'Each event stores the hash of the previous event, and its own hash covers its action, target, detail, time and that previous hash.',
    'If any stored event is edited, removed or reordered after the fact, verification fails at that event and every later link.',
    'Events are written in the same database transaction as the change they describe, so a recorded change and its evidence commit together.',
  ],
  limits: [
    'The chain is stored in the same local SQLite file it protects. Anyone with write access to that file can rewrite the whole chain and recompute every hash; there is no external anchor, signature or timestamp authority yet.',
    'Deleting the newest events (truncating the tail) is not detectable without a copy of the latest hash kept elsewhere. Export and keep the head hash to detect this.',
    'Times come from this machine\'s clock and are not independently attested.',
    'Actor, entity and result are inferred from the action name. There is a single local operator, so "operator" is not a verified identity.',
    'Webhook events are recorded as signature-verified at receipt; their contents are not processed or verified further.',
  ],
} as const;

export type EvidenceRow = Audit & { actor: string; entity: string; result: 'success' | 'denied' | 'failed'; linkValid: boolean };
export function classify(action: string): { actor: string; entity: string; result: EvidenceRow['result'] } {
  const parts = action.split('.');
  const actor = parts[0] === 'webhook' ? 'webhook' : parts[0] === 'workflow' ? 'workflow engine' : 'operator';
  const entity = parts[0] === 'workflow' ? `workflow ${parts[1] ?? ''}`.trim() : parts[0];
  const last = parts.at(-1) ?? '';
  const result = /denied|rejected/.test(last) || action === 'workflow.approval.stale' ? 'denied' : /failed|timed_out/.test(last) ? 'failed' : 'success';
  return { actor, entity, result };
}
/** Annotate each event with its derived fields and whether its own link verifies. */
export function annotate(events: Audit[]): { rows: EvidenceRow[]; valid: boolean; firstBrokenSeq: number | null; headHash: string | null } {
  let previous = 'GENESIS'; let firstBroken: number | null = null;
  const rows = events.map((e) => {
    const { seq: _s, hash, ...body } = e;
    const ok = firstBroken === null && body.previousHash === previous && digest(body) === hash;
    if (!ok && firstBroken === null) firstBroken = e.seq;
    previous = hash;
    return { ...e, ...classify(e.action), linkValid: ok };
  });
  return { rows, valid: firstBroken === null, firstBrokenSeq: firstBroken, headHash: events.at(-1)?.hash ?? null };
}
export type EvidenceFilter = { actor?: string | null; entity?: string | null; action?: string | null; result?: string | null; from?: string | null; to?: string | null; q?: string | null };
export function filterEvidence(rows: EvidenceRow[], f: EvidenceFilter) {
  const fromT = f.from ? Date.parse(f.from) : null; const toT = f.to ? Date.parse(f.to) : null;
  return rows.filter((r) => (!f.actor || r.actor === f.actor) && (!f.entity || r.entity === f.entity) && (!f.action || r.action.includes(f.action)) && (!f.result || r.result === f.result)
    && (fromT === null || Number.isNaN(fromT) || Date.parse(r.createdAt) >= fromT) && (toT === null || Number.isNaN(toT) || Date.parse(r.createdAt) <= toT)
    && (!f.q || `${r.target} ${r.detail}`.toLowerCase().includes(f.q.toLowerCase())));
}
const cell = (v: unknown) => { const s = String(v ?? ''); const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };
export function evidenceCsv(rows: EvidenceRow[]) {
  const head = ['seq', 'createdAt', 'actor', 'entity', 'action', 'result', 'target', 'detail', 'previousHash', 'hash', 'linkValid'];
  return [head, ...rows.map((r) => head.map((k) => (r as any)[k]))].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
