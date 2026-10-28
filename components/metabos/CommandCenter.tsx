'use client';
import { useEffect, useState } from 'react';
import { inr, postTo, SignedInAs, useMe } from './bizClient';
type Ref = { record: string; id: string };
type Friction = { kind: string; severity: number; title: string; detail: string; refs: Ref[]; playbook: { title: string; steps: string[]; href: string } };
type Step = { idx: number; kind: string; state: string; title: string; detail: string; decidedBy: string | null };
type Plan = { id: string; ask: string; status: string; items: Friction[]; steps: Step[] };
type View = {
  plans: Plan[];
  radar: Friction[];
  promises: { id: string; party: string; text: string; dueAt: string; state: string; evidence: { reference: string | null } | null }[];
  proofs: { id: string; reference: string; amount: number; payer: string; status: string; candidates: { invoiceId: string; number: string; customer: string; total: number }[] }[];
  brief: { facts: { label: string; value: number; source: string }[]; chainIntact: boolean; asOfEvidenceSeq: number; digest: string; note: string };
  bundles: { workflowId: string; runs: { id: string }[]; bundleHash: string }[];
  nearMisses: { counts: Record<string, number>; items: { seq: number; action: string; detail: string; at: string }[]; note: string };
};
const post = postTo('/api/metabos/command-center');
export function CommandCenter() {
  const me = useMe(); const [v, setV] = useState<View | null>(null); const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState('');
  const [pr, setPr] = useState({ party: '', text: '', due: '' }); const [pf, setPf] = useState({ reference: '', amount: '', payer: '' });
  const load = async () => { try { const r = await fetch('/api/metabos/command-center'); const j = await r.json(); if (!r.ok) throw new Error(j.error); setV(j); } catch (e) { setError((e as Error).message); } };
  useEffect(() => { void load(); }, []);
  const act = (body: object) => async () => { setError(null); try { await post(body); await load(); } catch (e) { setError((e as Error).message); } };
  return <div className="mb-console mb-category">
    <span className="mb-eyebrow">MONEY / COMMAND CENTER</span><h1>Command Center</h1>
    <p className="mb-muted">Everything here is computed from your stored records. Nothing is marked paid, sent or approved without a person.</p>
    {error && <p className="mb-alert" role="alert">{error}</p>}
    <SignedInAs me={me} />
    {v && <>
      <section className="mb-panel" id="plan" aria-label="Ask, review, act"><h2>Ask · Review · Act</h2>
        <form onSubmit={(e) => { e.preventDefault(); void act({ action: 'plan.ask', ask })(); setAsk(''); }}><label>Ask about your records <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Which invoices are overdue?" maxLength={300} /></label> <button type="submit" disabled={ask.trim().length < 3}>Make a plan</button></form>
        <small className="mb-muted">Matched by keyword against the Friction Radar. No model is called. Approving records your decision only.</small>
        {v.plans.map((p) => <article className="mb-order" key={p.id} data-plan={p.status}><div className="mb-row"><div><strong>{p.ask}</strong><small>{p.status} · {p.items.length} item(s)</small></div></div>
          <ol>{p.steps.map((s) => <li key={s.idx} data-step={s.kind} data-state={s.state}><strong>{s.kind.toUpperCase()}</strong> <span className="mb-tool-status">{s.state.replace(/_/g, ' ')}</span> {s.title}: <small>{s.detail}{s.decidedBy ? ` · by ${s.decidedBy}` : ''}</small>
            {s.kind === 'review' && s.state === 'ready' && <><ul>{p.items.map((f, i) => <li key={i}>{f.title} · <small>{f.detail} · {f.refs.map((r) => `${r.record}:${r.id.slice(0, 8)}`).join(', ')}</small></li>)}</ul><button onClick={act({ action: 'plan.review', id: p.id })}>Confirm review</button></>}
            {s.kind === 'act' && s.state === 'awaiting_approval' && <><ul>{[...new Map(p.items.map((f) => [f.kind, f.playbook])).values()].map((pb) => <li key={pb.title}><a href={pb.href}>{pb.title}</a>: {pb.steps.join(' ')}</li>)}</ul><button onClick={act({ action: 'plan.approve', id: p.id })}>Approve</button> <button onClick={act({ action: 'plan.reject', id: p.id })}>Reject</button></>}
          </li>)}</ol></article>)}
      </section>
      <section className="mb-panel" id="radar" aria-label="Friction Radar"><h2>Friction Radar ({v.radar.length})</h2>
        {!v.radar.length ? <p className="mb-empty">No friction found in stored records.</p> : v.radar.map((f, i) => <article className="mb-order" key={`${f.kind}-${i}`} data-kind={f.kind}>
          <div className="mb-row"><div><strong>{f.title}</strong><small>{f.kind.replace(/_/g, ' ')} · {f.detail}</small></div></div>
          <details><summary>Playbook: {f.playbook.title}</summary><ol>{f.playbook.steps.map((s) => <li key={s}>{s}</li>)}</ol><a href={f.playbook.href}>Open</a> · <small>{f.refs.map((r) => `${r.record}:${r.id.slice(0, 8)}`).join(', ')}</small></details>
        </article>)}
      </section>
      <section className="mb-panel" aria-label="Verified Business Brief"><h2>Verified Business Brief</h2>
        <p className={v.brief.chainIntact ? 'mb-muted' : 'mb-alert'}>{v.brief.note} As of evidence #{v.brief.asOfEvidenceSeq} · digest <code>{v.brief.digest.slice(0, 12)}</code></p>
        <ul>{v.brief.facts.map((f) => <li key={f.label}>{f.label}: <strong>{/paise/.test(f.label) ? inr(f.value) : f.value}</strong> <small className="mb-muted">({f.source})</small></li>)}</ul>
      </section>
      <section className="mb-panel" id="bundles" aria-label="Approval Bundles"><h2>Approval Bundles</h2>
        {!v.bundles.length ? <p className="mb-empty">No runs are waiting for approval.</p> : v.bundles.map((b) => <div key={b.workflowId} className="mb-row"><span>{b.workflowId}: {b.runs.length} run(s) · <code>{b.bundleHash.slice(0, 12)}</code></span><button onClick={act({ action: 'bundle.approve', workflowId: b.workflowId, bundleHash: b.bundleHash })}>Approve bundle</button></div>)}
        <p className="mb-muted">Approval only; each run still executes through its own page. If any run changed, nothing is approved.</p>
      </section>
      <section className="mb-panel" id="promises" aria-label="Promise Tracker"><h2>Promise Tracker</h2>
        <ul>{v.promises.map((p) => <li key={p.id}>{p.party}: {p.text} · due {p.dueAt.slice(0, 10)} · <strong>{p.state}</strong>{p.state === 'open' || p.state === 'broken' ? <> <button onClick={act({ action: 'promise.close', id: p.id, status: 'kept' })}>Kept</button><button onClick={act({ action: 'promise.close', id: p.id, status: 'dropped' })}>Drop</button></> : null}</li>)}</ul>
        <form onSubmit={(e) => { e.preventDefault(); void act({ action: 'promise.add', promise: { party: pr.party, text: pr.text, dueAt: new Date(pr.due).toISOString(), invoiceId: null } })(); }}>
          <input aria-label="Party" placeholder="Who" value={pr.party} onChange={(e) => setPr({ ...pr, party: e.target.value })} />
          <input aria-label="Promise" placeholder="What was promised" value={pr.text} onChange={(e) => setPr({ ...pr, text: e.target.value })} />
          <input aria-label="Due" type="date" value={pr.due} onChange={(e) => setPr({ ...pr, due: e.target.value })} /><button disabled={!pr.party || !pr.text || !pr.due}>Record promise</button></form>
      </section>
      <section className="mb-panel" id="proofs" aria-label="Payment Proof Inbox"><h2>Payment Proof Inbox</h2>
        <p className="mb-muted">A claim is not a payment. Accept only after checking the bank statement; the amount must equal the invoice total.</p>
        <ul>{v.proofs.map((p) => <li key={p.id}>{p.reference} · {p.payer} · {inr(p.amount)} · <strong>{p.status}</strong>{p.status === 'pending' && <>{p.candidates.map((c) => <button key={c.invoiceId} onClick={act({ action: 'proof.accept', id: p.id, invoiceId: c.invoiceId })}>Match {c.number}</button>)}<button onClick={act({ action: 'proof.reject', id: p.id, reason: 'Not on bank statement' })}>Reject</button></>}</li>)}</ul>
        <form onSubmit={(e) => { e.preventDefault(); void act({ action: 'proof.submit', proof: { reference: pf.reference, amount: Math.round(Number(pf.amount) * 100), payer: pf.payer } })(); }}>
          <input aria-label="Reference" placeholder="UTR / reference" value={pf.reference} onChange={(e) => setPf({ ...pf, reference: e.target.value })} />
          <input aria-label="Amount" placeholder="Amount INR" inputMode="decimal" value={pf.amount} onChange={(e) => setPf({ ...pf, amount: e.target.value })} />
          <input aria-label="Payer" placeholder="Payer" value={pf.payer} onChange={(e) => setPf({ ...pf, payer: e.target.value })} /><button disabled={!pf.reference || !pf.amount || !pf.payer}>Log claim</button></form>
      </section>
      <section className="mb-panel" aria-label="Near-Miss Memory"><h2>Near-Miss Memory ({v.nearMisses.items.length})</h2><p className="mb-muted">{v.nearMisses.note}</p>
        <ul>{v.nearMisses.items.slice(0, 20).map((n) => <li key={n.seq}><code>{n.action}</code> · {n.detail} <small>{n.at.slice(0, 16)}</small></li>)}</ul>
      </section>
    </>}
  </div>;
}
