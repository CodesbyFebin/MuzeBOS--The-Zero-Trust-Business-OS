/**
 * MuZe Business Open Server: read models for the Agent Office, Sanctum receipts, HQ, the R0–R6 trust stack and the
 * verification pipeline. Everything is derived from real records (agent drafts, Jev runs, dispatches, the evidence chain).
 * Nothing here invents numbers: a value we cannot read is null and the UI shows an empty or "Unknown" state.
 */
import type { BusinessStore } from '../store';
import { attestChain, exportChain, type Attestation } from '../evidence-export';
import { listDrafts } from '../b3/agent-run';
import { queue } from '../ai/jev';
import { listDispatches } from '../dispatch/service';
import { reviewers } from './operator';
import { metaDryRun } from '../meta/graph';

export type DeskState = 'working' | 'awaiting_approval' | 'rejected' | 'idle';
export type Desk = { agent: string; state: DeskState; records: number; pending: number; rejected: number; toolCalls: number | null; lastAction: string | null; lastAt: string | null; model: string | null };
type Rec = { agent: string; at: string; status: string | null; action: string; tools: number | null; model: string | null };
const WORKING_MS = 10 * 60_000;

/** Pure: fold agent records into desks. Exported for tests. */
export function desksFrom(recs: Rec[], now = Date.now()): Desk[] {
  const by = new Map<string, Rec[]>(); for (const r of recs) by.set(r.agent, [...(by.get(r.agent) ?? []), r]);
  return [...by.entries()].map(([agent, rs]) => {
    rs.sort((a, b) => a.at.localeCompare(b.at)); const last = rs.at(-1)!;
    const pending = rs.filter((r) => r.status === 'awaiting_approval' || r.status === 'pending').length;
    const rejected = rs.filter((r) => r.status === 'cancelled' || r.status === 'rejected').length;
    const tools = rs.some((r) => r.tools !== null) ? rs.reduce((n, r) => n + (r.tools ?? 0), 0) : null;
    const state: DeskState = pending ? 'awaiting_approval' : (last.status === 'cancelled' || last.status === 'rejected') ? 'rejected' : (last.status === 'running' || now - Date.parse(last.at) < WORKING_MS) ? 'working' : 'idle';
    return { agent, state, records: rs.length, pending, rejected, toolCalls: tools, lastAction: last.action, lastAt: last.at, model: [...rs].reverse().find((r) => r.model)?.model ?? null };
  }).sort((a, b) => a.agent.localeCompare(b.agent));
}

export function office(s: BusinessStore, now = Date.now()) {
  const recs: Rec[] = [];
  for (const d of listDrafts(s, 500) as unknown as { agent: string; createdAt: string; jevStatus: string | null; actions: unknown[]; model: string | null; task: string }[])
    recs.push({ agent: d.agent, at: d.createdAt, status: d.jevStatus, action: `draft: ${String(d.task).slice(0, 80)}`, tools: Array.isArray(d.actions) ? d.actions.length : null, model: d.model ?? null });
  for (const r of queue(s)) { const i = r.input as { role?: string; tool?: string; args?: { title?: string } };
    recs.push({ agent: i.role ? `${i.role} agent` : 'agent', at: r.updatedAt, status: r.status, action: `${i.tool ?? 'proposal'}: ${String(i.args?.title ?? '').slice(0, 80)}`, tools: null, model: null }); }
  return { desks: desksFrom(recs, now) };
}

/** Sanctum receipts: dispatches proposed from Sanctum plus their evidence rows. */
export function sanctumReceipts(s: BusinessStore, env: Record<string, string | undefined>) {
  const ds = listDispatches(s).filter((d) => (d.payload as { body?: string; subject?: string })?.body?.startsWith?.('[MUSE plan]') || String((d.payload as { subject?: string })?.subject ?? '').startsWith('[MUSE plan]'));
  const ids = new Set(ds.map((d) => d.id));
  const ev = s.evidence().filter((e) => ids.has(e.target)).reverse().slice(0, 100).map((e) => ({ seq: e.seq, action: e.action, target: e.target, detail: e.detail.slice(0, 200), at: e.createdAt, hash: e.hash.slice(0, 16) }));
  return { dryRun: metaDryRun(env), dispatches: ds.map((d) => ({ id: d.id, channel: d.channel, status: d.status, payloadHash: d.payloadHash, createdAt: d.createdAt, providerStatus: d.providerStatus, reviewers: reviewers(s, d.id) })), evidence: ev };
}

/** R0–R6 trust stack. Layers we have no attestation for say so; only R6 is checked against the real chain. */
export function trustStack(s: BusinessStore, env: Record<string, string | undefined>, attestation?: Attestation) {
  const valid = s.verifyAudit(); const total = s.evidence().length;
  const att = attestation ?? (total > 0 && valid ? attestChain(exportChain(s.evidence()), env) : null);
  const has = (k: string) => !!env[k]?.trim();
  return [
    { id: 'R0', name: 'Silicon root of trust', state: 'not_attested', detail: 'No hardware attestation report is read by this server.' },
    { id: 'R1', name: 'MicroVM isolation', state: 'not_attested', detail: 'No microVM attestation is read. Runs as a normal Node.js process.' },
    { id: 'R2', name: 'Library OS', state: 'not_attested', detail: 'Not used.' },
    { id: 'R3', name: 'Tool sandbox', state: has('MUZEBOS_YAO_BASE_URL') ? 'configured' : 'not_configured', detail: has('MUZEBOS_YAO_BASE_URL') ? 'Yao sandbox URL set (env present; not a health check).' : 'Not configured — set MUZEBOS_YAO_BASE_URL.' },
    { id: 'R4', name: 'Signed receipts', state: 'not_attested', detail: 'Evidence rows are SHA-256 hash-chained; no post-quantum signature is applied.' },
    { id: 'R5', name: 'Approval gate (Jev)', state: 'enforced_in_code', detail: 'Every external send needs a Jev decision with the exact payload hash before /api/dispatch.' },
    { id: 'R6', name: 'Evidence chain', state: total === 0 ? 'empty' : !valid ? 'chain_broken' : att?.state === 'attested' ? 'attested_hash_commitment' : att?.state === 'failed' ? 'chain_broken' : 'chain_verified',
      detail: total === 0 ? 'No evidence recorded yet.' : !valid ? `${total} rows; hash chain BROKEN.` : att?.state === 'attested' ? `${total} rows; recomputed independently by agenet-verify (Rust). Hash-commitment, not ZK.` : att?.state === 'failed' ? `${total} rows; independent verifier disagreed at seq ${att.firstBrokenSeq ?? '?'}.` : `${total} rows; hash chain verified on this request. Not attested: ${att && 'reason' in att ? att.reason : 'independent verifier not run.'}`,
      attestation: att },
  ];
}

/** Verification pipeline: propose → approve → sandbox → proof → receipt, counted from real dispatches. */
export function pipeline(s: BusinessStore) {
  const ds = listDispatches(s); const ev = s.evidence();
  const count = (re: RegExp) => ev.filter((e) => re.test(e.action)).length;
  return [
    { id: 'propose', label: 'Propose', count: ds.length },
    { id: 'approve', label: 'Approve (Jev)', count: ds.filter((d) => d.approvedBy && d.status !== 'rejected').length },
    { id: 'sandbox', label: 'Sandbox / dry run', count: count(/^dispatch\.dry-run$/) },
    { id: 'proof', label: 'Proof (provider response)', count: ds.filter((d) => d.providerStatus !== null).length },
    { id: 'receipt', label: 'Receipt (evidence row)', count: count(/^dispatch\.provider-/) },
  ];
}

export function hq(s: BusinessStore) {
  const ds = listDispatches(s); const q = queue(s);
  return { jevWaiting: q.filter((r) => r.status === 'awaiting_approval').length, dispatchPending: ds.filter((d) => d.status === 'pending').length, dispatchSent: ds.filter((d) => d.status === 'sent').length, evidenceRows: s.evidence().length, chainValid: s.verifyAudit(), evidenceHead: s.evidence().at(-1)?.hash ?? null };
}
