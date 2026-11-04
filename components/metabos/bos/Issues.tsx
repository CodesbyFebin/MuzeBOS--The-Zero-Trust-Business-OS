'use client';
/** Issues: assign work to an agent from Agent Office and track it. Real SQLite rows only; empty state when none. */
import { useCallback, useEffect, useState } from 'react';
type Issue = { id: string; title: string; agent: string; status: 'open' | 'in_progress' | 'done'; createdBy: string; createdAt: string };
const LABEL = { open: 'Open', in_progress: 'In progress', done: 'Done' } as const;
export function Issues() {
  const [issues, setIssues] = useState<Issue[]>([]); const [agents, setAgents] = useState<string[]>([]); const [title, setTitle] = useState(''); const [agent, setAgent] = useState('');
  const [msg, setMsg] = useState<string | null>(null); const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => { const r = await fetch('/api/board/issues', { cache: 'no-store' }); const j = await r.json(); if (!r.ok) { setMsg(`Could not load: ${j.error ?? r.status}`); return; } setIssues(j.issues); setAgents(j.agents); setAgent((a) => a || j.agents[0] || ''); setLoaded(true); }, []);
  useEffect(() => { load(); }, [load]);
  const create = async (e: React.FormEvent) => { e.preventDefault(); setMsg(null); const r = await fetch('/api/board/issues', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, agent }) }); const j = await r.json(); if (!r.ok) { setMsg(`Not assigned: ${j.error ?? r.status}`); return; } setTitle(''); setMsg(`Assigned to ${j.issue.agent}.`); load(); };
  const setStatus = async (id: string, status: Issue['status']) => { const r = await fetch('/api/board/issues', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, status }) }); if (r.ok) load(); else setMsg('Status not changed.'); };
  return <div data-testid="bos-issues"><h2>Humans and agents, in one place</h2>
    <p className="mb-muted">Assign an issue to an agent that has a desk in Agent Office. Every change is written to the evidence chain.</p>
    {loaded && agents.length === 0 ? <p className="mb-muted" data-testid="issues-no-agents">No agents have a desk yet. Draft or propose work in Sanctum or Agent Office first, then assign issues here.</p>
      : <form className="mb-issues-form" onSubmit={create}><label>Issue<input value={title} onChange={(e) => setTitle(e.target.value)} minLength={3} maxLength={200} required /></label>
        <label>Agent<select value={agent} onChange={(e) => setAgent(e.target.value)}>{agents.map((a) => <option key={a}>{a}</option>)}</select></label><button type="submit">Assign issue</button></form>}
    {msg && <p role="status">{msg}</p>}
    {loaded && issues.length === 0 ? <p className="mb-muted" data-testid="issues-empty">No issues yet.</p> :
      <ul className="mb-issues" aria-label="Issues">{issues.map((i) => <li key={i.id} data-testid="issue"><strong>{i.title}</strong> <span className="mb-muted">→ {i.agent} · {new Date(i.createdAt).toLocaleString()}</span>
        <label>Status<select value={i.status} onChange={(e) => setStatus(i.id, e.target.value as Issue['status'])}>{Object.entries(LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></li>)}</ul>}
  </div>;
}
