'use client';
/** METAPEN-style Operator console. Real records only; the MUSE CLI says Not connected until a real session exists. */
import { useState } from 'react';
export type OperatorData = { scope: { id: string; name: string }[]; coverage: { rows: readonly string[]; cols: readonly string[]; cells: number[][] }; swarms: { name: string; agents: number; runs: number; pending: number }[];
  jev: { id: string; payloadHash: string; title: string; role: string | null; createdAt: string; reviewers: string[] }[]; receipts: { seq: number; action: string; target: string; at: string; hash: string }[];
  mcp: { id: string; name: string; purpose: string; status: string; risk: string; license: string; connection: string }[]; cli: { session: string | null } };
function Radar({ swarms }: { swarms: OperatorData['swarms'] }) {
  if (swarms.length < 3) return <p className="mb-muted">{swarms.length === 0 ? 'No swarms defined yet.' : 'Radar needs three or more swarms.'}</p>;
  const max = Math.max(1, ...swarms.map((x) => x.runs)); const R = 80, c = 100;
  const pt = (i: number, r: number) => { const a = (Math.PI * 2 * i) / swarms.length - Math.PI / 2; return `${c + Math.cos(a) * r},${c + Math.sin(a) * r}`; };
  return <svg viewBox="0 0 200 200" width="220" height="220" role="img" aria-label={`Swarm radar: runs per swarm, max ${max}`}>
    <polygon points={swarms.map((_, i) => pt(i, R)).join(' ')} fill="none" stroke="#2a2a2a" />
    <polygon points={swarms.map((x, i) => pt(i, (x.runs / max) * R)).join(' ')} fill="rgba(255,42,42,.25)" stroke="#FF2A2A" />
    {swarms.map((x, i) => { const [px, py] = pt(i, R + 10).split(','); return <text key={x.name} x={px} y={py} fontSize="7" fill="#B0B0B0" textAnchor="middle">{x.name.slice(0, 14)}</text>; })}</svg>;
}
export function Operator({ data, onChange }: { data: OperatorData; onChange(): void }) {
  const [note, setNote] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const act = async (id: string, payloadHash: string, approve: boolean) => { setBusy(true); setNote(null);
    try { const r = await fetch('/api/bos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'review', input: { runId: id, payloadHash, approve } }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error);
      setNote(!approve ? 'Rejected; the run was cancelled.' : j.run.status === 'awaiting_approval' ? 'Reviewer A signed. A different reviewer must approve.' : `Reviewer B approved; run is ${j.run.status}.`); }
    catch (e) { setNote(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); onChange(); } };
  const total = data.swarms.reduce((n, x) => n + x.agents, 0);
  return <div data-testid="bos-operator" className="mb-bos-op">
    <section><h3>Mission scope</h3>{data.scope.length === 0 ? <p className="mb-muted">No workspaces yet.</p> : <ul className="mb-bos-chips">{data.scope.map((w) => <li key={w.id}>{w.name}</li>)}</ul>}</section>
    <section><h3>Coverage matrix (catalog)</h3><table className="mb-bos-table"><thead><tr><th scope="col">Kind</th>{data.coverage.cols.map((c) => <th scope="col" key={c}>{c}</th>)}</tr></thead>
      <tbody>{data.coverage.rows.map((r, i) => <tr key={r}><th scope="row">{r}</th>{data.coverage.cells[i].map((n, j) => <td key={j}>{n}</td>)}</tr>)}</tbody></table></section>
    <section><h3>Swarm radar</h3><p className="mb-muted">{total} agent definition cards across {data.swarms.length} swarms (definitions, not running agents).</p><Radar swarms={data.swarms} /></section>
    <section><h3>Clans</h3>{data.swarms.length === 0 ? <p className="mb-muted">No swarms yet.</p> : <ul className="mb-bos-clans">{data.swarms.map((x) => <li key={x.name}><b>{x.name}</b><span>{x.agents} cards · {x.runs} drafts · {x.pending} waiting</span></li>)}</ul>}</section>
    <section className="mb-bos-wide"><h3>JEV gatekeeper — two reviewers</h3>{note && <p role="status">{note}</p>}
      {data.jev.length === 0 ? <p className="mb-muted">Nothing waiting in Jev.</p> : <ul className="mb-bos-jev">{data.jev.map((r) => <li key={r.id}><span>{r.title}</span> <code>{r.payloadHash.slice(0, 12)}</code>
        <span>Reviewer A: {r.reviewers[0] ?? '—'}</span><span>Reviewer B: {r.reviewers[1] ?? '—'}</span>
        <button type="button" disabled={busy} onClick={() => act(r.id, r.payloadHash, true)}>{r.reviewers.length ? 'Approve as Reviewer B' : 'Sign as Reviewer A'}</button><button type="button" disabled={busy} onClick={() => act(r.id, r.payloadHash, false)}>Reject</button></li>)}</ul>}</section>
    <section className="mb-bos-wide"><h3>Evidence receipts</h3>{data.receipts.length === 0 ? <p className="mb-muted">No receipts yet.</p> : <ol className="mb-bos-feed">{data.receipts.map((e) => <li key={e.seq}>#{e.seq} <code>{e.action}</code> {e.target} <code>{e.hash}</code></li>)}</ol>}</section>
    <section className="mb-bos-wide mb-bos-cli" aria-label="MUSE CLI"><div className="mb-bos-row"><h3>MUSE CLI</h3><span data-testid="bos-cli-state">{data.cli.session ? `Session ${data.cli.session}` : 'Not connected'}</span>
      {(['Run', 'Pause', 'Stop'] as const).map((b) => <button key={b} type="button" disabled={!data.cli.session} title={data.cli.session ? b : 'No CLI session'}>{b}</button>)}</div>
      <pre tabIndex={0}>{data.cli.session ? '' : 'No CLI session is connected. Nothing runs from here.'}</pre></section>
  </div>;
}
export function McpDirectory({ mcp }: { mcp: OperatorData['mcp'] }) {
  return <div data-testid="bos-mcp"><h2>MCP server directory</h2><p className="mb-muted">From config/muse-catalog.json. Status and connection are read, not assumed.</p>
    {mcp.length === 0 ? <p className="mb-muted">No MCP entries in the catalog.</p> : <ul className="mb-bos-clans">{mcp.map((m) => <li key={m.id}><b>{m.name}</b><span>{m.purpose}</span><span>{m.status} · {m.risk} · {m.license}</span><span>{m.connection}</span></li>)}</ul>}</div>;
}
