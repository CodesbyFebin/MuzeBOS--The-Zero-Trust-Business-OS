'use client';
import { useCallback, useEffect, useState } from 'react';
import { postTo, useMe, SignedInAs } from '@/components/metabos/bizClient';

type Agent = { code: string; name: string; monthlyCapMicroUsd: number; month: { cost: number; calls: number; unpriced: number } };
type Run = { id: string; flowId: string; status: string; trace: string[]; dispatches: string[]; error: string | null; at: string };
type Cp = { customerId: string; name: string; invoices: number; paid: number; pending: number; pendingTotal: number; oldestPendingDays: number | null; disputes: number; band: string; reasons: string[]; events: { id: string; kind: string; note: string; predictedBand: string; outcome: string | null; at: string }[] };
type View = { agents: Agent[]; flows: { id: string; name: string; spec: unknown }[]; runs: Run[]; counterparties: Cp[] | null; openrouter: boolean };
export type BrainPanel = 'agents' | 'tools' | 'flows' | 'risk';
const post = postTo('/api/brain-ops');
const usd = (micro: number) => `USD ${(micro / 1_000_000).toFixed(4)}`;
const inr = (paise: number) => `INR ${(paise / 100).toFixed(2)}`;
const SAMPLE = JSON.stringify({ sequence: [{ set: { var: 'pending', value: { query: 'pending_invoice_count' } } }, { oneOf: { when: [{ if: { left: { var: 'pending' }, op: '>', right: 0 }, then: { propose: { channel: 'email', payload: { to: 'owner@example.com', subject: 'Pending invoices', text: '{{pending}} invoices are pending' } } } }] } }] }, null, 2);

/** Brain/Ops console. Agents and flows only propose; every send waits in Jev and goes out through /api/dispatch. */
export function BrainConsole({ panel }: { panel: BrainPanel }) {
  const me = useMe();
  const [v, setV] = useState<View | null>(null); const [err, setErr] = useState(''); const [note, setNote] = useState('');
  const [f, setF] = useState<Record<string, string>>({ spec: SAMPLE, tier: 'auto', kind: 'late_payment' });
  const set = (k: string) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const load = useCallback(async () => { const r = await fetch('/api/brain-ops', { cache: 'no-store' }); const j = await r.json(); if (!r.ok) { setErr(j.error ?? 'Could not load'); return; } setErr(''); setV(j); }, []);
  useEffect(() => { void load(); }, [load]);
  const act = async (body: object, ok: (j: any) => string) => { try { const j = await post(body); setNote(ok(j)); setErr(''); await load(); } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } };
  if (err && !v) return <section className="mb-panel"><SignedInAs me={me} /><p className="mb-alert" role="alert">{err}</p></section>;
  if (!v) return <section className="mb-panel"><p className="mb-muted">Loading…</p></section>;
  return <section className="mb-panel mb-talk" aria-label="Brain and ops copilot" data-testid={`brain-${panel}`}>
    <SignedInAs me={me} />
    {err && <p className="mb-alert" role="alert">{err}</p>}{note && <p className="mb-muted" role="status">{note}</p>}
    {panel === 'agents' && <>
      <h2>Agents and monthly spend caps</h2>
      <p className="mb-muted">OpenRouter: {v.openrouter ? 'connected' : 'Not connected'}. Spend comes from the usage OpenRouter reports on each sent completion. Calls without a reported cost count as unpriced.</p>
      {v.agents.length ? <table className="mb-table"><thead><tr><th>Agent</th><th>Cap / month</th><th>Spent this month</th><th>Calls</th><th>Unpriced</th></tr></thead><tbody>
        {v.agents.map((a) => <tr key={a.code}><td>{a.name} <code>{a.code}</code></td><td>{usd(a.monthlyCapMicroUsd)}</td><td>{a.month.calls ? usd(a.month.cost) : 'Usage unavailable'}</td><td>{a.month.calls}</td><td>{a.month.unpriced}</td></tr>)}
      </tbody></table> : <p className="mb-muted">No records yet</p>}
      <form className="mb-actions" onSubmit={(e) => { e.preventDefault(); void act({ action: 'agent', code: f.code, name: f.name, monthlyCapMicroUsd: Math.round(Number(f.cap) * 1_000_000) }, () => 'Agent cap saved'); }}>
        <label className="mb-field">Code<input value={f.code ?? ''} onChange={set('code')} required /></label>
        <label className="mb-field">Name<input value={f.name ?? ''} onChange={set('name')} required /></label>
        <label className="mb-field">Cap (USD / month)<input inputMode="decimal" value={f.cap ?? ''} onChange={set('cap')} required /></label>
        <button className="mb-primary" type="submit">Save cap (owner)</button>
      </form>
      <form className="mb-actions" onSubmit={(e) => { e.preventDefault(); void act({ action: 'agent-completion', code: f.agent, prompt: f.prompt, tier: f.tier }, (j) => `Routed to ${j.route.model ?? 'no model'} (${j.route.tier}). Dispatch ${j.dispatch.id.slice(0, 8)} waits for Jev.`); }}>
        <label className="mb-field">Agent<select value={f.agent ?? ''} onChange={set('agent')} required><option value="">Choose…</option>{v.agents.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}</select></label>
        <label className="mb-field">Tier<select value={f.tier} onChange={set('tier')}>{['auto', 'small', 'medium', 'large'].map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="mb-field">Prompt<textarea value={f.prompt ?? ''} onChange={set('prompt')} required /></label>
        <button className="mb-primary" type="submit">Propose completion</button>
      </form>
    </>}
    {panel === 'tools' && <>
      <h2>Tool gate check</h2>
      <p className="mb-muted">High-risk tools, and tools with no risk tier, always need Jev approval. Set the tier in the tool registry above.</p>
      <form className="mb-actions" onSubmit={(e) => { e.preventDefault(); void act({ action: 'tool-gate', code: f.tool }, (j) => `${j.gate.code}: ${j.gate.risk} risk, ${j.gate.needsJev ? 'needs Jev' : 'allowed without Jev'} (${j.gate.why})`); }}>
        <label className="mb-field">Tool code<input value={f.tool ?? ''} onChange={set('tool')} required /></label>
        <button className="mb-primary" type="submit">Check gate</button>
      </form>
    </>}
    {panel === 'flows' && <>
      <h2>Flows</h2>
      <p className="mb-muted">Steps: set, propose, tool, sequence, parallel, oneOf, forEach and evaluate (at most 10 loops). A run can only create pending dispatches. Nothing sends until Jev approves.</p>
      <form className="mb-actions" onSubmit={(e) => { e.preventDefault(); let spec: unknown; try { spec = JSON.parse(f.spec); } catch { setErr('Flow JSON is not valid'); return; } void act({ action: 'flow-save', name: f.flow, spec }, () => 'Flow saved'); }}>
        <label className="mb-field">Name<input value={f.flow ?? ''} onChange={set('flow')} required /></label>
        <label className="mb-field">Flow JSON<textarea rows={10} value={f.spec} onChange={set('spec')} spellCheck={false} /></label>
        <button className="mb-primary" type="submit">Save flow (manager)</button>
      </form>
      {v.flows.length ? <ul className="mb-help-list">{v.flows.map((fl) => <li key={fl.id}>{fl.name} <button className="mb-link" type="button" onClick={() => void act({ action: 'flow-run', flowId: fl.id }, (j) => `Run ${j.run.status}: ${j.run.dispatches.length} proposals`)}>Run</button></li>)}</ul> : <p className="mb-muted">No records yet</p>}
      {v.runs.map((r) => <details key={r.id}><summary>{new Date(r.at).toLocaleString()}: {r.status}{r.error ? ` (${r.error})` : ''}, {r.dispatches.length} proposals</summary><pre>{r.trace.join('\n')}</pre></details>)}
    </>}
    {panel === 'risk' && <>
      <h2>Counterparty risk</h2>
      {v.counterparties === null ? <p className="mb-muted">Needs finance access.</p> : v.counterparties.length === 0 ? <p className="mb-muted">No records yet</p> :
        <table className="mb-table"><thead><tr><th>Customer</th><th>Band</th><th>Invoices (paid / pending)</th><th>Pending</th><th>Disputes</th><th>Why</th></tr></thead><tbody>
          {v.counterparties.map((c) => <tr key={c.customerId}><td>{c.name}</td><td>{c.band}</td><td>{c.invoices} ({c.paid} / {c.pending})</td><td>{c.pending ? inr(c.pendingTotal) : '—'}</td><td>{c.disputes}</td><td>{c.reasons.join('; ')}</td></tr>)}
        </tbody></table>}
      {v.counterparties?.length ? <form className="mb-actions" onSubmit={(e) => { e.preventDefault(); void act({ action: 'counterparty-event', customerId: f.cp, kind: f.kind, note: f.note }, () => 'Recorded with the current band, to grade later'); }}>
        <label className="mb-field">Customer<select value={f.cp ?? ''} onChange={set('cp')} required><option value="">Choose…</option>{v.counterparties.map((c) => <option key={c.customerId} value={c.customerId}>{c.name}</option>)}</select></label>
        <label className="mb-field">What happened<select value={f.kind} onChange={set('kind')}>{['late_payment', 'paid_on_time', 'dispute', 'other'].map((k) => <option key={k}>{k}</option>)}</select></label>
        <label className="mb-field">Note<input value={f.note ?? ''} onChange={set('note')} required /></label>
        <button className="mb-primary" type="submit">Record</button>
      </form> : null}
      {v.counterparties?.flatMap((c) => c.events.filter((e) => !e.outcome).map((e) => <p key={e.id} className="mb-muted">{c.name}: {e.kind} ({e.note}), band was {e.predictedBand}. <button className="mb-link" type="button" onClick={() => void act({ action: 'counterparty-grade', eventId: e.id, outcome: 'band_held' }, () => 'Graded')}>Band held</button> <button className="mb-link" type="button" onClick={() => void act({ action: 'counterparty-grade', eventId: e.id, outcome: 'band_wrong' }, () => 'Graded')}>Band was wrong</button></p>))}
    </>}
  </section>;
}
