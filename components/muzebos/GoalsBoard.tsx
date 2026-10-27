'use client';
import { useEffect, useState } from 'react';
type Goal = { id: string; title: string; unit: string; start: number; target: number; current: number; due: string | null; progress: number; projects: { id: string; title: string; done: number }[]; checkins: { id: string; status: string; value: number; note: string; createdAt: string }[] };
type Draft = { status: string; note: string; source: string; note2?: string };
const post = async (body: object) => { const r = await fetch('/api/muzebos/goals', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; };
export function GoalsBoard() {
  const [goals, setGoals] = useState<Goal[]>([]); const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', unit: '', start: '0', target: '', due: '' });
  const [drafts, setDrafts] = useState<Record<string, Draft & { value: string }>>({}); const [proj, setProj] = useState<Record<string, string>>({}); const [tasks, setTasks] = useState<Record<string, string>>({});
  const load = async () => { try { const r = await fetch('/api/muzebos/goals'); const j = await r.json(); if (!r.ok) throw new Error(j.error); setGoals(j.goals); } catch (e) { setError((e as Error).message); } };
  useEffect(() => { void load(); }, []);
  const run = (f: () => Promise<unknown>) => async () => { setError(null); try { await f(); await load(); } catch (e) { setError((e as Error).message); } };
  return <div className="mb-console mb-category">
    <span className="mb-eyebrow">BRAIN / GOALS</span><h1>Goals, projects and check-ins</h1>
    <p className="mb-muted">Set measurable goals, link projects, and post check-ins. The rule draft is instant and computed from the numbers. A Muse Spark draft is filed as an inference task: approve it in Inference, then load it here. Drafts are never saved until you post them.</p>
    {error && <p className="mb-alert" role="alert">{error}</p>}
    <section className="mb-panel" aria-label="New goal"><h2>New goal</h2>
      <input aria-label="Goal title" placeholder="Reach 200 monthly orders" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <input aria-label="Unit" placeholder="unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
      <input aria-label="Start" type="number" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
      <input aria-label="Target" type="number" placeholder="target" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
      <input aria-label="Due" type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
      <button onClick={run(() => post({ action: 'createGoal', title: form.title, unit: form.unit, start: Number(form.start), target: Number(form.target), ...(form.due ? { due: form.due } : {}) }))}>Create goal</button></section>
    {!goals.length ? <p className="mb-empty">No goals yet.</p> : goals.map((g) => { const d = drafts[g.id]; return <section key={g.id} className="mb-panel" aria-label={g.title}>
      <h2>{g.title}</h2><p><progress max={100} value={g.progress} /> {g.current}{g.unit} / {g.target}{g.unit} ({g.progress}%){g.due ? ` · due ${g.due}` : ''}</p>
      <h3>Projects</h3><ul>{g.projects.map((p) => <li key={p.id}><label><input type="checkbox" checked={!!p.done} onChange={run(() => post({ action: 'toggleProject', projectId: p.id }))} /> {p.title}</label></li>)}</ul>
      <input aria-label={`New project for ${g.title}`} placeholder="Add project" value={proj[g.id] ?? ''} onChange={(e) => setProj({ ...proj, [g.id]: e.target.value })} />
      <button onClick={run(async () => { await post({ action: 'addProject', goalId: g.id, title: proj[g.id] ?? '' }); setProj({ ...proj, [g.id]: '' }); })}>Add project</button>
      <h3>Check-in</h3>
      <button onClick={run(async () => { const j = await post({ action: 'draft', goalId: g.id }); setDrafts({ ...drafts, [g.id]: { ...j.draft, value: String(g.current) } }); })}>Rule draft</button>
      <button onClick={run(async () => { const j = await post({ action: 'requestModelDraft', goalId: g.id, paidConsent: true }); setTasks({ ...tasks, [g.id]: j.task.id }); })}>Request Muse Spark draft (paid, needs approval)</button>
      {tasks[g.id] && <button onClick={run(async () => { const j = await post({ action: 'readModelDraft', taskId: tasks[g.id] }); setDrafts({ ...drafts, [g.id]: { ...j.draft, value: String(g.current) } }); })}>Load approved draft {tasks[g.id].slice(0, 8)}</button>}
      {d && <div className="mb-card"><small className="mb-muted">Draft from {d.source}{d.note2 ? ` · ${d.note2}` : ''}. Not saved.</small>
        <select aria-label="Status" value={d.status} onChange={(e) => setDrafts({ ...drafts, [g.id]: { ...d, status: e.target.value } })}>{['on_track', 'at_risk', 'off_track'].map((s) => <option key={s}>{s}</option>)}</select>
        <input aria-label="Current value" type="number" value={d.value} onChange={(e) => setDrafts({ ...drafts, [g.id]: { ...d, value: e.target.value } })} />
        <textarea aria-label="Check-in note" rows={3} style={{ width: '100%' }} value={d.note} onChange={(e) => setDrafts({ ...drafts, [g.id]: { ...d, note: e.target.value } })} />
        <button onClick={run(async () => { await post({ action: 'checkin', goalId: g.id, status: d.status, value: Number(d.value), note: d.note }); const n = { ...drafts }; delete n[g.id]; setDrafts(n); })}>Post check-in</button></div>}
      <ul>{g.checkins.map((c) => <li key={c.id}><strong>{c.status}</strong> · {c.value}{g.unit} · {new Date(c.createdAt).toLocaleDateString()}: {c.note}</li>)}</ul>
    </section>; })}
  </div>;
}
