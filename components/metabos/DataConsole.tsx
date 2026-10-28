'use client';
import { useCallback, useEffect, useState } from 'react';
import { postTo, useMe, SignedInAs } from '@/components/metabos/bizClient';

type Answer = { intent: string | null; label: string; sql: string; columns: string[]; rows: Record<string, unknown>[]; note: string };
type Goal = { period: string; targetMinor: number | null; invoicedMinor: number; collectedMinor: number; invoices: number; pctOfTarget: number | null };
type View = { intents: { id: string; label: string }[]; goals: Goal[] | null; privacy: { id: string; kind: string; customerId: string; summary: string; by: string; at: string }[] | null; customers: { id: string; name: string; email: string }[] | null };
export type DataPanel = 'ask' | 'goals' | 'privacy';
const post = postTo('/api/data');
const inr = (p: number) => `INR ${(p / 100).toFixed(2)}`;

/** Read-only data questions, sales goals and DPDP requests. Nothing here sends or posts anything. */
export function DataConsole({ panel }: { panel: DataPanel }) {
  const me = useMe();
  const [v, setV] = useState<View | null>(null); const [err, setErr] = useState(''); const [note, setNote] = useState('');
  const [f, setF] = useState<Record<string, string>>({ period: new Date().toISOString().slice(0, 7) });
  const [ans, setAns] = useState<Answer | null>(null);
  const set = (k: string) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const load = useCallback(async () => { const r = await fetch('/api/data', { cache: 'no-store' }); const j = await r.json(); if (!r.ok) { setErr(j.error ?? 'Could not load'); return; } setV(j); }, []);
  useEffect(() => { void load(); }, [load]);
  const act = async (body: object, ok: (j: any) => string) => { try { const j = await post(body); setNote(ok(j)); setErr(''); await load(); return j; } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } };
  if (err && !v) return <section className="mb-panel"><SignedInAs me={me} /><p className="mb-alert" role="alert">{err}</p></section>;
  if (!v) return <section className="mb-panel"><p className="mb-muted">Loading…</p></section>;
  return <section className="mb-panel mb-talk" aria-label="Data and privacy" data-testid={`data-${panel}`}>
    {err && <p className="mb-alert" role="alert">{err}</p>}{note && <p className="mb-muted" role="status">{note}</p>}
    {panel === 'ask' && <>
      <h2>Ask your data</h2>
      <p className="mb-muted">Read-only. Questions map to fixed queries over your records, and the SQL that ran is shown with the answer. Try: {v.intents.map((i) => i.label.toLowerCase()).join('; ')}.</p>
      <form className="mb-actions" onSubmit={(e) => { e.preventDefault(); void act({ action: 'ask', question: f.q }, (j) => { setAns(j.answer); return ''; }); }}>
        <label className="mb-field">Question<input value={f.q ?? ''} onChange={set('q')} required /></label>
        <button className="mb-primary" type="submit">Ask</button>
      </form>
      <form className="mb-actions" onSubmit={(e) => { e.preventDefault(); void act({ action: 'select', sql: f.sql }, (j) => { setAns(j.answer); return ''; }); }}>
        <label className="mb-field">Read-only SELECT (owner)<textarea value={f.sql ?? ''} onChange={set('sql')} required /></label>
        <button className="mb-primary" type="submit">Run SELECT</button>
      </form>
      {ans && <div data-testid="data-answer"><p><strong>{ans.label}</strong>. {ans.note}</p>{ans.sql && <pre aria-label="SQL used"><code>{ans.sql}</code></pre>}
        {ans.rows.length > 0 && <table className="mb-table"><thead><tr>{ans.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{ans.rows.map((r, i) => <tr key={i}>{ans.columns.map((c) => <td key={c}>{r[c] === null ? '' : String(r[c])}</td>)}</tr>)}</tbody></table>}</div>}
    </>}
    {panel === 'goals' && <>
      <h2>Sales goals vs actuals</h2>
      {v.goals ? <table className="mb-table"><thead><tr><th>Month</th><th>Target</th><th>Invoiced</th><th>Collected</th><th>Invoices</th><th>Of target</th></tr></thead><tbody>
        {v.goals.map((g) => <tr key={g.period}><td>{g.period}</td><td>{g.targetMinor === null ? 'No goal set' : inr(g.targetMinor)}</td><td>{inr(g.invoicedMinor)}</td><td>{inr(g.collectedMinor)}</td><td>{g.invoices}</td><td>{g.pctOfTarget === null ? '—' : `${g.pctOfTarget}%`}</td></tr>)}
      </tbody></table> : <p className="mb-muted">Finance access needed to view goals.</p>}
      <form className="mb-actions" onSubmit={(e) => { e.preventDefault(); void act({ action: 'goal', period: f.period, targetMinor: Math.round(Number(f.target) * 100) }, () => 'Goal saved'); }}>
        <label className="mb-field">Month (YYYY-MM)<input value={f.period} onChange={set('period')} pattern="\d{4}-\d{2}" required /></label>
        <label className="mb-field">Target (INR)<input inputMode="decimal" value={f.target ?? ''} onChange={set('target')} required /></label>
        <button className="mb-primary" type="submit">Set goal (owner)</button>
      </form>
    </>}
    {panel === 'privacy' && <>
      <h2>DPDP data requests</h2>
      <p className="mb-muted">Export everything held about a customer, or redact their personal details. Redaction keeps invoice numbers and amounts for tax records and keeps opt-outs so they are never messaged again. Owner only.</p>
      <p className="mb-muted" data-testid="dpdp-meta-training">AI drafts: prompts and replies sent to Meta contributor models may be used by Meta to train its models. See the <a href="/privacy">privacy policy</a>; the owner can switch to standard models in <a href="/workspace/system/ai-settings">AI settings</a>.</p>
      {v.customers ? <>
        <form className="mb-actions" onSubmit={async (e) => { e.preventDefault(); const j = await act({ action: 'export', customerId: f.cid, addresses: f.addr ? [f.addr] : [] }, () => 'Export ready'); if (j) { const url = URL.createObjectURL(new Blob([JSON.stringify(j.bundle, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `dpdp-export-${f.cid.slice(0, 8)}.json`; a.click(); URL.revokeObjectURL(url); } }}>
          <label className="mb-field">Customer<select value={f.cid ?? ''} onChange={set('cid')} required><option value="">Choose…</option>{v.customers.map((c) => <option key={c.id} value={c.id}>{c.name} {c.email}</option>)}</select></label>
          <label className="mb-field">Phone or handle (optional)<input value={f.addr ?? ''} onChange={set('addr')} /></label>
          <button className="mb-primary" type="submit">Export JSON</button>
        </form>
        <form className="mb-actions" onSubmit={(e) => { e.preventDefault(); void act({ action: 'redact', customerId: f.cid, confirm: f.confirm, addresses: f.addr ? [f.addr] : [] }, (j) => `Redacted: ${j.summary}`); }}>
          <label className="mb-field">Type the customer name to confirm<input value={f.confirm ?? ''} onChange={set('confirm')} required /></label>
          <button className="mb-danger" type="submit" disabled={!f.cid}>Redact customer</button>
        </form>
        {v.privacy?.length ? <table className="mb-table"><thead><tr><th>When</th><th>Kind</th><th>Summary</th></tr></thead><tbody>{v.privacy.map((p) => <tr key={p.id}><td>{new Date(p.at).toLocaleString()}</td><td>{p.kind}</td><td>{p.summary}</td></tr>)}</tbody></table> : <p className="mb-muted">No records yet</p>}
      </> : <p className="mb-muted">Only the owner can handle data requests.</p>}
    </>}
  </section>;
}
