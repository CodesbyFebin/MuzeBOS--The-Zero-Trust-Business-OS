'use client';
import { useEffect, useState } from 'react';
type Agent = { id: string; name: string; role: string; tier: string; risk_class: string; jev_required: boolean; responsibility: string; tools: string[]; preferred_model_tier: string };
type Tree = { name: string; subclusters: { name: string; agents: Agent[] }[] }[];
type Data = { generated: string; note: string; totals: { total: number; jev: number; high: number }; matched: number; swarms: Tree; swarmList: string[]; yao: { connected: boolean; label: string }; claw: { connected: boolean; label: string }; drafts: { id: string; agent: string; source: string; guard: string; jevStatus: string | null; text: string; actions: { tool: string }[]; createdAt: string; jevRunId: string | null }[] };
const sel = { minHeight: 44 } as const;
export function SwarmsBrowser() {
  const [f, setF] = useState({ tier: '', risk: '', jev: '', swarm: '', q: '' }); const [d, setD] = useState<Data | null>(null); const [err, setErr] = useState('');
  const [pick, setPick] = useState<Agent | null>(null); const [task, setTask] = useState(''); const [busy, setBusy] = useState(''); const [res, setRes] = useState('');
  const load = () => { const p = new URLSearchParams(Object.entries(f).filter(([, v]) => v)); fetch(`/api/b3/swarms?${p}`).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); }).catch((e) => setErr(String(e.message ?? e))); };
  useEffect(load, [f]);
  const run = async (target: 'yao' | 'claw-local') => {
    if (!pick) return; setBusy(target); setRes(''); setErr('');
    const r = await fetch('/api/b3/swarms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cardId: pick.id, task, target }) });
    const j = await r.json(); setBusy('');
    if (!r.ok) setErr(j.error ?? 'Run failed'); else { setRes(j.status === 'pending_jev' ? `Saved as Brain draft ${j.id}. Llama Guard: ${j.guard.verdict}. Waiting in Jev; nothing was sent.` : `Llama Guard flagged the draft (${j.guard.verdict}). It was saved but not sent to Jev.`); load(); }
  };
  const opt = (k: keyof typeof f, label: string, vals: [string, string][]) => <label>{label} <select style={sel} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}><option value="">All</option>{vals.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>;
  return (<section className="mb-v3" aria-labelledby="sw-h">
    <h1 id="sw-h" className="mb-heading">Claw swarms</h1>
    <p className="mb-muted">{d ? `${d.totals.total} agent definitions in 10 swarms; ${d.totals.jev} need Jev, ${d.totals.high} are high risk. These are definitions, not running agents.` : 'Loading…'}</p>
    <div role="group" aria-label="Filters" style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      {opt('swarm', 'Swarm', (d?.swarmList ?? []).map((s) => [s, s]))}
      {opt('tier', 'Tier', [['lead', 'Lead'], ['pm', 'PM'], ['worker', 'Worker']])}
      {opt('risk', 'Risk', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']])}
      {opt('jev', 'Jev', [['yes', 'Jev required'], ['no', 'No Jev']])}
      <label>Search <input style={sel} value={f.q} maxLength={80} onChange={(e) => setF({ ...f, q: e.target.value })} /></label>
    </div>
    <p data-testid="sw-status" className="mb-muted">Yao: {d?.yao.label ?? '…'} · Local swarm: {d?.claw.label ?? '…'}</p>
    {pick && <form className="mb-panel" aria-label={`Run ${pick.name}`} style={{ display: 'grid', gap: 8, padding: 12 }} onSubmit={(e) => e.preventDefault()}>
      <strong>{pick.name}</strong><span className="mb-muted">{pick.responsibility}</span>
      <label>Task <textarea required minLength={3} maxLength={2000} rows={3} value={task} onChange={(e) => setTask(e.target.value)} /></label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" style={sel} disabled={!!busy || task.trim().length < 3 || !d?.yao.connected} onClick={() => run('yao')}>{busy === 'yao' ? 'Running on Yao…' : 'Run agent on Yao'}</button>
        <button type="button" style={sel} disabled={!!busy || task.trim().length < 3 || !d?.claw.connected} onClick={() => run('claw-local')}>{busy === 'claw-local' ? 'Running locally…' : 'Run on local swarm'}</button>
        <button type="button" style={sel} onClick={() => { setPick(null); setRes(''); }}>Close</button>
      </div>
      <p className="mb-muted">The result is saved as a Brain draft, checked by Llama Guard, and waits in Jev. Nothing is sent.</p>
      {res && <p role="status">{res}</p>}
    </form>}
    {err && <p role="alert">{err}</p>}
    {d && (d.matched === 0 ? <p>No records yet</p> : <div data-testid="sw-tree">{d.swarms.map((w) => <details key={w.name} open={!!f.swarm || d.swarms.length === 1}><summary style={{ minHeight: 44 }}>{w.name} ({w.subclusters.reduce((n, c) => n + c.agents.length, 0)})</summary>
      {w.subclusters.map((c) => <details key={c.name} style={{ marginLeft: 16 }}><summary style={{ minHeight: 44 }}>{c.name} ({c.agents.length})</summary>
        <ul>{c.agents.map((a) => <li key={a.id} data-agent={a.id}><button type="button" style={sel} onClick={() => { setPick(a); setTask(''); setRes(''); }} aria-label={`Open ${a.name}`}>{a.name}</button> <span>{a.tier}</span> · <span data-risk={a.risk_class}>risk {a.risk_class}</span>{a.jev_required ? ' · Jev required' : ''} · tools: {a.tools.join(', ')}</li>)}</ul>
      </details>)}</details>)}</div>)}
    <h2 className="mb-panel-head">Agent drafts</h2>
    {d && (d.drafts.length === 0 ? <p data-testid="sw-drafts-empty">No records yet</p> : <ul data-testid="sw-drafts">{d.drafts.map((x) => <li key={x.id}>{x.createdAt.slice(0, 16).replace('T', ' ')} UTC · {x.agent} via {x.source} · guard {x.guard} · {x.jevRunId ? `Jev ${x.jevStatus?.replace('_', ' ')}` : 'not sent to Jev'}{x.actions.length ? ` · ${x.actions.length} action(s) held` : ''} — {x.text.slice(0, 140)}</li>)}</ul>)}
  </section>);
}
