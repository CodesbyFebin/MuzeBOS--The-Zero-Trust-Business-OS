'use client';
/** Judge demo mode: a guided 3-minute walk through one real approval loop.
 *  Real: the brand workspace, the dispatch proposal, the Jev decision (payload hash), the /api/dispatch call,
 *  the evidence chain, the activity feed and the weekly report. FIXTURE: the inbound WhatsApp lead (unless a
 *  real webhook delivered one) and the template reply text. Both are labelled on screen. */
import { useEffect, useState } from 'react';

type Status = { whatsappSend: string; webhook: string; realInbound: number; fixtures: boolean; dryRun?: string };
type Lead = { name: string; body: string; fixture: boolean };
type Commit = { id: string; kind: string; title: string; diff: string[]; status: string; dispatchId: string | null };
type Feed = { seq: number; kind: string; action: string; detail: string; at: string };
type Report = { evidenceRows: number; chainValid: boolean; inbound: number; dispatchesSent: number; jev: { proposed: number; waiting: number } };
const STEPS = ['MUSE greets', 'Brand workspace', 'Lead arrives', 'Agent drafts', 'Pending commit', 'You decide', 'Evidence & report'];
const j = async (u: string, init?: RequestInit) => { const r = await fetch(u, init); const b = await r.json().catch(() => ({})); return { ok: r.ok, status: r.status, b }; };
const post = (u: string, body: unknown, h: Record<string, string> = {}) => j(u, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(body) });

export function JudgeDemo() {
  const [step, setStep] = useState(0); const [st, setSt] = useState<Status | null>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [brand, setBrand] = useState(''); const [conv, setConv] = useState(''); const [draft, setDraft] = useState(''); const [leadInfo, setLead] = useState<Lead | null>(null);
  const [disp, setDisp] = useState<{ id: string; hash: string } | null>(null); const [commit, setCommit] = useState<Commit | null>(null);
  const [outcome, setOutcome] = useState(''); const [feed, setFeed] = useState<Feed[]>([]); const [report, setReport] = useState<Report | null>(null);
  useEffect(() => { j('/api/demo').then((r) => r.ok ? setSt(r.b) : setErr(r.b.error ?? 'Sign in as the owner to run the demo')); }, []);
  const run = async (f: () => Promise<void>) => { setBusy(true); setErr(''); try { await f(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };
  const must = (r: { ok: boolean; b: { error?: string } }) => { if (!r.ok) throw new Error(r.b.error ?? 'Request failed'); return r.b as never; };

  const createWs = () => run(async () => { const r = await post('/api/agentverse', { action: 'createWorkspace', input: { name: brand } }); if (!r.ok && r.status !== 409) must(r); setStep(2); });
  const lead = () => run(async () => { const r: { conversationId: string } = must(await post('/api/demo', { action: 'fixtureLead' })); setConv(r.conversationId); setLead({ name: 'Fixture lead (demo)', body: 'Hi, do you do pickups this week?', fixture: true }); setStep(3); });
  const real = () => run(async () => { const r: { conversationId: string } & Lead = must(await post('/api/demo', { action: 'realLead' })); setConv(r.conversationId); setLead(r); setStep(3); });
  const drafted = () => run(async () => { const r: { body: string } = must(await post('/api/demo', { action: 'draft', conversationId: conv, brand })); setDraft(r.body); });
  const propose = () => run(async () => {
    const r: { dispatchId: string; payloadHash: string } = must(await post('/api/agentverse', { action: 'approveReply', input: { conversationId: conv, body: draft } }));
    setDisp({ id: r.dispatchId, hash: r.payloadHash });
    const o = await j('/api/agentverse'); setCommit((o.b.commits as Commit[] | undefined)?.find((c) => c.dispatchId === r.dispatchId) ?? null); setStep(5);
  });
  const loadEvidence = async () => {
    const o = await j('/api/agentverse');
    setFeed(((o.b.feed as Feed[]) ?? []).slice(0, 8));
    const m = await j('/api/meta');
    setReport(m.b.report ?? null);
  };
  const decide = (decision: 'reject' | 'approve' | 'dispatch') => run(async () => {
    if (!disp) return;
    must(await post('/api/dispatch', { action: 'decide', id: disp.id, payloadHash: disp.hash, approve: decision !== 'reject' }));
    if (decision !== 'dispatch') {
      setOutcome(decision === 'reject' ? 'Rejected. No dispatch was attempted.' : 'Approved. No dispatch was attempted.');
      setStep(6);
      await loadEvidence();
      return;
    }
    const r = await post('/api/dispatch', { action: 'dispatch', id: disp.id, payloadHash: disp.hash }, { 'idempotency-key': crypto.randomUUID() });
    if (r.ok) setOutcome(`Dispatch status: ${r.b.dispatch?.status} (HTTP ${r.b.dispatch?.providerStatus ?? '—'} from the provider)`);
    else {
      setOutcome(`Approved, then held — not sent: ${r.b.error ?? r.status}`);
    }
    setStep(6);
    if (!r.ok) await post('/api/demo', { action: 'held', dispatchId: disp.id, reason: String(r.b.error ?? r.status) });
    await loadEvidence();
  });

  return (
    <section className="mb-console mb-demo" data-testid="judge-demo" aria-label="Judge demo mode">
      <header className="mb-demo-head">
        <p className="mb-eyebrow">DEMO MODE · ABOUT 3 MINUTES</p>
        <h1>One draft, one decision, a trail you can verify</h1>
        <p className="mb-muted">Items marked <span className="mb-demo-fx">FIXTURE</span> are demo inputs, not real customers or model output. Everything else is a real record in this server.</p>
      </header>
      <ol className="mb-demo-steps" aria-label="Demo steps">{STEPS.map((s, i) => <li key={s} aria-current={i === step ? 'step' : undefined} className={i < step ? 'done' : i === step ? 'on' : ''}>{i + 1}. {s}</li>)}</ol>
      {err && <p role="alert" className="mb-demo-err">{err}</p>}
      {!st && !err && <p className="mb-muted" role="status">Loading demo status…</p>}
      {st && <dl className="mb-demo-status" aria-label="Connection status"><div><dt>WhatsApp send</dt><dd>{st.whatsappSend}</dd></div><div><dt>Webhook</dt><dd>{st.webhook}</dd></div><div><dt>Real inbound messages</dt><dd>{st.realInbound}</dd></div>{st.dryRun && <div><dt>Send mode</dt><dd>{st.dryRun}</dd></div>}</dl>}

      <div className="mb-demo-card" aria-live="polite">
        {step === 0 && <><p className="mb-demo-muse">MUSE: “Hi, I’m MUSE. I draft, you decide. Nothing leaves this server without your approval.”</p><button type="button" onClick={() => setStep(1)} disabled={!st}>Start demo</button></>}
        {step === 1 && <form onSubmit={(e) => { e.preventDefault(); if (brand.trim()) createWs(); }} aria-label="Create brand workspace">
          <label htmlFor="demo-brand">Your brand name (creates a real, empty workspace)</label>
          <input id="demo-brand" value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={80} placeholder="e.g. your shop name" required />
          <button type="submit" disabled={busy || !brand.trim()}>Create workspace</button></form>}
        {step === 2 && <><p>Waiting for a WhatsApp lead. {st?.realInbound ? 'Real webhook messages exist in the Unified Inbox.' : 'No webhook is configured, so this step inserts a labelled fixture.'}</p>
          {st?.realInbound ? <button type="button" onClick={real} disabled={busy}>Use latest real WhatsApp message</button> : null}
          <button type="button" onClick={lead} disabled={busy || !st?.fixtures}>Insert <span className="mb-demo-fx">FIXTURE</span> lead</button></>}
        {step === 3 && <>{!draft ? <><p>New lead from <b>{leadInfo?.name ?? 'Fixture lead (demo)'}</b> {leadInfo?.fixture === false ? <span className="mb-demo-fx">REAL · via signed webhook</span> : <span className="mb-demo-fx">FIXTURE</span>}: “{leadInfo?.body ?? 'Hi, do you do pickups this week?'}”</p><button type="button" onClick={drafted} disabled={busy}>Ask the agent to draft a reply</button></> :
          <><label htmlFor="demo-draft">Draft reply <span className="mb-demo-fx">TEMPLATE — not model output</span> (you can edit it)</label>
            <textarea id="demo-draft" value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} maxLength={4096} />
            <button type="button" onClick={propose} disabled={busy || !draft.trim()}>Propose as commit</button></>}</>}
        {step === 5 && <><p>The reply is now a <b>PENDING</b> commit. Nothing has been sent.</p>
          {commit ? <pre className="mb-av-diff" aria-label="Commit diff">{commit.diff.join('\n')}</pre> : <p className="mb-muted">Commit not found in the log yet.</p>}
          {disp && <div>Proposed payload SHA-256<pre className="mb-av-diff">{disp.hash}</pre></div>}
          <button type="button" onClick={() => decide('reject')} disabled={busy}>Reject proposal</button>{' '}
          <button type="button" onClick={() => decide('approve')} disabled={busy}>Approve without dispatch</button>{' '}
          {leadInfo?.fixture === false && <button type="button" onClick={() => decide('dispatch')} disabled={busy}>Approve &amp; dispatch</button>}</>}
        {step === 6 && <><p data-testid="demo-outcome"><b>{outcome}</b></p>
          <h2>Activity feed (latest evidence)</h2>
          {feed.length ? <ul className="mb-demo-feed">{feed.map((f) => <li key={f.seq}><code>#{f.seq} {f.action}</code> {f.detail}</li>)}</ul> : <p className="mb-muted">No feed entries.</p>}
          <h2>Weekly report</h2>
          {report ? <p>Evidence rows {report.evidenceRows} · chain {report.chainValid ? 'valid' : 'INVALID'} · Jev proposed {report.jev.proposed} · dispatches sent {report.dispatchesSent}</p> : <p className="mb-muted">Report unavailable.</p>}
          <p><a href="/api/evidence?format=bundle">Download evidence bundle</a>. The bundle contains the workspace audit history. Review it before sharing.</p>
          <p>From the repository, run <code>npm run evidence:verify -- &lt;bundle-path&gt;</code> to check it offline. Compare the root against a separately trusted copy to establish provenance.</p>
          <a href="/workspace/builder/agentverse">Open the AgentVerse console</a></>}
      </div>
    </section>
  );
}
