'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type Def = { id: string; name: string; summary: string; version: number; trigger: { kind: string; description: string }; input: Record<string, string>; permissions: string[]; tools: { name: string; permission: string; idempotent: boolean; description: string }[]; approval: { required: boolean; boundTo: string; description: string }; idempotency: string; retry: { maxAttempts: number; description: string }; timeoutMs: number; compensation: string; steps: { id: string; label: string; tool: string; idempotent: boolean }[] };
type Run = { id: string; workflowId: string; status: string; payloadHash: string; approvedHash: string | null; error: string | null; createdAt: string; plan: { threshold: number; products: { id: string; sku: string; name: string; stock: number }[] }; steps: { stepId: string; status: string; attempts: number; error: string | null }[]; events: { seq: number; type: string; stepId: string | null; detail: string; createdAt: string }[] };

export function GovernedWorkflows() {
  const [data, setData] = useState<{ workflows: Def[]; runs: Run[] } | null>(null);
  const [status, setStatus] = useState(''); const [error, setError] = useState('');
  const [threshold, setThreshold] = useState('3'); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { const r = await fetch('/api/workflow-runs', { cache: 'no-store' }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setData(d); } catch (e) { setError(e instanceof Error ? e.message : 'Workflows unavailable'); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function act(body: object, ok: string) {
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/workflow-runs', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(body) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Request failed');
      setStatus(typeof ok === 'string' ? ok : ''); await load(); return d;
    } catch (e) { setError(e instanceof Error ? e.message : 'Request failed'); await load(); } finally { setBusy(false); }
  }
  const def = data?.workflows[0];
  return <section className="mb-console mb-governed" aria-label="Governed workflows">
    <span className="mb-eyebrow">WORKFLOWS / GOVERNED RUNS</span><h1>Governed workflows</h1>
    <p className="mb-muted">Definitions with declared permissions and approval gates, run by a durable engine on the business store. Every run event is also written to the <Link className="mb-link" href="/workspace/evidence">evidence chain</Link>. The <Link className="mb-link" href="/workflows">canvas editor</Link> is the inherited editor and does not execute these runs.</p>
    <p role="status" className="mb-muted">{status}</p>{error && <p role="alert" className="mb-alert">{error}</p>}
    {!data && !error && <p className="mb-muted">Loading workflows…</p>}
    {def && <article className="mb-panel" data-workflow={def.id}>
      <div className="mb-row"><h2>{def.name}</h2><span className="mb-badge">v{def.version}</span></div><p className="mb-muted">{def.summary}</p>
      <dl className="mb-defs">
        <dt>Trigger</dt><dd>{def.trigger.kind}: {def.trigger.description}</dd>
        <dt>Input</dt><dd>{Object.entries(def.input).map(([k, v]) => <span key={k}><code>{k}</code>: {v} </span>)}</dd>
        <dt>Permissions</dt><dd>{def.permissions.map((p) => <code key={p}>{p} </code>)}</dd>
        <dt>Permitted tools</dt><dd>{def.tools.map((t) => <span key={t.name}><code>{t.name}</code> ({t.permission}{t.idempotent ? ', idempotent' : ''}) </span>)}</dd>
        <dt>Approval</dt><dd>{def.approval.required ? 'Required. ' : 'Not required. '}{def.approval.description}</dd>
        <dt>Idempotency</dt><dd>{def.idempotency}</dd>
        <dt>Retry</dt><dd>{def.retry.description}</dd>
        <dt>Timeout</dt><dd>Approval window {Math.round(def.timeoutMs / 3_600_000)} h; after that the run times out with nothing executed.</dd>
        <dt>Compensation</dt><dd>{def.compensation}</dd>
      </dl>
      <form className="mb-range" onSubmit={(e) => { e.preventDefault(); void act({ action: 'start', workflowId: def.id, input: { threshold: Number(threshold) } }, 'Run planned. Review the list and approve its hash.'); }}>
        <label>Stock threshold<input aria-label="Stock threshold" type="number" min={0} step={1} required value={threshold} onChange={(e) => setThreshold(e.target.value)}/></label>
        <button className="mb-primary" disabled={busy}>Plan run</button>
      </form>
    </article>}
    {data && <section aria-label="Runs"><h2>Runs</h2>{!data.runs.filter((r) => r.workflowId === def?.id).length ? <p className="mb-empty">No runs yet.</p> : data.runs.filter((r) => r.workflowId === def?.id).map((r) => <article key={r.id} className="mb-panel mb-run" data-run={r.id} data-status={r.status}>
      <div className="mb-row"><strong>Run {r.id.slice(0, 8)}</strong><span className="mb-badge">{r.status.replace('_', ' ')}</span></div>
      <p className="mb-muted">Threshold {r.plan.threshold}; {r.plan.products.length} product(s) at or below it. Payload <code className="mb-hash">{r.payloadHash.slice(0, 16)}…</code>{r.approvedHash && ' approved'}</p>
      {r.plan.products.length > 0 && <ul>{r.plan.products.map((p) => <li key={p.id}>{p.name} ({p.sku}): {p.stock}</li>)}</ul>}
      {r.error && <p className="mb-alert">{r.error}</p>}
      <ol className="mb-steps">{r.steps.map((s) => <li key={s.stepId}>{s.stepId}: {s.status}{s.attempts ? `, ${s.attempts} attempt(s)` : ''}{s.error ? ` (${s.error})` : ''}</li>)}</ol>
      <div className="mb-actions">
        {r.status === 'awaiting_approval' && <button className="mb-primary" disabled={busy} onClick={() => void act({ action: 'approve', id: r.id, hash: r.payloadHash }, 'Approved this exact payload.')}>Approve payload</button>}
        {r.status === 'running' && <button className="mb-primary" disabled={busy} onClick={() => void act({ action: 'execute', id: r.id }, 'Run executed.')}>Execute</button>}
        {r.status === 'failed' && r.steps.some((s) => s.status === 'failed') && <button className="mb-button" disabled={busy} onClick={() => void act({ action: 'retry', id: r.id }, 'Retried.')}>Retry failed step</button>}
        {['awaiting_approval', 'running', 'failed'].includes(r.status) && <button className="mb-button" disabled={busy} onClick={() => void act({ action: 'cancel', id: r.id }, 'Run cancelled.')}>Cancel run</button>}
      </div>
      <details><summary>Run events ({r.events.length})</summary><ol className="mb-events">{r.events.map((e) => <li key={e.seq}><code>{e.type}</code>{e.stepId ? ` [${e.stepId}]` : ''}: {e.detail}</li>)}</ol></details>
    </article>)}</section>}
  </section>;
}
