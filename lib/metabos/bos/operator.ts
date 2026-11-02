/**
 * Operator console (METAPEN-style) and Discord view read models, plus two-reviewer Jev approval.
 * Counts come from agent cards, the MCP/skill catalog, Jev runs and the evidence chain. Nothing is invented.
 */
import { z } from 'zod';
import { BusinessError, type BusinessStore } from '../store';
import { queue } from '../ai/jev';
import { hubView } from '../hub/agent-hub';
import { loadCatalog, connectionLabel } from '../muse-catalog';
import { metaStatus } from '../meta/status';
import { firewallEvents, listWorkspaces } from '../agentverse/core';
import { WorkflowEngine } from '../workflows';
const ensure = (s: BusinessStore) => s.db.exec('CREATE TABLE IF NOT EXISTS mb_bos_reviews(runId TEXT NOT NULL, reviewer TEXT NOT NULL, payloadHash TEXT NOT NULL, createdAt TEXT NOT NULL, PRIMARY KEY(runId, reviewer))');
export const ReviewInput = z.object({ runId: z.string().min(1).max(80), payloadHash: z.string().regex(/^[0-9a-f]{64}$/), approve: z.boolean() }).strict();

/** Two-reviewer gate over the real Jev queue: Reviewer A signs, a different Reviewer B approves the run. One reject cancels it. */
export function review(s: BusinessStore, reviewer: string, raw: unknown) {
  const i = ReviewInput.parse(raw); ensure(s); const e = new WorkflowEngine(s); const run = e.run(i.runId);
  if (run.status !== 'awaiting_approval') throw new BusinessError(`Run is ${run.status}`, 409);
  if (run.payloadHash !== i.payloadHash) throw new BusinessError('Payload hash does not match the proposal', 409);
  if (!i.approve) { s.transact(() => s.appendEvidence('bos.review.rejected', i.runId, `Rejected by ${reviewer}`)); return { run: e.cancel(i.runId), reviewers: reviewers(s, i.runId) }; }
  const prior = reviewers(s, i.runId);
  if (prior.includes(reviewer)) throw new BusinessError('You already signed this run; a second, different reviewer must approve', 409);
  s.transact(() => { s.db.prepare('INSERT INTO mb_bos_reviews VALUES(?,?,?,?)').run(i.runId, reviewer, i.payloadHash, new Date().toISOString()); s.appendEvidence('bos.review.signed', i.runId, `Reviewer ${prior.length ? 'B' : 'A'}: ${reviewer}; payload ${i.payloadHash.slice(0, 12)}`); });
  if (prior.length === 0) return { run: e.run(i.runId), reviewers: reviewers(s, i.runId) };
  return { run: e.approve(i.runId, i.payloadHash), reviewers: reviewers(s, i.runId) };
}
export function reviewers(s: BusinessStore, runId: string) { ensure(s); return (s.db.prepare('SELECT reviewer FROM mb_bos_reviews WHERE runId=? ORDER BY createdAt').all(runId) as { reviewer: string }[]).map((r) => r.reviewer); }

export function operator(s: BusinessStore, env: Record<string, string | undefined>) {
  const hub = hubView(s); const cat = loadCatalog().entries; const q = queue(s);
  const kinds = ['mcp', 'skill'] as const; const statuses = ['adoptable', 'reference', 'blocked'] as const;
  return {
    scope: listWorkspaces(s).map((w) => ({ id: w.id, name: w.name })),
    coverage: { rows: kinds, cols: statuses, cells: kinds.map((k) => statuses.map((st) => cat.filter((c) => c.kind === k && c.status === st).length)) },
    swarms: hub.servers.map((x) => ({ name: x.name, agents: x.agents, runs: x.runs, pending: x.pending })),
    jev: q.filter((r) => r.status === 'awaiting_approval').slice(0, 50).map((r) => ({ id: r.id, payloadHash: r.payloadHash, title: String((r.input as { args?: { title?: string } }).args?.title ?? r.workflowId).slice(0, 120), role: (r.input as { role?: string }).role ?? null, createdAt: r.createdAt, reviewers: reviewers(s, r.id) })),
    receipts: s.evidence().slice(-30).reverse().map((e) => ({ seq: e.seq, action: e.action, target: e.target, at: e.createdAt, hash: e.hash.slice(0, 16) })),
    mcp: cat.filter((c) => c.kind === 'mcp').map((c) => ({ id: c.id, name: c.name, purpose: c.purpose.slice(0, 160), status: c.status, risk: c.risk, license: c.license, connection: connectionLabel(c, env) })),
    cli: { session: null as null | string },
  };
}

export function discord(s: BusinessStore) {
  const hub = hubView(s); const q = queue(s); const ev = s.evidence();
  const swarm = (name: string) => hubView(s, name, 'runs').messages.slice(-30).map((m) => ({ id: m.id, author: m.author, text: m.text.slice(0, 600), at: m.createdAt, embed: { title: m.kind === 'agent_draft' ? 'Agent draft' : 'Composer draft', fields: [['Jev', m.jev], ['Guard', m.guard ?? '—']] } }));
  return {
    groups: [
      { name: 'Information', channels: [{ id: 'activity', name: 'activity', messages: ev.slice(-30).reverse().map((e) => ({ id: `e${e.seq}`, author: 'evidence', text: `${e.action} ${e.target}`, at: e.createdAt, embed: { title: `#${e.seq}`, fields: [['hash', e.hash.slice(0, 16)]] } })) }] },
      { name: 'Governance', channels: [
        { id: 'jev-approvals', name: 'jev-approvals', messages: q.slice(0, 30).map((r) => ({ id: r.id, author: 'jev', text: String((r.input as { args?: { title?: string } }).args?.title ?? r.workflowId), at: r.createdAt, embed: { title: r.status, fields: [['payload', r.payloadHash.slice(0, 12)]] } })) },
        { id: 'audit-log', name: 'audit-log', messages: ev.filter((e) => /approv|reject|review|dispatch/.test(e.action)).slice(-30).reverse().map((e) => ({ id: `a${e.seq}`, author: 'audit', text: `${e.action}: ${e.detail.slice(0, 200)}`, at: e.createdAt, embed: { title: `#${e.seq}`, fields: [['hash', e.hash.slice(0, 16)]] } })) },
        { id: 'kill-switch', name: 'kill-switch', messages: metaStatus(s).products.filter((p) => p.manual).map((p) => ({ id: p.name, author: p.markedBy ?? 'operator', text: `${p.name}: ${p.status}${p.note ? ` — ${p.note}` : ''}`, at: p.markedAt ?? '', embed: { title: 'Circuit breaker mark', fields: [['group', p.group]] } })) },
        { id: 'compliance', name: 'compliance', messages: firewallEvents(s).slice(0, 30).map((f) => ({ id: `f${f.seq}`, author: 'guard', text: `${f.action}: ${f.detail}`, at: f.at, embed: { title: `#${f.seq}`, fields: [['target', f.target]] } })) },
      ] },
      { name: 'Swarms', channels: hub.servers.map((x) => ({ id: `swarm:${x.name}`, name: x.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), messages: swarm(x.name) })) },
    ],
  };
}
