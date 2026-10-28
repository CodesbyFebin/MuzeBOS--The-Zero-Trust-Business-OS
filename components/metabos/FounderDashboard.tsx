'use client';
import { useEffect, useState } from 'react';
import { inr, toPaise, postTo, InferenceNote } from './bizClient';
type Dash = { months: { month: string; invoiced: number; collected: number; expenses: number }[]; cash: { amount: number; asOf: string } | null; avgCollected: number; avgExpenses: number; netBurn: number; runwayMonths: number | null; runwayNote: string; recurringRevenue: number; recurringCustomers: number; recurringNote: string; receivables: number; pendingExpenses: number; pipeline: { open: number; openAmount: number; weightedAmount: number; winRate: number | null } };
const post = postTo('/api/metabos/founder');
export function FounderDashboard() {
  const [d, setD] = useState<Dash | null>(null); const [error, setError] = useState<string | null>(null); const [c, setC] = useState({ amount: '', asOf: new Date().toISOString().slice(0, 10) });
  const [task, setTask] = useState<string | null>(null); const [brief, setBrief] = useState<{ summary: string; risks: string[]; source: string } | null>(null);
  const load = async () => { try { const r = await fetch('/api/metabos/founder'); const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j.dashboard); } catch (e) { setError((e as Error).message); } };
  useEffect(() => { void load(); }, []);
  const run = (fn: () => Promise<unknown>) => async () => { setError(null); try { await fn(); await load(); } catch (e) { setError((e as Error).message); } };
  return <div className="mb-console mb-category">
    <span className="mb-eyebrow">MONEY / FOUNDER DASHBOARD</span><h1>Founder dashboard</h1>
    <p className="mb-muted">Computed only from this workspace: issued invoices, manually reconciled payments, approved expenses, open deals and the cash balance you enter. Averages use the last three complete months.</p>
    {error && <p className="mb-alert" role="alert">{error}</p>}
    {d && <>
      <section className="mb-panel" aria-label="Runway"><h2>Runway</h2><p><strong>{d.runwayMonths === null ? '—' : `${d.runwayMonths} months`}</strong> · {d.runwayNote}</p>
        <p>Cash {d.cash ? `${inr(d.cash.amount)} as of ${d.cash.asOf}` : 'not set'} · collected {inr(d.avgCollected)}/mo · approved expenses {inr(d.avgExpenses)}/mo · net burn {inr(d.netBurn)}/mo</p>
        <input aria-label="Cash in rupees" type="number" placeholder="₹ cash today" value={c.amount} onChange={(e) => setC({ ...c, amount: e.target.value })} />
        <input aria-label="Cash as of" type="date" value={c.asOf} onChange={(e) => setC({ ...c, asOf: e.target.value })} />
        <button onClick={run(() => post({ action: 'setCash', amount: toPaise(c.amount), asOf: c.asOf }))}>Set cash (owner)</button></section>
      <section className="mb-panel" aria-label="Recurring revenue"><h2>Recurring revenue (MRR proxy)</h2><p><strong>{inr(d.recurringRevenue)}/mo</strong> from {d.recurringCustomers} repeat customers</p><p className="mb-muted">{d.recurringNote}</p></section>
      <section className="mb-panel" aria-label="Receivables and pipeline"><h2>Receivables and pipeline</h2><p>Unpaid invoices {inr(d.receivables)} · claims waiting {inr(d.pendingExpenses)} · {d.pipeline.open} open deals, {inr(d.pipeline.weightedAmount)} weighted of {inr(d.pipeline.openAmount)}</p>
        <a href="/workspace/money/pipeline">Pipeline</a> · <a href="/workspace/money/expenses">Expenses</a></section>
      <section className="mb-panel" aria-label="Months"><h2>Last six months</h2><table><thead><tr><th>Month</th><th>Invoiced</th><th>Collected</th><th>Expenses</th></tr></thead><tbody>{d.months.map((m) => <tr key={m.month}><td>{m.month}</td><td>{inr(m.invoiced)}</td><td>{inr(m.collected)}</td><td>{inr(m.expenses)}</td></tr>)}</tbody></table></section>
      <section className="mb-panel" aria-label="Muse Wonder brief"><h2>Muse Wonder brief</h2><InferenceNote />
        <button onClick={run(async () => { const j = await post({ action: 'requestBrief' }); setTask(j.task.id); })}>Request brief</button>
        {task && <button onClick={run(async () => setBrief((await post({ action: 'readBrief', taskId: task })).brief))}>Load brief</button>}
        {brief && <><p>{brief.summary}</p><ul>{brief.risks.map((r) => <li key={r}>{r}</li>)}</ul><p className="mb-muted">Draft from {brief.source}; advice only.</p></>}</section></>}
  </div>;
}
