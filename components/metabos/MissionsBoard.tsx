'use client';
import { useEffect, useState } from 'react';
type Task = { id: string; idx: number; text: string; role: string; dependsOn: number[]; status: string; inferenceId: string | null; outcome: string | null; runId: string | null };
type Mission = { id: string; request: string; planner: string; leadTaskId: string | null; createdAt: string; tasks: Task[] };
const COLS = ['blocked', 'ready', 'awaiting_inference', 'proposed', 'done', 'failed', 'cancelled'];
export function MissionsBoard() {
  const [missions, setMissions] = useState<Mission[]>([]); const [pending, setPending] = useState(0);
  const [req, setReq] = useState('Restock low inventory, then remind me to email the top customers about the restock'); const [busy, setBusy] = useState(false); const [paid, setPaid] = useState(false);
  const [error, setError] = useState<string | null>(null); const [note, setNote] = useState<string | null>(null);
  const load = async () => { try { const r = await fetch('/api/metabos/missions'); const j = await r.json(); if (!r.ok) throw new Error(j.error); setMissions(j.missions); setPending(j.pendingJev); } catch (e) { setError((e as Error).message); } };
  useEffect(() => { void load(); }, []);
  const act = async (body: object) => { setBusy(true); setError(null); setNote(null); try { const r = await fetch('/api/metabos/missions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const create = () => act({ action: 'create', request: req, paidConsent: paid });
  return <div className="mb-console mb-category">
    <span className="mb-eyebrow">BRAIN / MISSIONS</span><h1>Lead and worker missions</h1>
    <p className="mb-muted">A mission starts from a rule plan and also files a Muse Wonder lead-plan draft. Once you approve that draft and it completes, you can adopt its plan. Each ready write subtask files a worker draft. When an approved worker draft completes, it becomes a reminder proposal, and that proposal needs a second approval. Blocked subtasks start once their prerequisites finish, and are cancelled if a prerequisite fails. No model is called and nothing is written without your approval. Approve drafts in <a href="/workspace/brain/inference">Inference</a> and actions in the <a href="/workspace/brain/runtime">Jev queue</a> ({pending} pending).</p>
    {error && <p className="mb-alert" role="alert">{error}</p>}{note && <p className="mb-muted">{note}</p>}
    <section className="mb-panel" aria-label="New mission"><h2>New mission</h2>
      <textarea aria-label="Mission request" value={req} onChange={(e) => setReq(e.target.value)} rows={3} style={{ width: '100%' }} />
      <label><input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> I consent to paid Meta model calls for this mission's drafts. Each draft still needs approval.</label>
      <button onClick={create} disabled={busy || req.trim().length < 3}>{busy ? 'Working…' : 'Create mission'}</button></section>
    {!missions.length ? <p className="mb-empty">No missions yet.</p> : missions.map((m) => <section key={m.id} className="mb-panel" aria-label={`Mission ${m.request}`}>
      <h2>{m.request}</h2><p className="mb-muted">Planner: {m.planner} · {new Date(m.createdAt).toLocaleString()}{m.leadTaskId ? ` · lead draft ${m.leadTaskId.slice(0, 8)}` : ''}</p>
      <button onClick={() => act({ action: 'advance', missionId: m.id })} disabled={busy}>Refresh and advance</button>{m.leadTaskId && <button onClick={() => act({ action: 'adoptLeadPlan', missionId: m.id })} disabled={busy}>Adopt lead plan</button>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 8 }}>{COLS.map((c) => <div key={c} data-col={c}><h3>{c}</h3>
        {m.tasks.filter((t) => t.status === c).map((t) => <article key={t.id} className="mb-card" data-task-status={t.status}><strong>#{t.idx} {t.role}</strong><p>{t.text}</p>
          {t.dependsOn.length > 0 && <small className="mb-muted">After #{t.dependsOn.join(', #')}</small>}{t.outcome && <p className="mb-muted">{t.outcome}</p>}</article>)}</div>)}</div>
    </section>)}
  </div>;
}
