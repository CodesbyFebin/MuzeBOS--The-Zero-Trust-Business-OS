'use client';
/**
 * Features ported from the AI Studio prototype (docs/design/aistudio/).
 * The prototype ran on src/data/mockData.ts; these versions read only real MeTaBos APIs
 * and show "No records yet" (or the server's refusal reason) when there is nothing to show.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import library from '@/lib/metabos/employee-index.json';

type Load<T> = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ok'; data: T };
function useApi<T>(url: string) {
  const [state, setState] = useState<Load<T>>({ kind: 'loading' });
  const reload = useCallback(() => {
    setState({ kind: 'loading' });
    fetch(url, { cache: 'no-store' }).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setState({ kind: 'error', message: r.status === 401 ? 'Sign in to see these records.' : r.status === 403 ? 'Your role cannot read these records.' : (j.error ?? 'Unavailable') });
      else setState({ kind: 'ok', data: j as T });
    }).catch(() => setState({ kind: 'error', message: 'Unavailable' }));
  }, [url]);
  useEffect(() => { reload(); }, [reload]);
  return [state, reload] as const;
}
const Status = ({ s }: { s: Load<unknown> }) => s.kind === 'loading' ? <p className="mb-muted">Loading…</p> : s.kind === 'error' ? <p className="mb-muted" role="status">{s.message}</p> : null;
const Empty = () => <p className="mb-muted" data-testid="empty">No records yet</p>;

type Evidence = { total: number; valid: boolean; firstBrokenSeq: number | null; headHash: string | null; rows: { seq: number; action: string; entity: string; actor: string; createdAt: string }[] };
type Inference = { counters: { awaitingApproval: number; running: number }; tasks: { id: string; state: string; createdAt?: string; payload: { title: string; prompt?: string; provider: string; kind?: string } }[] };
type Runs = { runs: { id: string; workflowId: string; status: string; createdAt: string; updatedAt: string; error: string | null; steps: { stepId: string; status: string; attempts: number }[] }[] };

/** Executive cockpit (Mission Control): approvals waiting on Jev and the audit-chain check, from real records. */
export function ExecutiveCockpit() {
  const [tab, setTab] = useState<'approvals' | 'audit'>('approvals');
  const [inf] = useApi<Inference>('/api/inference');
  const [runs] = useApi<Runs>('/api/workflow-runs');
  const [ev, reloadEv] = useApi<Evidence>('/api/evidence');
  const waitingRuns = runs.kind === 'ok' ? runs.data.runs.filter((r) => r.status === 'awaiting_approval') : [];
  const waitingTasks = inf.kind === 'ok' ? inf.data.tasks.filter((t) => t.state === 'awaiting_approval') : [];
  return (
    <section className="mb-panel mb-studio" aria-labelledby="cockpit-h" data-testid="executive-cockpit">
      <div className="mb-panel-head"><h2 id="cockpit-h">Executive cockpit</h2>
        <nav className="mb-studio-tabs" aria-label="Cockpit views">{(['approvals', 'audit'] as const).map((t) => <button key={t} type="button" className="mb-button" aria-pressed={tab === t} onClick={() => setTab(t)}>{t === 'approvals' ? 'Jev approvals' : 'Audit chain'}</button>)}</nav>
      </div>
      {tab === 'approvals' && (<>
        <Status s={inf} /><Status s={runs} />
        {(inf.kind === 'ok' || runs.kind === 'ok') && (waitingRuns.length + waitingTasks.length === 0 ? <Empty /> : (
          <ul className="mb-studio-list">
            {waitingRuns.map((r) => <li key={r.id}><Link href="/workspace/brain/runtime#jev"><strong>Workflow run · {r.workflowId}</strong><span>awaiting approval since {new Date(r.createdAt).toLocaleString()}</span></Link></li>)}
            {waitingTasks.map((t) => <li key={t.id}><Link href="/workspace/brain/inference"><strong>Inference draft · {t.payload.title}</strong><span>{t.payload.provider} · awaiting Jev review</span></Link></li>)}
          </ul>
        ))}
      </>)}
      {tab === 'audit' && (<>
        <Status s={ev} />
        {ev.kind === 'ok' && (ev.data.total === 0 ? <Empty /> : (
          <div>
            <p data-testid="chain-result">{ev.data.valid ? `Hash chain verified by the server over ${ev.data.total} events.` : `Hash chain broken at event ${ev.data.firstBrokenSeq}.`}</p>
            {ev.data.headHash && <p className="mb-source-hash">Head: {ev.data.headHash}</p>}
            <ul className="mb-studio-list">{ev.data.rows.slice(0, 6).map((r) => <li key={r.seq}><span><strong>{r.action}</strong> {r.entity} · {r.actor}</span><span>{new Date(r.createdAt).toLocaleString()}</span></li>)}</ul>
          </div>
        ))}
        <div className="mb-source-shortcuts"><button type="button" className="mb-button" onClick={reloadEv}>Re-verify chain</button><Link className="mb-button" href="/workspace/evidence">Open evidence</Link></div>
      </>)}
    </section>
  );
}

type Role = { id: string; name: string; role: string; version: string; source: string; routines: { id: string; days: string }[] };
/** Swarm registry + marketplace (Brain › Prompt Library): the bundled AI employee definitions, grouped by function. */
export function SwarmRegistry() {
  const roles = (library as { roles: Role[] }).roles;
  const [q, setQ] = useState('');
  const groups = new Map<string, Role[]>();
  for (const r of roles.filter((r) => `${r.name} ${r.role}`.toLowerCase().includes(q.toLowerCase()))) groups.set(r.role, [...(groups.get(r.role) ?? []), r]);
  return (
    <section className="mb-panel mb-studio" aria-labelledby="swarm-h" data-testid="swarm-registry">
      <div className="mb-panel-head"><h2 id="swarm-h">AI employee registry</h2><label className="mb-search"><span className="sr-only">Filter employees</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name or function" /></label></div>
      <p className="mb-muted">Versioned definitions bundled with this app. Runtime status is not tracked here: an employee only acts by filing drafts that Jev and a person approve.</p>
      {groups.size === 0 ? <Empty /> : [...groups].map(([fn, rs]) => (
        <div key={fn} className="mb-studio-group"><h3>{fn}</h3>
          <ul className="mb-studio-list">{rs.map((r) => <li key={r.id}><span><strong>{r.name}</strong> v{r.version}</span><span>{r.routines.length} routines · {[...new Set(r.routines.map((x) => x.days))].join(', ')} · {r.source}</span></li>)}</ul>
        </div>
      ))}
    </section>
  );
}

/** Workflow execution stream (/workflows): real governed runs and their step states. */
export function WorkflowStream() {
  const [runs, reload] = useApi<Runs>('/api/workflow-runs');
  return (
    <section className="mb-panel mb-studio" aria-labelledby="wfs-h" data-testid="workflow-stream">
      <div className="mb-panel-head"><h2 id="wfs-h">Execution stream</h2><button type="button" className="mb-button" onClick={reload}>Refresh</button></div>
      <Status s={runs} />
      {runs.kind === 'ok' && (runs.data.runs.length === 0 ? <Empty /> : (
        <ol className="mb-studio-list mb-studio-stream">{runs.data.runs.slice(0, 20).map((r) => (
          <li key={r.id}><span><strong>{r.workflowId}</strong> · {r.status}{r.error ? ` · ${r.error}` : ''}</span>
            <span>{r.steps.map((s) => `${s.stepId}:${s.status}${s.attempts > 1 ? `×${s.attempts}` : ''}`).join(' → ') || 'no steps yet'} · {new Date(r.updatedAt).toLocaleString()}</span></li>
        ))}</ol>
      ))}
    </section>
  );
}

type Mem = { memory: { id: string; layer: 'L1' | 'L2' | 'L3' | 'L4'; status: 'trusted' | 'draft' }[]; layers: Record<string, string> };
/** Four-layer memory fabric (Brain › Layered Memory): trusted vs draft counts per layer from mb_memory. */
export function MemoryFabric() {
  const [m] = useApi<Mem>('/api/metabos/memory');
  return (
    <section className="mb-panel mb-studio" aria-labelledby="fabric-h" data-testid="memory-fabric">
      <h2 id="fabric-h">Memory fabric</h2>
      <Status s={m} />
      {m.kind === 'ok' && (m.data.memory.length === 0 ? <Empty /> : (
        <div className="mb-tool-grid">{Object.entries(m.data.layers).map(([k, name]) => {
          const rows = m.data.memory.filter((x) => x.layer === k);
          return <div key={k} className="mb-panel"><span>{k} · {name}</span><h3>{rows.length ? `${rows.filter((x) => x.status === 'trusted').length} trusted · ${rows.filter((x) => x.status === 'draft').length} draft` : 'No records yet'}</h3></div>;
        })}</div>
      ))}
    </section>
  );
}

/** AI console (Brain › AI Runtime): files a draft-only inference task for Jev review. It executes nothing. */
export function AiConsole() {
  const [inf, reload] = useApi<Inference>('/api/inference');
  const [prompt, setPrompt] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!prompt.trim()) return;
    setBusy(true); setMsg('');
    try {
      const r = await fetch('/api/inference', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify({ action: 'create', data: { title: `Console: ${prompt.trim().slice(0, 80)}`, prompt: prompt.trim(), kind: 'draft', lane: 'auto', paidConsent: false } }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setMsg(r.status === 401 ? 'Sign in to file a draft.' : j.error ?? 'Could not file the draft.');
      else { setMsg('Filed for Jev review. Nothing runs until it is approved.'); setPrompt(''); reload(); }
    } finally { setBusy(false); }
  }
  const mine = inf.kind === 'ok' ? inf.data.tasks.filter((t) => t.payload.title.startsWith('Console: ')).slice(0, 8) : [];
  return (
    <section className="mb-panel mb-studio" aria-labelledby="console-h" data-testid="ai-console">
      <h2 id="console-h">AI console · draft only</h2>
      <p className="mb-muted">Requests become inference drafts in the Jev queue. The console never runs commands, sends messages or changes records.</p>
      <div className="mb-terminal" role="log" aria-label="Console drafts">
        <Status s={inf} />
        {inf.kind === 'ok' && (mine.length === 0 ? <Empty /> : mine.map((t) => <p key={t.id}><span className="mb-term-prompt">&gt;</span> {t.payload.title.slice(9)} <span className="mb-muted">[{t.state}]</span></p>))}
      </div>
      <form onSubmit={submit} className="mb-terminal-form">
        <label className="sr-only" htmlFor="mb-console-input">Draft request</label>
        <input id="mb-console-input" value={prompt} maxLength={2000} onChange={(e) => setPrompt(e.target.value)} placeholder="Ask for a draft, e.g. a reply to a customer" />
        <button className="mb-primary mb-button" disabled={busy || !prompt.trim()}>Propose draft</button>
      </form>
      {msg && <p role="status">{msg}</p>} <Link className="mb-link" href="/workspace/brain/inference">Open the Jev inference queue</Link>
    </section>
  );
}
