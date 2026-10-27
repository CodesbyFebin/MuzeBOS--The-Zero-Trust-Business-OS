'use client';
import { useEffect, useState } from 'react';
type Task = { id: string; idx: number; text: string; role: string; dependsOn: number[]; status: string; worker: string | null; outcome: string | null; runId: string | null };
type Mission = { id: string; request: string; planner: string; createdAt: string; tasks: Task[] };
const COLS = ['blocked', 'ready', 'proposed', 'done', 'failed', 'cancelled'];
export function MissionsBoard() {
  const [missions, setMissions] = useState<Mission[]>([]); const [pending, setPending] = useState(0);
  const [req, setReq] = useState('Restock low inventory, then remind me to email the top customers about the restock'); const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null); const [note, setNote] = useState<string | null>(null);
  const load = async () => { try { const r = await fetch('/api/muzebos/missions'); const j = await r.json(); if (!r.ok) throw new Error(j.error); setMissions(j.missions); setPending(j.pendingJev); } catch (e) { setError((e as Error).message); } };
  useEffect(() => { void load(); }, []);
  const create = async () => { setBusy(true); setError(null); try { const r = await fetch('/api/muzebos/missions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'create', request: req }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); setNote(j.note); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  return <div className="mb-console mb-category">
    <span className="mb-eyebrow">BRAIN / MISSIONS</span><h1>Lead and worker missions</h1>
    <p className="mb-muted">A lead agent (Muse Wonder when META_MODEL_API_KEY is set, otherwise a rule planner) splits your request into subtasks with dependencies. Worker agents (Muse Spark) run each ready task. Workers cannot write: every write becomes a Jev proposal. Blocked tasks start once their prerequisites finish. {pending} proposal(s) are waiting in the <a href="/workspace/brain/runtime">Jev queue</a>.</p>
    {error && <p className="mb-alert" role="alert">{error}</p>}{note && <p className="mb-muted">{note}</p>}
    <section className="mb-panel" aria-label="New mission"><h2>New mission</h2>
      <textarea aria-label="Mission request" value={req} onChange={(e) => setReq(e.target.value)} rows={3} style={{ width: '100%' }} />
      <button onClick={create} disabled={busy || req.trim().length < 3}>{busy ? 'Planning…' : 'Plan and run'}</button></section>
    {!missions.length ? <p className="mb-empty">No missions yet.</p> : missions.map((m) => <section key={m.id} className="mb-panel" aria-label={`Mission ${m.request}`}>
      <h2>{m.request}</h2><p className="mb-muted">Planner: {m.planner} · {new Date(m.createdAt).toLocaleString()}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 8 }}>{COLS.map((c) => <div key={c} data-col={c}><h3>{c}</h3>
        {m.tasks.filter((t) => t.status === c).map((t) => <article key={t.id} className="mb-card" data-task-status={t.status}><strong>#{t.idx} {t.role}</strong><p>{t.text}</p>
          {t.dependsOn.length > 0 && <small className="mb-muted">After #{t.dependsOn.join(', #')}</small>}{t.outcome && <p className="mb-muted">{t.worker ? `${t.worker}: ` : ''}{t.outcome}</p>}</article>)}</div>)}</div>
    </section>)}
  </div>;
}
