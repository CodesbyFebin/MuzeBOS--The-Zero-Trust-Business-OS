'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

type Tier = 'small' | 'medium' | 'large';
type ModelRef = { provider: string; model: string; family: string; note: string };
type Decision = { requested: string; classified: Tier | null; tier: Tier; chosen: ModelRef | null; fallback: boolean; reasons: string[]; skipped: { model: string; provider: string; why: string }[] };
type Usage = { promptTokens: number; completionTokens: number; totalTokens: number } | null;
type Provider = { id: string; name: string; state: string; reason: string; runsOn: string };
type Run = { id: string; status: string; payloadHash: string; approvedHash: string | null; error: string | null; createdAt: string; input: { taskId: string; role: string; args: { title: string }; rationale: string; source: string; model: string | null }; events: { seq: number; type: string; detail: string }[] };
type Info = { verifiedAt: string; webllmVersion: string; tiers: Record<Tier, { label: string; purpose: string; candidates: ModelRef[] }>; providers: Provider[]; muse: string[]; queue: Run[] };
type Msg = { who: 'you' | 'model' | 'system'; text: string; decision?: Decision; usage?: Usage; model?: string | null };
type Sub = { id: string; text: string; role: string; tier: Tier; why: string; wantsWrite: boolean; note: string; runId: string | null; error: string | null; decision: Decision | null };
type Engine = { chat: { completions: { create: (o: { messages: { role: string; content: string }[] }) => Promise<{ choices: { message: { content: string } }[]; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }> } } };

const STATE_LABEL: Record<string, string> = { ready: 'Ready', needs_key: 'Needs key', unconfigured: 'Not configured', browser_only: 'Browser only' };
const WEBLLM_MODEL = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';

export function BrainRuntime() {
  const [info, setInfo] = useState<Info | null>(null); const [error, setError] = useState(''); const [status, setStatus] = useState('');
  const [tier, setTier] = useState<'auto' | Tier>('auto'); const [input, setInput] = useState(''); const [msgs, setMsgs] = useState<Msg[]>([]);
  const [task, setTask] = useState(''); const [subs, setSubs] = useState<Sub[]>([]); const [busy, setBusy] = useState(false);
  const [gpu, setGpu] = useState<'checking' | 'supported' | 'unsupported'>('checking'); const [gpuWhy, setGpuWhy] = useState('');
  const [loadPct, setLoadPct] = useState(''); const engine = useRef<Engine | null>(null); const [engineReady, setEngineReady] = useState(false);
  const [tab, setTab] = useState<'chat' | 'board' | 'jev'>('chat');

  const load = useCallback(async () => { try { const r = await fetch('/api/ai', { cache: 'no-store' }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setInfo(d); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Runtime unavailable'); } }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const nav = navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } };
    if (!nav.gpu) { setGpu('unsupported'); setGpuWhy('This browser does not expose WebGPU (navigator.gpu is missing).'); return; }
    nav.gpu.requestAdapter().then((a) => { if (a) setGpu('supported'); else { setGpu('unsupported'); setGpuWhy('WebGPU is present but no GPU adapter is available.'); } }).catch(() => { setGpu('unsupported'); setGpuWhy('WebGPU adapter request failed.'); });
  }, []);

  async function loadEngine() {
    setBusy(true); setLoadPct('Starting');
    try {
      const mod = await import(/* webpackIgnore: true */ `https://esm.run/@mlc-ai/web-llm@${info?.webllmVersion ?? '0.2.86'}`);
      engine.current = await mod.CreateMLCEngine(WEBLLM_MODEL, { initProgressCallback: (p: { text: string }) => setLoadPct(p.text) });
      setEngineReady(true); setLoadPct('Loaded');
    } catch (e) { setLoadPct(''); setError(`On-device model failed to load: ${e instanceof Error ? e.message : 'unknown error'}`); }
    finally { setBusy(false); }
  }

  async function post(body: object) { const r = await fetch('/api/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Request failed'); return d; }

  async function send() {
    const text = input.trim(); if (!text) return;
    setBusy(true); setError(''); setInput(''); setMsgs((m) => [...m, { who: 'you', text }]);
    try {
      const d = await post({ action: 'chat', message: text, tier, webgpu: engineReady });
      if (d.runInBrowser && engine.current) {
        const reply = await engine.current.chat.completions.create({ messages: [{ role: 'user', content: text }] });
        const u = reply.usage ? { promptTokens: reply.usage.prompt_tokens, completionTokens: reply.usage.completion_tokens, totalTokens: reply.usage.total_tokens } : null;
        setMsgs((m) => [...m, { who: 'model', text: reply.choices[0]?.message.content ?? '', decision: d.decision, usage: u, model: WEBLLM_MODEL }]);
        void post({ action: 'logBrowserRun', decision: d.decision.reasons.join(' ').slice(0, 600), usage: u ? `${u.totalTokens} tokens` : 'unavailable' }).catch(() => undefined);
      } else if (d.reply) setMsgs((m) => [...m, { who: 'model', text: d.reply, decision: d.decision, usage: d.usage, model: d.model }]);
      else setMsgs((m) => [...m, { who: 'system', text: 'No model answered. See the routing decision.', decision: d.decision, usage: null }]);
    } catch (e) { setError(e instanceof Error ? e.message : 'Chat failed'); } finally { setBusy(false); }
  }

  async function sortIt() {
    setBusy(true); setError('');
    try { const d = await post({ action: 'swarm', task, webgpu: false }); setSubs(d.subtasks); setStatus(`Sorted into ${d.subtasks.length} subtask(s). Proposals wait in the Jev queue.`); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Sort failed'); } finally { setBusy(false); }
  }

  async function gate(body: object, ok: string) {
    setBusy(true); setError('');
    try { const r = await fetch('/api/workflow-runs', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(body) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Request failed'); setStatus(ok); }
    catch (e) { setError(e instanceof Error ? e.message : 'Request failed'); } finally { await load(); setBusy(false); }
  }

  const measured = msgs.filter((m) => m.usage).reduce((a, m) => ({ p: a.p + m.usage!.promptTokens, c: a.c + m.usage!.completionTokens, t: a.t + m.usage!.totalTokens }), { p: 0, c: 0, t: 0 });
  const unknown = msgs.filter((m) => m.who === 'model' && !m.usage).length;
  const pending = info?.queue.filter((r) => r.status === 'awaiting_approval').length ?? 0;

  const decisionView = (d: Decision) => <details className="ai-decision"><summary>Routed to {d.chosen ? `${d.chosen.model} (${d.chosen.provider})` : 'no model'} · {d.tier}{d.fallback ? ' · fallback' : ''}</summary><ul>{d.reasons.map((r, i) => <li key={i}>{r}</li>)}{d.skipped.map((s, i) => <li key={`s${i}`} className="mb-muted">Skipped {s.model} ({s.provider}): {s.why}</li>)}</ul></details>;

  return <div className="mb-console mb-category ai-runtime">
    <span className="mb-eyebrow">BRAIN / AI RUNTIME</span><h1>AI runtime</h1>
    <p className="mb-muted">Chat with a routed model, split work across role agents, and approve every write in the Jev queue. Agents only propose; nothing writes until you approve the exact payload.</p>
    {error && <p className="mb-alert" role="alert">{error}</p>}
    <p role="status">{status}</p>
    <nav className="mb-tabs" aria-label="Runtime sections">{(['chat', 'board', 'jev'] as const).map((t) => <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t === 'chat' ? 'Chat' : t === 'board' ? 'Task board' : `Jev queue (${pending})`}</button>)}</nav>

    {tab === 'chat' && <div className="ai-grid">
      <section className="mb-panel" aria-label="Chat"><h2>Chat</h2>
        <label className="ai-row">Tier<select aria-label="Tier" value={tier} onChange={(e) => setTier(e.target.value as 'auto' | Tier)}><option value="auto">Auto (router decides)</option><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label>
        <div className="ai-log" aria-live="polite">{!msgs.length ? <p className="mb-empty">No messages yet.</p> : msgs.map((m, i) => <article key={i} className={`ai-msg ai-${m.who}`} data-who={m.who}><strong>{m.who === 'you' ? 'You' : m.who === 'model' ? (m.model ?? 'Model') : 'Runtime'}</strong><p>{m.text}</p>{m.decision && decisionView(m.decision)}{m.who !== 'you' && <small className="mb-muted" data-usage>{m.usage ? `${m.usage.promptTokens} in / ${m.usage.completionTokens} out tokens (measured)` : 'Usage unavailable'}</small>}</article>)}</div>
        <form className="ai-row" onSubmit={(e) => { e.preventDefault(); void send(); }}><input aria-label="Message" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about your business" maxLength={4000}/><button className="mb-primary" disabled={busy || !input.trim()}>Send</button></form>
      </section>
      <section className="mb-panel" aria-label="Usage"><h2>Token usage</h2>
        <p data-testid="usage-total">{measured.t ? `${measured.t} tokens measured (${measured.p} in, ${measured.c} out)` : 'Usage unavailable'}</p>
        {unknown > 0 && <p className="mb-muted">{unknown} repl{unknown === 1 ? 'y' : 'ies'} without provider usage data are not counted.</p>}
        <p className="mb-muted">Only provider-reported counts are shown. Nothing is estimated.</p>
      </section>
      <section className="mb-panel" aria-label="Providers"><h2>Providers</h2>
        <ul className="ai-list">{info?.providers.map((p) => <li key={p.id} data-provider={p.id} data-state={p.state}><strong>{p.name}</strong> <span className="mb-badge">{STATE_LABEL[p.state] ?? p.state}</span><br/><small className="mb-muted">{p.reason}</small></li>)}</ul>
        <div data-webgpu={gpu}><strong>On-device (WebLLM)</strong> <span className="mb-badge">{gpu === 'checking' ? 'Checking' : gpu === 'supported' ? (engineReady ? 'Loaded' : 'Supported') : 'Unsupported'}</span>
          {gpu === 'unsupported' && <p className="mb-muted">{gpuWhy} The router will skip on-device models and use a server provider if one is configured.</p>}
          {gpu === 'supported' && !engineReady && <p><button disabled={busy} onClick={() => void loadEngine()}>Load {WEBLLM_MODEL}</button><br/><small className="mb-muted">Downloads the model to this browser (several hundred MB). {loadPct}</small></p>}
        </div>
      </section>
      <section className="mb-panel" aria-label="Tiers"><h2>Tiers <small>verified {info?.verifiedAt}</small></h2>
        {info && (Object.keys(info.tiers) as Tier[]).map((t) => <div key={t} data-tier={t}><strong>{info.tiers[t].label}</strong> <small className="mb-muted">{info.tiers[t].purpose}</small><ol>{info.tiers[t].candidates.map((c) => <li key={c.provider + c.model}><code>{c.model}</code> · {c.provider} · {c.family}</li>)}</ol></div>)}
        <h3>Muse findings</h3><ul>{info?.muse.map((m, i) => <li key={i}>{m}</li>)}</ul>
      </section>
    </div>}

    {tab === 'board' && <section className="mb-panel" aria-label="Swarm task board"><h2>Swarm task board</h2>
      <form onSubmit={(e) => { e.preventDefault(); void sortIt(); }}><textarea aria-label="Task for the swarm" value={task} onChange={(e) => setTask(e.target.value)} rows={3} maxLength={4000} placeholder="Example: Restock tea before Friday. Then remind me to follow up with Asha about her invoice."/><button className="mb-primary" disabled={busy || task.trim().length < 3}>Sort and assign</button></form>
      {!subs.length ? <p className="mb-empty">No subtasks yet.</p> : <div className="ai-board">{subs.map((s) => <article key={s.id} className="mb-panel" data-subtask={s.id} data-role={s.role}><strong>{s.text}</strong><p><span className="mb-badge">{s.role}</span> <span className="mb-badge">{s.tier}</span></p><small className="mb-muted">{s.why}</small><p>{s.note}</p>{s.error && <p className="mb-alert">{s.error}</p>}{s.runId && <p className="mb-muted">Waiting in Jev queue.</p>}{s.decision && decisionView(s.decision)}</article>)}</div>}
    </section>}

    {tab === 'jev' && <section className="mb-panel" aria-label="Jev approval queue"><h2>Jev approval queue <small>{pending} waiting</small></h2>
      <p className="mb-muted">Each approval is bound to the payload hash shown. A changed proposal has a different hash and is refused. There is no automatic approval.</p>
      {!info?.queue.length ? <p className="mb-empty">No agent proposals yet.</p> : info.queue.map((r) => <article key={r.id} className="mb-panel ai-proposal" data-run={r.id} data-status={r.status}>
        <strong>{r.input.args.title}</strong> <span className="mb-badge">{r.status.replace('_', ' ')}</span>
        <p className="mb-muted">{r.input.role} agent · {r.input.source === 'rule' ? 'rule-based draft, no model' : `model ${r.input.model}`} · tool reminders.create</p>
        {r.input.rationale && <p><small>Agent rationale (untrusted): {r.input.rationale}</small></p>}
        <p><small>Payload hash <code>{r.payloadHash}</code></small></p>
        {r.error && <p className="mb-alert">{r.error}</p>}
        <div className="mb-actions">
          {r.status === 'awaiting_approval' && <button className="mb-primary" disabled={busy} onClick={() => void gate({ action: 'approve', id: r.id, hash: r.payloadHash }, 'Approved. Run it to create the reminder.')}>Approve this payload</button>}
          {r.status === 'running' && <button className="mb-primary" disabled={busy} onClick={() => void gate({ action: 'execute', id: r.id }, 'Executed the approved write.')}>Run approved write</button>}
          {!['succeeded', 'cancelled', 'compensated', 'timed_out', 'failed'].includes(r.status) && <button disabled={busy} onClick={() => void gate({ action: 'cancel', id: r.id }, 'Rejected. Nothing was written.')}>Reject</button>}
          {r.status === 'succeeded' && <a className="mb-link" href="/">Reminder created. Close it from Mission Control.</a>}
        </div>
        <details><summary>Evidence ({r.events.length})</summary><ul>{r.events.map((e) => <li key={e.seq}><code>{e.type}</code> {e.detail}</li>)}</ul></details>
      </article>)}
    </section>}

    <section className="mb-panel" aria-label="Out of scope"><h2>Not included</h2><p className="mb-muted">No 24/7 agent hosting and no zkVM proofs. Agents run only while a request is open; always-on agents and proof generation need a server you operate.</p></section>
  </div>;
}
