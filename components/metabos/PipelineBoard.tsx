'use client';
import { useEffect, useState } from 'react';
import { inr, toPaise, postTo, InferenceNote } from './bizClient';
type Deal = { id: string; title: string; amount: number; stage: string; probability: number | null; winProbability: number; weighted: number; expectedClose: string | null; events: { toStage: string; note: string }[] };
type Data = { stages: string[]; defaults: Record<string, number>; summary: { open: number; openAmount: number; weightedAmount: number; winRate: number | null }; deals: Deal[]; customers: { id: string; name: string }[] };
const post = postTo('/api/metabos/pipeline');
export function PipelineBoard() {
  const [d, setD] = useState<Data | null>(null); const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ title: '', amount: '', customerId: '', expectedClose: '' }); const [tasks, setTasks] = useState<Record<string, string>>({}); const [advice, setAdvice] = useState<Record<string, { nextStep: string; probability: number; source: string }>>({});
  const load = async () => { try { const r = await fetch('/api/metabos/pipeline'); const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); } catch (e) { setError((e as Error).message); } };
  useEffect(() => { void load(); }, []);
  const run = (fn: () => Promise<unknown>) => async () => { setError(null); try { await fn(); await load(); } catch (e) { setError((e as Error).message); } };
  return <div className="mb-console mb-category">
    <span className="mb-eyebrow">MONEY / PIPELINE</span><h1>Sales pipeline</h1>
    <p className="mb-muted">Each stage has a default win probability; an open deal can override it. Weighted value = amount × probability. Won and lost are final.</p>
    {error && <p className="mb-alert" role="alert">{error}</p>}
    {d && <>
      <section className="mb-panel" aria-label="Forecast"><h2>Forecast</h2><p>{d.summary.open} open · {inr(d.summary.openAmount)} total · <strong>{inr(d.summary.weightedAmount)} weighted</strong> · win rate {d.summary.winRate === null ? 'n/a' : `${d.summary.winRate}%`}</p></section>
      <section className="mb-panel" aria-label="New deal"><h2>New deal</h2>
        <input aria-label="Deal title" placeholder="Wholesale order for Cafe Rio" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <input aria-label="Amount in rupees" type="number" placeholder="₹" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        <select aria-label="Customer" value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value })}><option value="">No customer yet</option>{d.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <input aria-label="Expected close" type="date" value={f.expectedClose} onChange={(e) => setF({ ...f, expectedClose: e.target.value })} />
        <button onClick={run(async () => { await post({ action: 'create', deal: { title: f.title, amount: toPaise(f.amount), customerId: f.customerId || null, expectedClose: f.expectedClose || null } }); setF({ title: '', amount: '', customerId: '', expectedClose: '' }); })}>Add deal</button></section>
      <InferenceNote />
      <div className="mb-kanban" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        {d.stages.map((st) => <section key={st} className="mb-panel" aria-label={`Stage ${st}`}><h2>{st} <span className="mb-muted">({d.defaults[st]}%)</span></h2>
          {d.deals.filter((x) => x.stage === st).map((x) => <article key={x.id} className="mb-card"><strong>{x.title}</strong><p>{inr(x.amount)} · {x.winProbability}% → {inr(x.weighted)}</p>
            {!['won', 'lost'].includes(x.stage) && <>
              <select aria-label={`Move ${x.title}`} value="" onChange={(e) => { const v = e.target.value; const note = v === 'lost' ? prompt('Why was it lost?') ?? '' : ''; void run(() => post({ action: 'move', dealId: x.id, stage: v, note }))(); }}><option value="" disabled>Move to…</option>{d.stages.filter((s2) => s2 !== st).map((s2) => <option key={s2} value={s2}>{s2}</option>)}</select>
              <button onClick={run(async () => { const j = await post({ action: 'requestNextStep', dealId: x.id }); setTasks({ ...tasks, [x.id]: j.task.id }); })}>Ask Muse Spark</button>
              {tasks[x.id] && <button onClick={run(async () => { const j = await post({ action: 'readNextStep', taskId: tasks[x.id] }); setAdvice({ ...advice, [x.id]: j.advice }); })}>Load advice</button>}
              {advice[x.id] && <p>Next step: {advice[x.id].nextStep} (model suggests {advice[x.id].probability}%) <button onClick={run(() => post({ action: 'move', dealId: x.id, stage: x.stage, probability: advice[x.id].probability, note: 'probability from approved model advice' }))}>Use {advice[x.id].probability}%</button></p>}
            </>}
          </article>)}
        </section>)}
      </div></>}
  </div>;
}
