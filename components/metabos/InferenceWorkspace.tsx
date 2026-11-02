'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { WebWorkerMLCEngine } from '@mlc-ai/web-llm';
import { BROWSER_MODEL, BROWSER_CONTEXT, type InferenceTask, type Lease, type Route } from '@/lib/metabos/inference/types';
type Snapshot = { counters: { total: number; awaitingApproval: number; queued: number; running: number; completed: number }; budget: { attempts: number; reservedOutputTokens: number }; tasks: InferenceTask[]; routes: Route[]; workers: { id: string; transport: string; lastSeen: string; online: boolean }[]; evidence: { seq: number; action: string; detail: string; createdAt: string }[]; auditValid: boolean; proof: { state: string; detail: string } };
export function InferenceWorkspace() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState('Tasks');
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(''), [prompt, setPrompt] = useState(''), [kind, setKind] = useState('draft'), [lane, setLane] = useState('auto');
  const [paidConsent, setPaidConsent] = useState(false);
  const [gpu, setGpu] = useState(false), [engineReady, setEngineReady] = useState(false), [engineBusy, setEngineBusy] = useState(false), [progress, setProgress] = useState('Model not loaded');
  const [selected, setSelected] = useState<string | null>(null), [children, setChildren] = useState('');
  const browserId = useRef('');
  const engine = useRef<WebWorkerMLCEngine | null>(null), worker = useRef<Worker | null>(null), stop = useRef(false), alive = useRef(true);
  async function refresh(signal?: AbortSignal) {
    const response = await fetch('/api/inference', { cache: 'no-store', signal }); const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to read inference state');
    if (alive.current) { setSnapshot(data); setError(''); }
  }
  useEffect(() => {
    alive.current = true; const controller = new AbortController(); setGpu(Boolean((navigator as Navigator & { gpu?: unknown }).gpu));
    const update = () => { if (!document.hidden) refresh(controller.signal).catch(e => { if (e.name !== 'AbortError' && alive.current) setError('Refresh failed. The last snapshot is retained.'); }); };
    update(); const timer = setInterval(update, 5000); window.addEventListener('focus', update);
    return () => { alive.current = false; stop.current = true; clearInterval(timer); window.removeEventListener('focus', update); controller.abort(); void engine.current?.unload().catch(() => {}); worker.current?.terminate(); };
  }, []);
  async function request(payload: unknown) {
    const response = await fetch('/api/inference', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(payload) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Inference operation failed'); return data.result;
  }
  async function command(payload: unknown) {
    setBusy(true); setError(''); setMessage('');
    try { const result = await request(payload); await refresh(); setMessage('Operation saved. Inference outputs remain drafts.'); return result; }
    catch (e) { setError(e instanceof Error ? e.message : 'Operation failed'); }
    finally { setBusy(false); }
  }
  async function loadEngine() {
    setEngineBusy(true); setError('');
    try {
      if (!(navigator as Navigator & { gpu?: unknown }).gpu) throw new Error('WebGPU is unavailable on this browser. Use a supported HTTPS device or configured server worker.');
      const webllm = await import('@mlc-ai/web-llm');
      if (!webllm.prebuiltAppConfig.model_list.some(m => m.model_id === BROWSER_MODEL)) throw new Error('Pinned browser model is not available in this WebLLM build.');
      worker.current = new Worker(new URL('../../lib/metabos/inference/webllm.worker.ts', import.meta.url), { type: 'module' });
      engine.current = await webllm.CreateWebWorkerMLCEngine(worker.current, BROWSER_MODEL, { initProgressCallback: p => { if (alive.current) setProgress(p.text); } }, { context_window_size: BROWSER_CONTEXT });
      if (alive.current) { setEngineReady(true); setProgress('Browser model loaded'); }
    } catch (e) { worker.current?.terminate(); worker.current = null; engine.current = null; setError(e instanceof Error ? e.message : 'Browser model loading failed'); }
    finally { if (alive.current) setEngineBusy(false); }
  }
  async function runBrowser() {
    if (!engine.current) return;
    setEngineBusy(true); stop.current = false; setError('');
    if (!browserId.current) browserId.current = 'browser-' + crypto.randomUUID();
    try {
      for (let index = 0; index < 3 && !stop.current; index++) {
        const lease = await request({ action: 'claimBrowser', workerId: browserId.current }) as Lease | null;
        if (!lease) { setMessage('No approved browser tasks are queued.'); break; }
        setMessage(`Running: ${lease.task.payload.title}`); await refresh();
        let leaseFailed = false;
        const timer = setInterval(() => { request({ action: 'renewBrowser', id: lease.task.id, token: lease.token }).catch(() => { leaseFailed = true; engine.current?.interruptGenerate(); }); }, 20000);
        try {
          const reply = await engine.current.chat.completions.create({ messages: [{ role: 'system', content: 'Produce a concise business draft only. Do not claim to execute actions or tools.' }, { role: 'user', content: lease.task.payload.prompt }], max_tokens: lease.task.payload.maxTokens });
          if (stop.current || leaseFailed) throw new Error('Browser worker stopped or its lease expired');
          await request({ action: 'completeBrowser', id: lease.task.id, token: lease.token, output: reply.choices[0]?.message.content || '', ...(reply.usage ? { usage: { promptTokens: reply.usage.prompt_tokens, completionTokens: reply.usage.completion_tokens } } : {}) });
        } catch (e) { await request({ action: 'failBrowser', id: lease.task.id, token: lease.token }).catch(() => {}); throw e; }
        finally { clearInterval(timer); }
        await refresh();
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Browser inference failed'); }
    finally { if (alive.current) setEngineBusy(false); }
  }
  const detail = snapshot?.tasks.find(t => t.id === selected);
  return <div className="mb-console mb-category mb-inference"><header className="mb-heading"><div><span className="mb-eyebrow">BRAIN / DURABLE INFERENCE</span><h1>Inference & agent workspace</h1><p>Small drafts, medium analysis and large planning. Jev reviews every dispatch; outputs never execute business tools.</p></div><button className="mb-button" onClick={() => refresh().catch(e => setError(e.message))}>Refresh inference</button></header>
    {error && <p role="alert" className="mb-alert">{error}</p>}{message && <p role="status">{message}</p>}
    <p className="mb-muted">UTC daily dispatch budget: {snapshot?.budget.attempts ?? "—"}/50 attempts · {snapshot?.budget.reservedOutputTokens ?? "—"}/65,536 reserved output tokens. This is not a currency spending cap.</p><nav className="mb-inference-tabs" aria-label="Inference views">{['Tasks', 'Models', 'Jev approvals', 'Workers', 'Evidence'].map(name => <button key={name} className="mb-button" aria-pressed={tab === name} onClick={() => setTab(name)}>{name}</button>)}</nav>
    <div className="mb-tool-grid"><div className="mb-panel"><span>Awaiting Jev review</span><h2>{snapshot ? snapshot.counters.awaitingApproval : '—'}</h2></div><div className="mb-panel"><span>Running drafts</span><h2>{snapshot ? snapshot.counters.running : '—'}</h2></div><div className="mb-panel"><span>Recent worker heartbeats</span><h2>{snapshot ? snapshot.workers.filter(w => w.online).length : '—'}</h2></div></div>
    {tab === 'Tasks' && <><form className="mb-panel mb-source-form" onSubmit={e => { e.preventDefault(); void command({ action: 'create', data: { title, prompt, kind, lane, paidConsent } }); }}><h2>Create an inference task</h2><label>Task title<input required maxLength={160} value={title} onChange={e => setTitle(e.target.value)}/></label><label>Task instructions<textarea required rows={4} maxLength={12000} value={prompt} onChange={e => setPrompt(e.target.value)}/></label><div className="mb-inference-fields"><label>Work type<select value={kind} onChange={e => setKind(e.target.value)}>{['draft', 'analysis', 'plan', 'code'].map(k => <option key={k}>{k}</option>)}</select></label><label>Model route<select value={lane} onChange={e => setLane(e.target.value)}>{['auto', 'browser', 'ollama', 'meta', 'baseten', 'openrouter', 'openclaw', 'muse-code'].map(k => <option key={k}>{k}</option>)}</select></label></div><label className="mb-inference-consent"><input type="checkbox" checked={paidConsent} onChange={e => setPaidConsent(e.target.checked)}/>Allow a paid route for this task, subject to server opt-in and Jev review</label><button className="mb-primary mb-button" disabled={busy}>Create task for review</button><p className="mb-muted">Input and output drafts are durable local records. Do not include unnecessary secrets. Code requests produce proposals; they do not execute code.</p></form>
    <section className="mb-panel"><h2>Browser inference</h2><p className="mb-muted">{gpu ? 'WebGPU API detected; hardware/model execution not yet verified.' : 'WebGPU unavailable in this browser.'} Loading downloads model weights to this device. A browser worker is not an unattended server.</p><p>{progress}</p><div className="mb-source-shortcuts"><button className="mb-button" disabled={engineBusy || engineReady} onClick={() => void loadEngine()}>Load local Llama model</button><button className="mb-primary mb-button" disabled={!engineReady || engineBusy} onClick={() => void runBrowser()}>Run up to 3 approved browser tasks</button>{engineBusy && <button className="mb-button" onClick={() => { stop.current = true; engine.current?.interruptGenerate(); }}>Stop browser generation</button>}</div></section></>}
    {(tab === 'Tasks' || tab === 'Jev approvals') && <section className="mb-panel"><h2>{tab === 'Tasks' ? 'Task board · latest 100' : 'Jev review desk · latest 100'}</h2>{!snapshot ? <p>Loading inference records…</p> : !snapshot.tasks.length ? <p>No inference tasks yet.</p> : snapshot.tasks.filter(t => tab !== 'Jev approvals' || t.state === 'awaiting_approval').map(task => <article className="mb-booking-row" key={task.id}><div><strong>{task.payload.title}</strong><p>{task.payload.agent} · {task.payload.tier} · {task.payload.provider} · {task.state}</p><p className="mb-muted">{task.payload.model} · {task.attempts}/2 attempts · {task.payload.maxTokens} output tokens maximum</p>{task.error && <p>{task.error}</p>}{!snapshot.routes.find(r => r.provider === task.payload.provider)?.configured && <p className="mb-muted">Not configured: {snapshot.routes.find(r => r.provider === task.payload.provider)?.reason}</p>}</div><div className="mb-source-shortcuts"><button className="mb-button" onClick={() => { setSelected(task.id); setChildren(''); }}>Review task</button>{['awaiting_approval', 'queued', 'running'].includes(task.state) && <button className="mb-button" disabled={busy} onClick={() => void command({ action: 'cancel', id: task.id })}>Cancel task</button>}</div></article>)}</section>}
    {detail && (tab === 'Tasks' || tab === 'Jev approvals') && <section className="mb-panel mb-source-form"><h2>Exact task review</h2><strong>{detail.payload.title}</strong><pre>{detail.payload.prompt}</pre><p>Route: {detail.payload.provider} / {detail.payload.model}</p><p>Maximum output: {detail.payload.maxTokens} tokens. No shell, payment, publishing or invoice issuance scope.</p><p className="mb-source-hash">Payload SHA-256: {detail.hash}</p>{detail.state === 'awaiting_approval' && <button className="mb-primary mb-button" disabled={busy || !snapshot?.routes.find(r => r.provider === detail.payload.provider)?.configured} onClick={() => void command({ action: 'approve', id: detail.id, hash: detail.hash })}>Jev: approve exact task</button>}{detail.output && <><h3>Model draft · requires human review</h3><pre>{detail.output}</pre><p className="mb-source-hash">Output SHA-256: {detail.outputHash}</p>{['meta', 'baseten'].includes(detail.payload.provider) && <section><h3>Propose a business action</h3><p className="mb-muted">Only a strict reminders.create JSON proposal is accepted. Sending it to Jev does not approve or execute it.</p><button className="mb-button" disabled={busy} onClick={() => void command({ action: 'proposeAction', id: detail.id })}>Send proposal to Jev</button><Link className="mb-button" href="/workspace/brain/runtime#jev">Open Jev action approvals</Link></section>}<h3>Delegate bounded subtasks</h3><p className="mb-muted">Review the proposed tasks before creating a batch. Maximum five children, depth two; each child needs a new Jev approval.</p><label>Subtasks JSON<textarea rows={5} value={children} onChange={e => setChildren(e.target.value)} placeholder={'[{"title":"Draft reply","prompt":"Write a short reply","kind":"draft"}]'}/></label><button className="mb-button" disabled={busy} onClick={() => { try { void command({ action: 'delegate', id: detail.id, children: JSON.parse(children) }); } catch { setError('Supply a JSON array of bounded subtasks.'); } }}>Create subtasks for review</button></>}<button className="mb-button" onClick={() => setSelected(null)}>Close task review</button></section>}
    {tab === 'Models' && <section><h2>Model routes & configuration</h2><p className="mb-muted">Configured means required settings exist, not a successful connection. No automatic cloud fallback. Muse Wonder Full is not a generic API model.</p><div className="mb-tool-grid">{snapshot?.routes.map(route => <article className="mb-panel" key={route.provider}><h2>{route.provider}</h2><p>{route.model || 'Model not selected'}</p><span className="mb-badge">{route.configured ? 'Configuration present' : 'Not configured'}</span><p className="mb-muted">{route.reason}</p><Link className="mb-link" href="/setup">Set up server credentials</Link></article>)}</div></section>}
    {tab === 'Workers' && <section className="mb-panel"><h2>Observed workers</h2><p className="mb-muted">At most two active leases. Server workers use persistent SQLite and must run under a supervisor for unattended operation. Browser workers stop when the browser is suspended.</p>{!snapshot?.workers.length ? <p>No worker heartbeats observed.</p> : snapshot.workers.map(w => <article className="mb-booking-row" key={w.id}><div><strong>{w.transport} · {w.online ? 'Recent heartbeat' : 'Heartbeat stale'}</strong><p>{w.lastSeen}</p><p className="mb-source-hash">{w.id}</p></div></article>)}</section>}
    {tab === 'Evidence' && <section className="mb-panel"><h2>Inference evidence</h2><p>Local audit chain: {snapshot ? snapshot.auditValid ? 'Valid' : 'Invalid' : 'Not loaded'}</p><p className="mb-muted">{snapshot?.proof.detail}</p>{snapshot?.evidence.map(event => <article className="mb-booking-row" key={event.seq}><div><strong>{event.action}</strong><p className="mb-source-hash">{event.detail}</p><small>{event.createdAt}</small></div></article>)}</section>}
    <footer className="mb-footer">Jev is MeTaBos’s deterministic operator approval gate, not a separate verified product. Existing invoice approvals remain independent.</footer>
  </div>;
}
