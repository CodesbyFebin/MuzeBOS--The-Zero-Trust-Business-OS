'use client';
import { useEffect, useState } from 'react';
import { inr, toPaise, postTo } from './bizClient';
type Member = { id: string; name: string; role: string; department: string };
type Expense = { id: string; submittedBy: string; department: string; amount: number; category: string; description: string; spentOn: string; status: string; hash: string; decidedBy: string | null; reason: string | null; blockedFor: string | null };
const post = postTo('/api/muzebos/expenses');
const DEPTS = ['inventory', 'customers', 'finance', 'operations', 'writer'];
export function ExpensesBoard() {
  const [actor, setActor] = useState('owner'); const [d, setD] = useState<{ members: Member[]; expenses: Expense[]; managerLimit: number; categories: string[] } | null>(null); const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ amount: '', category: 'supplies', description: '', spentOn: new Date().toISOString().slice(0, 10) }); const [m, setM] = useState({ name: '', role: 'manager', department: 'finance' });
  const load = async () => { try { const r = await fetch(`/api/muzebos/expenses?actorId=${encodeURIComponent(actor)}`); const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); } catch (e) { setError((e as Error).message); } };
  useEffect(() => { void load(); }, [actor]);
  const run = (fn: () => Promise<unknown>) => async () => { setError(null); try { await fn(); await load(); } catch (e) { setError((e as Error).message); } };
  const name = (id: string | null) => d?.members.find((x) => x.id === id)?.name ?? id ?? '';
  return <div className="mb-console mb-category">
    <span className="mb-eyebrow">MONEY / EXPENSES</span><h1>Expense approvals</h1>
    <p className="mb-muted">Nobody can approve their own claim. Managers decide only their own department, up to {d ? inr(d.managerLimit) : '…'}; above that an owner decides. Each decision is bound to the exact claim. This preview has no login, so choose who is acting; the server enforces every rule against that member.</p>
    {error && <p className="mb-alert" role="alert">{error}</p>}
    {d && <>
      <section className="mb-panel" aria-label="Acting as"><h2>Acting as</h2><select aria-label="Acting member" value={actor} onChange={(e) => setActor(e.target.value)}>{d.members.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.role}, {x.department})</option>)}</select>
        {d.members.length < 2 && <p className="mb-muted">With one member, nobody can approve your claims. Add a second approver below.</p>}
        <details><summary>Add member (owner only)</summary>
          <input aria-label="Member name" value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} />
          <select aria-label="Member role" value={m.role} onChange={(e) => setM({ ...m, role: e.target.value })}>{['owner', 'manager', 'member'].map((r) => <option key={r}>{r}</option>)}</select>
          <select aria-label="Member department" value={m.department} onChange={(e) => setM({ ...m, department: e.target.value })}>{DEPTS.map((r) => <option key={r}>{r}</option>)}</select>
          <button onClick={run(() => post({ action: 'addMember', actorId: actor, member: m }))}>Add</button></details></section>
      <section className="mb-panel" aria-label="Submit expense"><h2>Submit a claim</h2>
        <input aria-label="Amount in rupees" type="number" placeholder="₹" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        <select aria-label="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{d.categories.map((c) => <option key={c}>{c}</option>)}</select>
        <input aria-label="Description" placeholder="Packaging boxes" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <input aria-label="Spent on" type="date" value={f.spentOn} onChange={(e) => setF({ ...f, spentOn: e.target.value })} />
        <button onClick={run(() => post({ action: 'submit', actorId: actor, expense: { ...f, amount: toPaise(f.amount) } }))}>Submit</button></section>
      <section className="mb-panel" aria-label="Claims"><h2>Claims</h2>{!d.expenses.length ? <p className="mb-empty">No claims yet.</p> : <ul>{d.expenses.map((e) => <li key={e.id}>
        <strong>{inr(e.amount)}</strong> {e.category}: {e.description} <span className="mb-muted">by {name(e.submittedBy)} · {e.department} · {e.spentOn} · {e.status}{e.decidedBy ? ` by ${name(e.decidedBy)}` : ''}{e.reason ? ` (${e.reason})` : ''}</span>
        {e.status === 'submitted' && (e.blockedFor ? <span className="mb-muted"> · {e.blockedFor}</span> : <> <button onClick={run(() => post({ action: 'decide', actorId: actor, expenseId: e.id, decision: 'approve', hash: e.hash }))}>Approve</button> <button onClick={run(() => post({ action: 'decide', actorId: actor, expenseId: e.id, decision: 'reject', hash: e.hash, reason: prompt('Reason for rejecting?') ?? '' }))}>Reject</button></>)}
        {e.status === 'submitted' && e.submittedBy === actor && <button onClick={run(() => post({ action: 'withdraw', actorId: actor, expenseId: e.id }))}>Withdraw</button>}
      </li>)}</ul>}</section></>}
  </div>;
}
