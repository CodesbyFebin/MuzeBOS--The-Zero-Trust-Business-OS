'use client';
import { useEffect, useState } from 'react';
import { inr, toPaise, postTo, SignedInAs, type Me } from './bizClient';
type Member = { id: string; name: string; role: string; department: string };
type Expense = { id: string; submittedBy: string; department: string; amount: number; category: string; description: string; spentOn: string; status: string; hash: string; decidedBy: string | null; reason: string | null; blockedFor: string | null };
const post = postTo('/api/muzebos/expenses');
export function ExpensesBoard() {
  const [d, setD] = useState<{ me: Me; members: Member[]; expenses: Expense[]; managerLimit: number; categories: string[] } | null>(null); const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ amount: '', category: 'supplies', description: '', spentOn: new Date().toISOString().slice(0, 10) });
  const load = async () => { try { const r = await fetch('/api/muzebos/expenses'); const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); } catch (e) { setError((e as Error).message); } };
  useEffect(() => { void load(); }, []); const actor = d?.me?.id ?? null;
  const run = (fn: () => Promise<unknown>) => async () => { setError(null); try { await fn(); await load(); } catch (e) { setError((e as Error).message); } };
  const name = (id: string | null) => d?.members.find((x) => x.id === id)?.name ?? id ?? '';
  return <div className="mb-console mb-category">
    <span className="mb-eyebrow">MONEY / EXPENSES</span><h1>Expense approvals</h1>
    <p className="mb-muted">Nobody can approve their own claim. Managers decide only their own department, up to {d ? inr(d.managerLimit) : '…'}; above that an owner decides. Each decision is bound to the exact claim. Every rule is checked on the server against the signed-in member.</p>
    {error && <p className="mb-alert" role="alert">{error}</p>}
    {d && <>
      <SignedInAs me={d.me} />
      {d.members.length < 2 && <p className="mb-muted">With one member, nobody can approve your claims. <a href="/workspace/account/people">Invite a second approver</a>.</p>}
      <section className="mb-panel" aria-label="Submit expense"><h2>Submit a claim</h2>
        <input aria-label="Amount in rupees" type="number" placeholder="₹" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        <select aria-label="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{d.categories.map((c) => <option key={c}>{c}</option>)}</select>
        <input aria-label="Description" placeholder="Packaging boxes" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <input aria-label="Spent on" type="date" value={f.spentOn} onChange={(e) => setF({ ...f, spentOn: e.target.value })} />
        <button onClick={run(() => post({ action: 'submit', expense: { ...f, amount: toPaise(f.amount) } }))}>Submit</button></section>
      <section className="mb-panel" aria-label="Claims"><h2>Claims</h2>{!d.expenses.length ? <p className="mb-empty">No claims yet.</p> : <ul>{d.expenses.map((e) => <li key={e.id}>
        <strong>{inr(e.amount)}</strong> {e.category}: {e.description} <span className="mb-muted">by {name(e.submittedBy)} · {e.department} · {e.spentOn} · {e.status}{e.decidedBy ? ` by ${name(e.decidedBy)}` : ''}{e.reason ? ` (${e.reason})` : ''}</span>
        {e.status === 'submitted' && actor && (e.blockedFor ? <span className="mb-muted"> · {e.blockedFor}</span> : <> <button onClick={run(() => post({ action: 'decide', expenseId: e.id, decision: 'approve', hash: e.hash }))}>Approve</button> <button onClick={run(() => post({ action: 'decide', expenseId: e.id, decision: 'reject', hash: e.hash, reason: prompt('Reason for rejecting?') ?? '' }))}>Reject</button></>)}
        {e.status === 'submitted' && e.submittedBy === actor && <button onClick={run(() => post({ action: 'withdraw', expenseId: e.id }))}>Withdraw</button>}
      </li>)}</ul>}</section></>}
  </div>;
}
