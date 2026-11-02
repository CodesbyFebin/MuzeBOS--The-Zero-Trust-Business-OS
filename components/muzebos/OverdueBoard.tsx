'use client';
import { useEffect, useState } from 'react';
import { inr, postTo, SignedInAs, useMe } from './bizClient';
type Citation = { record: string; field: string; value: string };
type Finding = { invoiceId: string; number: string; customerName: string; customerEmail: string; total: number; createdAt: string; dueAt: string; termsDays: number; termsSource: string; daysOverdue: number; citations: Citation[]; uncertainty: string[] };
type Draft = { mode: 'live' | 'fixture'; model: string | null; label: string; draft: { subject: string; body: string }; fallbackReason?: string; finding: Finding };
type Run = { id: string; status: string; payloadHash: string; error: string | null; input: { invoiceId: string; subject: string; mode: string }; steps: { stepId: string; output: unknown; error: string | null }[] };
type View = { findings: Finding[]; terms: { days: number; source: string }; liveGate: { available: boolean; reason: string }; senderConnected: boolean; runs: Run[]; outbound: { id: string; recipient: string; subject: string; status: string; detail: string | null }[] };
const post = postTo('/api/muzebos/overdue');
export function OverdueBoard() {
  const me = useMe(); const [v, setV] = useState<View | null>(null); const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null); const [edit, setEdit] = useState({ subject: '', body: '' });
  const load = async () => { try { const r = await fetch('/api/muzebos/overdue'); const j = await r.json(); if (!r.ok) throw new Error(j.error); setV(j); } catch (e) { setError((e as Error).message); } };
  useEffect(() => { void load(); }, []);
  const run = (fn: () => Promise<unknown>) => async () => { setError(null); try { await fn(); await load(); } catch (e) { setError((e as Error).message); } };
  return <div className="mb-console mb-category">
    <span className="mb-eyebrow">MONEY / OVERDUE</span><h1>Overdue invoice reminders</h1>
    <p className="mb-muted">Found from your stored invoices only. A reminder is drafted, a person approves the exact text, and it is sent only through a connected email integration.</p>
    {error && <p className="mb-alert" role="alert">{error}</p>}
    <SignedInAs me={me} />
    {v && <>
      <section className="mb-panel" aria-label="Status"><h2>Status</h2><ul>
        <li data-testid="live-gate">Muse draft: {v.liveGate.available ? 'live allowed within caps' : v.liveGate.reason}{!v.liveGate.available && <strong> · drafts are FIXTURE templates</strong>}</li>
        <li>Sending: {v.senderConnected ? 'email integration connected' : 'no sending integration connected; approved reminders are recorded as not sent'}</li>
        <li>Payment terms: {v.terms.days} days ({v.terms.source === 'configured' ? 'configured' : 'assumed default, not configured'})</li>
      </ul></section>
      <section className="mb-panel" aria-label="Overdue"><h2>Overdue ({v.findings.length})</h2>{!v.findings.length ? <p className="mb-empty">No pending, unreferenced invoice is past its derived due date.</p> : v.findings.map((f) => <article className="mb-order" key={f.invoiceId}>
        <div className="mb-row"><div><strong>{f.number} · {f.customerName}</strong><small>Issued {f.createdAt.slice(0, 10)} · due {f.dueAt.slice(0, 10)} (derived) · {f.daysOverdue} days overdue</small></div><strong>{inr(f.total)}</strong></div>
        <details><summary>Sources and uncertainty</summary><ul>{f.citations.map((c) => <li key={c.field}><code>{c.record}.{c.field}</code> = {c.value}</li>)}</ul><ul>{f.uncertainty.map((u) => <li key={u} className="mb-muted">{u}</li>)}</ul></details>
        <button onClick={run(async () => { const r = await post({ action: 'draft', invoiceId: f.invoiceId }) as { draft: Draft }; setDraft(r.draft); setEdit(r.draft.draft); })}>Draft reminder</button>
      </article>)}</section>
      {draft && <section className="mb-panel" aria-label="Draft"><h2>Draft for {draft.finding.number}</h2>
        <p data-testid="draft-label"><strong>{draft.label}</strong>{draft.fallbackReason ? <span className="mb-muted"> · {draft.fallbackReason}</span> : null}</p>
        <label>Subject<input value={edit.subject} maxLength={120} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} /></label>
        <label>Body<textarea value={edit.body} maxLength={1200} rows={8} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></label>
        <p className="mb-muted">Edits are re-checked: the invoice number and stored amount must stay; no links, payment claims or legal threats.</p>
        <button onClick={run(async () => { await post({ action: 'propose', invoiceId: draft.finding.invoiceId, ...edit, mode: draft.mode, model: draft.model }); setDraft(null); })}>Send to Jev for approval</button>
      </section>}
      <section className="mb-panel" aria-label="Approvals"><h2>Jev approvals</h2>{!v.runs.length ? <p className="mb-empty">No reminder runs yet.</p> : <ul>{v.runs.map((r) => <li key={r.id}>
        <strong>{r.input.subject}</strong> <span className="mb-muted">· {r.input.mode.toUpperCase()} · {r.status}{r.error ? ` · ${r.error}` : ''}{r.steps[0]?.output ? ` · ${JSON.stringify(r.steps[0].output)}` : ''}</span>
        {r.status === 'awaiting_approval' && <> <button onClick={run(() => post({ action: 'approve', runId: r.id, hash: r.payloadHash }))}>Approve and send</button> <button onClick={run(() => post({ action: 'reject', runId: r.id }))}>Reject</button></>}
      </li>)}</ul>}</section>
      <section className="mb-panel" aria-label="Outbound"><h2>Outbound</h2>{!v.outbound.length ? <p className="mb-empty">Nothing has been handed to a sender.</p> : <ul>{v.outbound.map((m) => <li key={m.id}>{m.recipient} · {m.subject} · {m.status}{m.detail ? ` · ${m.detail}` : ''}</li>)}</ul>}<p className="mb-muted">Every step is in <a href="/workspace/evidence">Evidence (Activity)</a>.</p></section>
    </>}
  </div>;
}
