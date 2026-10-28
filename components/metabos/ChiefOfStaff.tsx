'use client';
import { useEffect, useState } from 'react';
type Flag = { code: string; detail: string };
type Decision = { id: string; question: string; answer: string; decidedBy: string; createdAt: string };
type Brief = { generatedAt: string; headline: string; approvals: { runId: string; title: string; role: string; source: string; tier: string; flags: Flag[] }[]; missions: { total: number; byStatus: Record<string, number>; stuck: { missionId: string; request: string; failed: number }[] }; goals: { id: string; title: string; progress: number; status: string; note: string }[]; decisions: Decision[] };
const post = async (body: object) => { const r = await fetch('/api/metabos/chief-of-staff', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(j.error ?? 'Request failed'); return j; };
export function ChiefOfStaff() {
  const [b, setB] = useState<Brief | null>(null); const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState(''); const [a, setA] = useState(''); const [matches, setMatches] = useState<{ decision: Decision; score: number }[] | null>(null);
  const load = async () => { try { const r = await fetch('/api/metabos/chief-of-staff'); const j = await r.json(); if (!r.ok) throw new Error(j.error); setB(j.brief); } catch (e) { setError((e as Error).message); } };
  useEffect(() => { void load(); }, []);
  const run = (f: () => Promise<unknown>) => async () => { setError(null); try { await f(); await load(); } catch (e) { setError((e as Error).message); } };
  return <div className="mb-console mb-category">
    <span className="mb-eyebrow">BRAIN / CHIEF OF STAFF</span><h1>Chief of Staff brief</h1>
    <p className="mb-muted">One read-only brief across approvals, missions, goals and decisions. The observer flags risky agent proposals and gives each an advisory tier (T3 = money or irreversible). The tier never approves anything: every agent write still needs your payload-bound Jev approval.</p>
    {error && <p className="mb-alert" role="alert">{error}</p>}
    {!b ? <p className="mb-empty">Loading…</p> : <>
      <section className="mb-panel" aria-label="Headline"><h2>Today</h2><p>{b.headline}</p><button onClick={run(async () => {})}>Refresh</button></section>
      <section className="mb-panel" aria-label="Approvals"><h2>Waiting for you</h2>
        {!b.approvals.length ? <p className="mb-empty">Nothing waiting.</p> : <ul>{b.approvals.map((x) => <li key={x.runId}><strong>[{x.tier}]</strong> {x.title} <span className="mb-muted">({x.role}, {x.source})</span>{x.flags.length > 0 && <ul>{x.flags.map((f) => <li key={f.code}>⚠ {f.detail}</li>)}</ul>}</li>)}</ul>}
        <a href="/workspace/brain/runtime">Open the Jev queue</a></section>
      <section className="mb-panel" aria-label="Missions"><h2>Missions</h2><p>{b.missions.total} missions · {Object.entries(b.missions.byStatus).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'no tasks'}</p>
        {b.missions.stuck.map((m) => <p key={m.missionId}>{m.request}: {m.failed} failed or cancelled</p>)}<a href="/workspace/brain/missions">Open missions</a></section>
      <section className="mb-panel" aria-label="Goals"><h2>Goals</h2>{!b.goals.length ? <p className="mb-empty">No goals yet.</p> : <ul>{b.goals.map((g) => <li key={g.id}><strong>{g.status.replace('_', ' ')}</strong>: {g.note}</li>)}</ul>}<a href="/workspace/brain/goals">Open goals</a></section>
      <section className="mb-panel" aria-label="Decisions"><h2>Decisions registry</h2>
        <p className="mb-muted">Look a question up before asking it again. A decided question cannot be re-decided here.</p>
        <input aria-label="Question" placeholder="Do we offer free shipping over 999?" value={q} onChange={(e) => setQ(e.target.value)} />
        <button onClick={run(async () => setMatches((await post({ action: 'lookup', question: q })).matches))}>Look up</button>
        {matches && (matches.length ? <ul>{matches.map((m) => <li key={m.decision.id}>{m.decision.question} → <strong>{m.decision.answer}</strong> ({Math.round(m.score * 100)}% match)</li>)}</ul> : <p className="mb-empty">No prior decision.</p>)}
        <input aria-label="Answer" placeholder="Answer" value={a} onChange={(e) => setA(e.target.value)} />
        <button onClick={run(async () => { await post({ action: 'recordDecision', question: q, answer: a }); setA(''); setMatches(null); })}>Record decision</button>
        <ul>{b.decisions.map((d) => <li key={d.id}>{d.question} → <strong>{d.answer}</strong> <span className="mb-muted">({d.decidedBy})</span></li>)}</ul></section>
    </>}
  </div>;
}
