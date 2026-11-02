'use client';
import { useEffect, useState } from 'react';
type P = { id: string; goal: string; stage: string; guard: string; jevRunId: string; deadline: string };
export function Pipelines() {
  const [list, setList] = useState<P[] | null>(null); const [msg, setMsg] = useState('');
  const [goal, setGoal] = useState(''); const [research, setResearch] = useState(''); const [draft, setDraft] = useState('');
  const load = () => fetch('/api/b3/pipelines').then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setList(j.pipelines); }).catch((e) => setMsg(String(e.message ?? e)));
  useEffect(() => { load(); }, []);
  const go = async (e: React.FormEvent) => { e.preventDefault(); setMsg('');
    const r = await fetch('/api/b3/pipelines', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal, research, draft, role: 'writer' }) });
    const j = await r.json(); setMsg(r.ok ? `Stopped at Jev (review: ${j.guard?.verdict ?? 'n/a'}). Nothing was sent.` : j.error ?? 'Failed'); load(); };
  return (<section className="mb-v3" aria-labelledby="pl-h">
    <h1 id="pl-h" className="mb-heading">Pipelines</h1>
    <p className="mb-muted">Research → draft → review (Llama Guard) → Jev. The pipeline stops at Jev and is marked blocked if nobody answers before the deadline.</p>
    <form onSubmit={go} className="mb-panel" aria-label="Start a pipeline" style={{ display: 'grid', gap: 8, padding: 12 }}>
      <label>Goal <input required minLength={3} maxLength={200} value={goal} onChange={(e) => setGoal(e.target.value)} style={{ minHeight: 44 }} /></label>
      <label>Research notes <textarea required rows={3} value={research} onChange={(e) => setResearch(e.target.value)} /></label>
      <label>Draft <textarea required rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} /></label>
      <button type="submit" style={{ minHeight: 44 }}>Review and send to Jev</button>
    </form>
    {msg && <p role="status">{msg}</p>}
    {list === null ? <p>Loading…</p> : list.length === 0 ? <p>No records yet</p> :
      <ul data-testid="pipelines">{list.map((p) => <li key={p.id}><strong>{p.goal}</strong> · <span data-stage={p.stage}>{p.stage.replace('_', ' ')}</span> · guard {p.guard} · deadline {p.deadline.slice(0, 16)} <a href={`/brain?run=${p.jevRunId}`}>Open in Jev</a></li>)}</ul>}
  </section>);
}
