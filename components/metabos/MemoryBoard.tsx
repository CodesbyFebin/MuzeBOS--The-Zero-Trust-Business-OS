'use client';
import { useEffect, useState } from 'react';
import { postTo, InferenceNote, SignedInAs, type Me } from './bizClient';
type Mem = { id: string; layer: string; scope: string; text: string; status: string; author: string; promotedBy: string | null };
const post = postTo('/api/metabos/memory');
export function MemoryBoard() {
  const [d, setD] = useState<{ memory: Mem[]; me: Me; layers: Record<string, string>; departments: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ layer: 'L2', scope: 'finance', text: '' }); const [task, setTask] = useState<string | null>(null);
  const [ctx, setCtx] = useState({ role: 'finance', sessionId: 'demo', query: '' }); const [ctxOut, setCtxOut] = useState<{ entries: Mem[]; used: number; budget: number } | null>(null);
  const load = async () => { try { const r = await fetch('/api/metabos/memory'); const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); } catch (e) { setError((e as Error).message); } };
  useEffect(() => { void load(); }, []);
  const run = (fn: () => Promise<unknown>) => async () => { setError(null); try { await fn(); await load(); } catch (e) { setError((e as Error).message); } };
  return <div className="mb-console mb-category">
    <span className="mb-eyebrow">BRAIN / MEMORY</span><h1>Layered memory</h1>
    <p className="mb-muted">L1 session, L2 department, L3 company, L4 owner preferences. People write trusted notes. Agent and Muse notes stay drafts until a person promotes them. Agents get only trusted notes, and never another department&apos;s.</p>
    {error && <p className="mb-alert" role="alert">{error}</p>}
    {d && <>
      <section className="mb-panel" aria-label="Write memory"><h2>Write a note</h2><SignedInAs me={d.me} />
        <select aria-label="Layer" value={f.layer} onChange={(e) => setF({ ...f, layer: e.target.value })}>{Object.entries(d.layers).map(([k, v]) => <option key={k} value={k}>{k} {v}</option>)}</select>
        {(f.layer === 'L1' || f.layer === 'L2') && <input aria-label="Scope (department or session id)" value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })} />}
        <input aria-label="Note" value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />
        <button onClick={run(async () => { await post({ action: 'remember', memory: { layer: f.layer, scope: f.scope, text: f.text } }); setF({ ...f, text: '' }); })}>Save as trusted</button>
      </section>
      <section className="mb-panel" aria-label="Compaction"><h2>Muse compaction</h2><InferenceNote/>
        <button onClick={run(async () => { const j = await post({ action: 'requestCompaction' }); setTask(j.task.id); })}>Ask Muse to compact</button>
        {task && <button onClick={run(() => post({ action: 'readCompaction', taskId: task }))}>Load as company draft</button>}
      </section>
      <section className="mb-panel" aria-label="Context preview"><h2>What an agent would see</h2>
        <select aria-label="Agent department" value={ctx.role} onChange={(e) => setCtx({ ...ctx, role: e.target.value })}>{d.departments.map((x) => <option key={x}>{x}</option>)}</select>
        <input aria-label="Session id" value={ctx.sessionId} onChange={(e) => setCtx({ ...ctx, sessionId: e.target.value })} />
        <input aria-label="Query" value={ctx.query} onChange={(e) => setCtx({ ...ctx, query: e.target.value })} />
        <button onClick={run(async () => setCtxOut(await post({ action: 'context', ...ctx })))}>Preview context</button>
        {ctxOut && <><p className="mb-muted">{ctxOut.entries.length} note(s), {ctxOut.used} of {ctxOut.budget} characters.</p><ul>{ctxOut.entries.map((m) => <li key={m.id}>{m.layer}: {m.text}</li>)}</ul></>}
      </section>
      <table className="mb-table"><thead><tr><th>Layer</th><th>Scope</th><th>Note</th><th>Status</th><th>Author</th><th></th></tr></thead>
        <tbody>{d.memory.length === 0 ? <tr><td colSpan={6}>No memory yet.</td></tr> : d.memory.map((m) => <tr key={m.id}><td>{m.layer}</td><td>{m.scope}</td><td>{m.text}</td><td>{m.status}</td><td>{m.author}</td>
          <td>{m.status === 'draft' && <button onClick={run(() => post({ action: 'promote', id: m.id }))}>Promote</button>}<button onClick={run(() => post({ action: 'forget', id: m.id }))}>Forget</button></td></tr>)}</tbody></table>
    </>}
  </div>;
}
