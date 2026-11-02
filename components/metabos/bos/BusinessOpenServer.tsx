'use client';
/**
 * MuZe Business Open Server: one server rail over Office, Sanctum, HQ, Trust stack and Verification.
 * Layout ideas from the owner's AI Studio builds (t77, t81, t88, t91, t94) and the Pixtuoid-style office idea; the code is ours.
 * Real records only: every number comes from /api/bos, /api/ai or /api/dispatch. Empty means empty.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AgentOffice, type Desk } from './AgentOffice';
import { Sanctum, type SanctumData } from './Sanctum';
import { McpDirectory, Operator, type OperatorData } from './Operator';
import { DiscordView, type DiscordData } from './DiscordView';
import { Issues } from './Issues';
import { Board } from './Board';
import { MuZeRoam } from '../muse/MuZeRoam';
import { emitRoam } from '@/lib/metabos/muse/roam';
/** What each view holds, stated plainly. MuZe reads these when it flies to a rail item. */
const GUIDE: Record<string, string> = { board: 'Board: one tile per service, each running a live check.', issues: 'Issues: work assigned to agents, with status, recorded in the evidence chain.', office: 'Agent Office: one desk per agent, showing its recorded state.', sanctum: 'MuZe Sanctum: talk to MuZe. Sends need two reviewers, then dispatch.', hq: 'HQ: counts of Jev reviews, dispatches and evidence rows from this server.', operator: 'Operator console: recorded runs and approvals.', discord: 'Channels: messages recorded on this server, grouped by channel.', mcp: 'MCP directory: the MCP servers this server knows about.', trust: 'Trust stack R0–R6: the state of each trust layer, as recorded.', verify: 'Verification: re-check the evidence hash chain.' };
type Bos = { office: { desks: Desk[] }; sanctum: SanctumData; trust: { id: string; name: string; state: string; detail: string }[]; pipeline: { id: string; label: string; count: number }[]; hq: { jevWaiting: number; dispatchPending: number; dispatchSent: number; evidenceRows: number; chainValid: boolean }; activity: { seq: number; kind: string; action: string; target: string; at: string; hash: string }[]; operator: OperatorData; discord: DiscordData };
const RAIL = [['board', 'Board'], ['issues', 'Issues'], ['office', 'Agent Office'], ['sanctum', 'MuZe Sanctum'], ['hq', 'HQ'], ['operator', 'Operator console'], ['discord', 'Channels'], ['mcp', 'MCP directory'], ['trust', 'Trust stack R0–R6'], ['verify', 'Verification']] as const;
const PLATFORMS = [['office', 'MeTaBos'], ['operator', 'METAPEN Operator'], ['discord', 'Discord view'], ['mcp', 'MCPSERVER.in']] as const;
const LINKS = [['/workspace/builder/agentverse', 'AgentVerse console'], ['/workspace/builder/meta-server', 'MeTa Server'], ['/workspace/builder/agent-hub', 'Agent Hub'], ['/workspace/builder/demo', 'Judge demo']] as const;
const STATE_LABEL: Record<string, string> = { not_attested: 'Not attested', not_configured: 'Not configured', configured: 'Configured', enforced_in_code: 'Enforced in code', chain_verified: 'Chain verified', chain_broken: 'Chain broken', empty: 'Empty' };
export function BusinessOpenServer() {
  const [d, setD] = useState<Bos | null>(null); const [err, setErr] = useState<string | null>(null); const [sec, setSec] = useState<(typeof RAIL)[number][0]>('office');
  const load = useCallback(async () => { try { const r = await fetch('/api/bos', { cache: 'no-store' }); const j = await r.json(); if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`); setD(j); setErr(null); } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } }, []);
  useEffect(() => { const v = new URLSearchParams(window.location.search).get('view'); if (v && RAIL.some(([id]) => id === v)) setSec(v as (typeof RAIL)[number][0]); }, []);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } emitRoam({ kind: 'guide', selector: `[data-guide-id="rail-${sec}"]` }); }, [sec]);
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);
  return <div className="mb-bos" data-testid="bos">
    <MuZeRoam homeSelector='[data-guide-id="rail-sanctum"]' />
    <nav className="mb-bos-rail" aria-label="Server rail">
      <p className="mb-bos-brand">MuZe<span> Business Open Server</span></p>
      <ul>{RAIL.map(([id, label]) => <li key={id}><button type="button" aria-current={sec === id ? 'page' : undefined} data-guide-id={`rail-${id}`} data-guide={GUIDE[id]} onClick={() => setSec(id)}>{label}</button></li>)}</ul>
      <p className="mb-bos-railhead">Also on this server</p>
      <ul>{LINKS.map(([href, label]) => <li key={href}><Link href={href}>{label}</Link></li>)}</ul>
    </nav>
    <section className="mb-bos-main">
      <div className="mb-bos-switch" role="group" aria-label="Platform">{PLATFORMS.map(([id, label]) => <button key={id} type="button" aria-pressed={sec === id} onClick={() => setSec(id)}>{label}</button>)}</div>
      {err && <p role="alert" className="mb-bos-err">Could not load: {err} <button type="button" onClick={load}>Retry</button></p>}
      {!d && !err && <p className="mb-muted">Loading server records…</p>}
      {sec === 'board' && <Board />}{sec === 'issues' && <Issues />}
      {d && sec === 'office' && <AgentOffice desks={d.office.desks} />}
      {d && sec === 'sanctum' && <Sanctum data={d.sanctum} onChange={load} onView={(v) => setSec(v)} />}
      {d && sec === 'hq' && <div data-testid="bos-hq"><h2>HQ</h2>
        <dl className="mb-bos-tiles">{([['Jev waiting', d.hq.jevWaiting], ['Dispatches pending', d.hq.dispatchPending], ['Dispatches sent', d.hq.dispatchSent], ['Evidence rows', d.hq.evidenceRows]] as const).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}<div><dt>Evidence chain</dt><dd>{d.hq.evidenceRows === 0 ? 'Empty' : d.hq.chainValid ? 'Verified' : 'Broken'}</dd></div></dl>
        <h3>Live activity</h3>{d.activity.length === 0 ? <p className="mb-muted">No records yet.</p> : <ol className="mb-bos-feed">{d.activity.map((a) => <li key={a.seq}><strong>{a.kind}</strong> <code>{a.action}</code> {a.target} <time>{new Date(a.at).toLocaleString()}</time> <code>{a.hash.slice(0, 10)}</code></li>)}</ol>}</div>}
      {d && sec === 'operator' && <><h2>Operator console</h2><Operator data={d.operator} onChange={load} /></>}
      {d && sec === 'discord' && <><h2>Channels</h2><DiscordView data={d.discord} /></>}
      {d && sec === 'mcp' && <McpDirectory mcp={d.operator.mcp} />}
      {d && sec === 'trust' && <div data-testid="bos-trust"><h2>Trust stack R0–R6</h2><p className="mb-muted">What this server can actually show today. A layer with no attestation says so.</p>
        <ol className="mb-bos-stack">{[...d.trust].reverse().map((l) => <li key={l.id} data-state={l.state}><b>{l.id}</b> <span>{l.name}</span> <em>{STATE_LABEL[l.state] ?? l.state}</em><p>{l.detail}</p></li>)}</ol></div>}
      {d && sec === 'verify' && <div data-testid="bos-verify"><h2>Verification pipeline</h2><p className="mb-muted">Counts from real dispatch records and evidence rows.</p>
        <ol className="mb-bos-pipe">{d.pipeline.map((p) => <li key={p.id} data-on={p.count > 0 ? 'true' : undefined}><span>{p.label}</span><b>{p.count}</b></li>)}</ol></div>}
    </section>
  </div>;
}
