'use client';
/** AgentVerse OS V3 commit console. Layout follows the owner's reference: a numbered server rail,
 *  channel groups, the commit list and Logs/Diffs/Preview tabs. Only real records are shown and nothing is seeded.
 *  Every write is a draft or a Jev item. Sends go through Jev and /api/dispatch only. */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { GitCommit, Plus, Search, X } from 'lucide-react';

type Ev = { seq: number; action: string; hash: string };
type Commit = { sha: string; id: string; kind: string; server: string; author: string; title: string; diff: string[]; status: string; jevRunId: string | null; dispatchId: string | null; dispatch: string; createdAt: string; evidence: Ev[] };
type Conv = { id: string; channel: string; address: string; name: string | null; status: string; messages: { id: string; direction: string; author: string; body: string; at: string }[] };
type Ad = { id: string; name: string; objective: string; dailyBudgetMinor: number; currency: string; audience: string; creative: string; placements: string[]; roas: number | null; rules: { id: string; roasBelowX100: number }[]; workspaceId: string | null };
type Data = { role: string; workspaces: { id: string; name: string }[]; suggested: string[]; groups: { id: string; label: string; channels: string[]; business?: boolean }[]; inbox: Conv[]; inboxStatus: { id: string; adapter: boolean; status: string }[]; ads: Ad[]; adsConnection: string; commits: Commit[]; blame: { author: string; commits: number; lines: number; kinds: string[] }[]; onboarding: { env: string; step: string; present: boolean }[]; graph: { nodes: { id: string; type: string; label: string }[]; edges: { from: string; to: string; rel: string }[] }; swarms: { name: string; agents: number; pending: number }[]; footnote: string;
  home: { activity: { seq: number; kind: string; action: string; target: string; detail: string; at: string; hash: string }[]; campaigns: { id: string; name: string; objective: string; dailyBudgetMinor: number; status: string; roas: number | null }[]; queues: { id: string; label: string; state: string; detail: string }[]; jevWaiting: number } };
const PLACEMENTS = ['facebook_feed', 'instagram_feed', 'instagram_stories', 'reels', 'messenger'];
const tag = (c: Commit) => c.status === 'sent' && c.dispatchId ? 'SHIPPED' : c.status === 'pending' ? 'PENDING' : c.status.toUpperCase();
const tone = (t: string) => t === 'SHIPPED' ? 'ok' : t === 'PENDING' ? 'warn' : t === 'FAILED' || t === 'REJECTED' ? 'bad' : 'idle';
const ago = (iso: string) => { const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000)); return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
const post = async (action: string, input: unknown) => { const r = await fetch('/api/agentverse', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, input }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error ?? 'Request failed'); return j; };

export function AgentVerse() {
  const [d, setD] = useState<Data | null>(null); const [err, setErr] = useState(''); const [note, setNote] = useState('');
  const [mode, setMode] = useState<'personal' | 'business'>('business'); const [ws, setWs] = useState<string>('home');
  const [chan, setChan] = useState('home-overview'); const [sel, setSel] = useState<string | null>(null); const [tab, setTab] = useState<'logs' | 'diffs' | 'preview'>('diffs');
  const [k, setK] = useState(false); const [q, setQ] = useState(''); const [hits, setHits] = useState<{ type: string; id: string; label: string }[]>([]);
  const [newWs, setNewWs] = useState(''); const [creating, setCreating] = useState(false); const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({}); const [editing, setEditing] = useState<string | null>(null);
  const [step, setStep] = useState(0); const [w, setW] = useState({ objective: 'leads', audience: '', placements: ['instagram_feed'] as string[], name: '', text: '', budget: '' });
  const [pickTarget, setPickTarget] = useState(''); const qRef = useRef<HTMLInputElement>(null);
  const load = useCallback(() => { fetch('/api/agentverse').then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); setErr(''); }).catch((e) => setErr(String(e.message ?? e))); }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setK(true); } if (e.key === 'Escape') setK(false); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);
  useEffect(() => { if (k) qRef.current?.focus(); }, [k]);
  useEffect(() => { if (!q.trim()) { setHits([]); return; } const t = setTimeout(() => fetch(`/api/agentverse?q=${encodeURIComponent(q)}`).then((r) => r.json()).then((j) => setHits(j.results ?? [])).catch(() => setHits([])), 150); return () => clearTimeout(t); }, [q]);
  const run = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); setErr(''); try { await fn(); setNote(ok); load(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };
  const viewer = d?.role === 'Viewer'; const admin = d?.role === 'Admin';
  const commits = useMemo(() => (d?.commits ?? []).filter((c) => chan !== 'pending-approvals' || c.status === 'pending'), [d, chan]);
  const cur = commits.find((c) => c.id === sel) ?? commits[0];
  const pending = (d?.commits ?? []).filter((c) => c.status === 'pending').length;
  const groups = (d?.groups ?? []).filter((g) => mode === 'business' || !g.business);
  const status = (id: string) => d?.inboxStatus.find((x) => x.id === id)?.status ?? 'Not connected';
  const convs = (d?.inbox ?? []).filter((c) => chan === 'unified-inbox' || c.channel === chan);
  const wizard = async (e: FormEvent) => { e.preventDefault(); if (step < 4) { setStep(step + 1); return; }
    await run(() => post('adWizard', { workspaceId: ws === 'home' ? null : ws, objective: w.objective, audience: w.audience, placements: w.placements, creative: { name: w.name, text: w.text }, dailyBudgetMinor: Math.round(Number(w.budget) * 100) }), 'Draft campaign saved and one Jev item queued. Nothing was created on Meta.'); setStep(0); };
  const header = (title: string, sub?: string) => <header className="mb-av-head"><h1><span aria-hidden>#</span> {title}</h1>{sub && <span className="mb-muted">{sub}</span>}</header>;

  return <div className="mb-av" data-testid="agentverse" data-mode={mode}>
    <div className="mb-av-top">
      <strong>MeTa Server · AgentVerse OS</strong>
      <span className="mb-muted">{d ? `Role: ${d.role}` : ''}</span>
      <button type="button" className="mb-av-search" onClick={() => setK(true)} aria-label="Search commits, inbox, ads and agents (Ctrl or Cmd K)"><Search size={16} aria-hidden /> Search <kbd>⌘K</kbd></button>
      <div className="mb-av-toggle" role="group" aria-label="Mode">{(['personal', 'business'] as const).map((m) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>{m}</button>)}</div>
    </div>
    <nav className="mb-av-rail" aria-label="Workspaces">
      <button type="button" className="mb-av-srv" data-n="0" aria-current={ws === 'home' ? 'true' : undefined} aria-label="Home server" onClick={() => setWs('home')}>H</button>
      {d?.workspaces.map((x, i) => <button key={x.id} type="button" className="mb-av-srv" data-n={(i % 6) + 1} aria-current={ws === x.id ? 'true' : undefined} aria-label={`Workspace ${x.name}`} title={x.name} onClick={() => setWs(x.id)}>C{i + 1}</button>)}
      {admin && <button type="button" className="mb-av-srv is-add" aria-label="Create workspace" aria-expanded={creating} onClick={() => setCreating(!creating)}><Plus size={18} aria-hidden /></button>}
    </nav>
    <aside className="mb-av-side" aria-label="Channels">
      <p className="mb-av-srvname">{ws === 'home' ? 'Home Server' : d?.workspaces.find((x) => x.id === ws)?.name}<span className="mb-muted"> · {mode}</span></p>
      {creating && <form className="mb-av-form" aria-label="Create workspace" onSubmit={(e) => { e.preventDefault(); run(() => post('createWorkspace', { name: newWs }), `Workspace ${newWs} created`).then(() => { setNewWs(''); setCreating(false); }); }}>
        <label>Workspace name<input required maxLength={80} value={newWs} onChange={(e) => setNewWs(e.target.value)} list="mb-av-sugg" /></label>
        <datalist id="mb-av-sugg">{d?.suggested.map((n) => <option key={n} value={n} />)}</datalist>
        <button type="submit" disabled={busy}>Create workspace</button></form>}
      <ul><li><button type="button" className="mb-hub-chan" aria-current={chan === 'home-overview' ? 'true' : undefined} onClick={() => setChan('home-overview')}><span aria-hidden>#</span><span>home-overview</span></button></li></ul>
      {groups.map((g) => <div key={g.id}><p className="mb-hub-group">{g.label}</p><ul>{g.channels.map((c) => <li key={c}><button type="button" className="mb-hub-chan" aria-current={chan === c ? 'true' : undefined} onClick={() => { setChan(c); setSel(null); }}><span aria-hidden>#</span><span>{c}</span>{c === 'pending-approvals' && pending > 0 && <span className="mb-hub-badge" aria-label={`${pending} pending`}>{pending}</span>}</button></li>)}</ul></div>)}
      <p className="mb-av-foot">{d?.footnote ?? 'Built by codesbyfebin — Kochi'}</p>
    </aside>
    <section className="mb-av-main" aria-label="Channel">
      {err && <p className="mb-bad" role="alert">{err}</p>}{note && <p className="mb-hub-note" role="status">{note}</p>}
      {!d ? <p className="mb-muted mb-hub-empty">Loading…</p> : <>
      {chan === 'home-overview' && <div data-testid="av-home">{header('home-overview', 'Command center · real records only')}
        <div className="mb-av-hud">
          <section className="mb-av-panel" aria-labelledby="av-live"><h2 id="av-live">Live Activity</h2><p className="mb-muted">From the evidence chain and Jev. {d.home.jevWaiting} waiting in Jev.</p>
            {d.home.activity.length === 0 ? <p className="mb-muted mb-hub-empty">No records yet</p> : <ol className="mb-av-feed" tabIndex={0} aria-label="Live activity">{d.home.activity.map((a) => <li key={a.seq}><span className="mb-av-tag">{a.kind}</span> <code>{a.action}</code><span className="mb-muted"> #{a.seq} · {ago(a.at)} · {a.hash.slice(0, 8)}</span>{a.detail && <p className="mb-hub-text">{a.detail}</p>}</li>)}</ol>}</section>
          <section className="mb-av-panel" aria-labelledby="av-camp"><h2 id="av-camp">Active Campaigns</h2><p className="mb-muted">{d.adsConnection}</p>
            {d.home.campaigns.length === 0 ? <p className="mb-muted mb-hub-empty">No records yet</p> : <ul className="mb-av-cards">{d.home.campaigns.map((c) => <li key={c.id}><strong>{c.name}</strong> <span className="mb-av-tag" data-tone={tone(c.status)}>{c.status}</span><span className="mb-muted">{c.objective} · ₹{(c.dailyBudgetMinor / 100).toFixed(2)}/day · {c.roas === null ? 'ROAS: Usage unavailable' : `ROAS ${c.roas}`}</span></li>)}</ul>}</section>
          <section className="mb-av-panel" aria-labelledby="av-q"><h2 id="av-q">Queue Status</h2><p className="mb-muted">Probed on load. Only infrastructure that exists is shown as ready.</p>
            <ul className="mb-av-cards" data-testid="av-queues">{d.home.queues.map((q) => <li key={q.id}><span><span className="mb-av-tag" data-tone={q.state === 'ready' ? 'ok' : q.state === 'not_connected' ? 'warn' : 'idle'}>{q.state === 'ready' ? 'ready' : q.state === 'not_connected' ? 'not connected' : 'not configured'}</span> <strong>{q.label}</strong></span><span className="mb-muted">{q.detail}</span></li>)}</ul></section>
        </div></div>}
      {(chan === 'commit-log' || chan === 'pending-approvals') && <div className="mb-av-split">
        <div className="mb-av-list">{header(chan, `Commit graph · ${commits.length} commits`)}
          {commits.length === 0 ? <p className="mb-muted mb-hub-empty">No records yet</p> : <ol data-testid="av-commits">{commits.map((c) => { const t = tag(c); return <li key={`${c.kind}-${c.id}`}><button type="button" className="mb-av-commit" aria-current={cur?.id === c.id ? 'true' : undefined} onClick={() => setSel(c.id)}>
            <span className="mb-av-meta"><code>{c.sha}</code> · {ago(c.createdAt)} <span className="mb-av-tag" data-tone={tone(t)}>{t}</span></span>
            <span className="mb-av-msg">{c.kind}: {c.title}</span><span className="mb-muted">{c.author}</span></button></li>; })}</ol>}</div>
        <div className="mb-av-detail">
          <div className="mb-av-tabs" role="tablist" aria-label="Commit detail">{(['logs', 'diffs', 'preview'] as const).map((t) => <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}<span className="mb-muted">{cur ? `${cur.sha} · evidence ${cur.evidence.length ? `#${cur.evidence[cur.evidence.length - 1].seq}` : 'none yet'}` : ''}</span></div>
          {!cur ? <p className="mb-muted mb-hub-empty">No records yet</p> : <div role="tabpanel">
            {tab === 'logs' && <pre className="mb-av-log">{[`> ${cur.kind} · ${cur.title}`, `> trace ${cur.sha} · co-authored-by: ${cur.author}`, ...(cur.jevRunId ? [`> Jev ${cur.jevRunId}`] : []), `> ${cur.dispatch}`, ...cur.evidence.map((e) => `> evidence #${e.seq} ${e.action} ${e.hash}`)].join('\n')}</pre>}
            {tab === 'diffs' && <><p className="mb-av-file">{cur.kind.replace(/\W+/g, '_')}/{cur.id}.yaml <span data-tone="ok">+{cur.diff.filter((l) => l.startsWith('+')).length}</span> <span data-tone="bad">-{cur.diff.filter((l) => l.startsWith('-')).length}</span></p>
              <pre className="mb-av-diff" aria-label={`Diff for ${cur.sha}`}>{cur.diff.map((l, i) => <span key={i} data-tone={l.startsWith('+') ? 'ok' : l.startsWith('-') ? 'bad' : undefined}>{l}{'\n'}</span>)}</pre>
              <p className="mb-muted">co-authored-by: {cur.author}</p></>}
            {tab === 'preview' && <div className="mb-av-preview"><p><strong>{cur.title}</strong></p><p className="mb-muted">{tag(cur) === 'SHIPPED' ? 'Shipped: Jev approval and a dispatch receipt are on record.' : 'Not shipped. SHIPPED needs a Jev approval plus a dispatch receipt.'}</p></div>}
            {!viewer && <div className="mb-av-actions">
              <button type="button" disabled={busy} onClick={() => run(() => post('gitOp', { op: 'revert', commitId: cur.id }), `Revert of ${cur.sha} queued as a new Jev item`)}>Revert (Jev)</button>
              <label>Target<select value={pickTarget} onChange={(e) => setPickTarget(e.target.value)}><option value="">Choose workspace</option>{d.workspaces.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
              <button type="button" disabled={busy || !pickTarget} onClick={() => run(() => post('gitOp', { op: 'cherry-pick', commitId: cur.id, target: pickTarget }), `Cherry-pick of ${cur.sha} queued as a new Jev item`)}>Cherry-pick (Jev)</button></div>}
          </div>}
        </div></div>}
      {chan === 'branches' && <>{header('branches', 'One branch per workspace you created')}{d.workspaces.length === 0 ? <p className="mb-muted mb-hub-empty">No records yet. {admin ? 'Use + in the rail to create a workspace.' : 'An Admin can create one.'}</p> : <ul className="mb-av-cards">{d.workspaces.map((x) => <li key={x.id}><strong>{x.name}</strong><span className="mb-muted">{d.ads.filter((a) => a.workspaceId === x.id).length} ad drafts</span></li>)}</ul>}</>}
      {chan === 'knowledge-graph' && <>{header('knowledge-graph', `${d.graph.nodes.length} nodes · ${d.graph.edges.length} edges from real records`)}{d.graph.nodes.length === 0 ? <p className="mb-muted mb-hub-empty">No records yet</p> : <ul className="mb-av-cards" data-testid="av-graph">{d.graph.nodes.slice(0, 120).map((n) => <li key={n.id}><span className="mb-av-tag">{n.type}</span> {n.label}<span className="mb-muted">{d.graph.edges.filter((e) => e.from === n.id).map((e) => ` ${e.rel} → ${d.graph.nodes.find((m) => m.id === e.to)?.label ?? e.to}`).join(',')}</span></li>)}</ul>}</>}
      {['unified-inbox', 'whatsapp', 'instagram'].includes(chan) && <>{header(chan, chan === 'unified-inbox' ? `WhatsApp: ${status('whatsapp')} · Instagram: ${status('instagram')}` : status(chan))}
        {convs.length === 0 ? <p className="mb-muted mb-hub-empty">No records yet</p> : <ul className="mb-av-cards">{convs.map((c) => <li key={c.id}><p><strong>{c.name ?? c.address}</strong> <span className="mb-av-tag">{c.channel}</span></p>
          {c.messages.slice(-4).map((m) => <p key={m.id} className="mb-hub-text">{m.direction === 'in' ? '←' : '→'} {m.body}</p>)}
          {!viewer && <div className="mb-av-form"><label>Reply draft<textarea rows={2} maxLength={4096} readOnly={editing !== c.id} value={drafts[c.id] ?? ''} onChange={(e) => setDrafts({ ...drafts, [c.id]: e.target.value })} /></label>
            <div className="mb-av-actions"><button type="button" onClick={() => setEditing(editing === c.id ? null : c.id)} aria-pressed={editing === c.id}>Edit</button>
            <button type="button" disabled={busy || !(drafts[c.id] ?? '').trim()} onClick={() => run(() => post('approveReply', { conversationId: c.id, body: drafts[c.id] }), 'Reply proposed. It sends only after Jev approval through /api/dispatch.')}>Approve</button></div></div>}</li>)}</ul>}</>}
      {['facebook', 'messenger', 'threads', 'meta-ai'].includes(chan) && <>{header(chan, status(chan))}<p className="mb-muted mb-hub-empty">Not connected</p></>}
      {chan === 'campaigns' && <>{header('campaigns', d.adsConnection)}
        {!viewer && <form className="mb-av-form" aria-label={`Ads wizard step ${step + 1} of 5`} onSubmit={wizard}>
          <ol className="mb-av-steps">{['Objective', 'Audience', 'Placements', 'Creative', 'Budget'].map((s, i) => <li key={s} aria-current={i === step ? 'step' : undefined}>{i + 1}. {s}</li>)}</ol>
          {step === 0 && <label>Objective<select value={w.objective} onChange={(e) => setW({ ...w, objective: e.target.value })}>{['awareness', 'traffic', 'engagement', 'leads', 'sales'].map((o) => <option key={o}>{o}</option>)}</select></label>}
          {step === 1 && <label>Audience<textarea required rows={2} maxLength={500} value={w.audience} onChange={(e) => setW({ ...w, audience: e.target.value })} /></label>}
          {step === 2 && <fieldset><legend>Placements</legend>{PLACEMENTS.map((p) => <label key={p} className="mb-av-check"><input type="checkbox" checked={w.placements.includes(p)} onChange={(e) => setW({ ...w, placements: e.target.checked ? [...w.placements, p] : w.placements.filter((x) => x !== p) })} />{p}</label>)}</fieldset>}
          {step === 3 && <><label>Campaign name<input required maxLength={120} value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} /></label><label>Creative text<textarea required rows={3} maxLength={2000} value={w.text} onChange={(e) => setW({ ...w, text: e.target.value })} /></label></>}
          {step === 4 && <label>Daily budget (₹)<input required inputMode="decimal" pattern="\d+(\.\d{1,2})?" value={w.budget} onChange={(e) => setW({ ...w, budget: e.target.value })} /></label>}
          <div className="mb-av-actions">{step > 0 && <button type="button" onClick={() => setStep(step - 1)}>Back</button>}<button type="submit" disabled={busy || (step === 2 && w.placements.length === 0)}>{step < 4 ? 'Next' : 'Save draft for Jev'}</button></div>
          <p className="mb-muted">Creates a draft campaign and one Jev item. There is no Marketing API adapter, so no Meta call is made.</p></form>}
        {d.ads.length === 0 ? <p className="mb-muted mb-hub-empty">No records yet</p> : <ul className="mb-av-cards">{d.ads.map((a) => <li key={a.id}><strong>{a.name}</strong> <span className="mb-av-tag">{a.objective}</span><span className="mb-muted">₹{(a.dailyBudgetMinor / 100).toFixed(2)}/day · {a.placements.join(', ') || 'placements not set'}</span>
          {!viewer && <button type="button" disabled={busy} onClick={() => run(() => post('addRule', { adId: a.id, roasBelow: 1.5 }), 'Rule saved: proposes a pause in Jev if real ROAS drops below 1.5')}>Add rule: propose pause if ROAS &lt; 1.5</button>}
          {a.rules.length > 0 && <span className="mb-muted">{a.rules.length} rule(s): propose pause below {a.rules.map((r) => r.roasBelowX100 / 100).join(', ')}</span>}</li>)}</ul>}</>}
      {chan === 'creatives-lab' && <>{header('creatives-lab')}{d.ads.length === 0 ? <p className="mb-muted mb-hub-empty">No records yet</p> : <ul className="mb-av-cards">{d.ads.map((a) => <li key={a.id}><strong>{a.name}</strong><p className="mb-hub-text">{a.creative}</p></li>)}</ul>}</>}
      {chan === 'audiences' && <>{header('audiences')}{d.ads.length === 0 ? <p className="mb-muted mb-hub-empty">No records yet</p> : <ul className="mb-av-cards">{d.ads.map((a) => <li key={a.id}><strong>{a.name}</strong><p className="mb-hub-text">{a.audience}</p></li>)}</ul>}</>}
      {chan === 'roas-dashboard' && <>{header('roas-dashboard', 'ROAS appears only when real insights exist')}{d.ads.length === 0 ? <p className="mb-muted mb-hub-empty">No records yet</p> : <><ul className="mb-av-cards">{d.ads.map((a) => <li key={a.id}><strong>{a.name}</strong><span>{a.roas === null ? 'Usage unavailable' : `ROAS ${a.roas}`}</span></li>)}</ul>{!viewer && <button type="button" disabled={busy} onClick={() => run(() => post('evaluateRules', {}), 'Rules checked against real insights. Any breach is proposed in Jev, never applied.')}>Check rules</button>}</>}</>}
      {chan === 'agents-online' && <>{header('agents-online')}{d.swarms.length === 0 ? <p className="mb-muted mb-hub-empty">No records yet</p> : <ul className="mb-av-cards">{d.swarms.map((s) => <li key={s.name}><strong>{s.name}</strong><span className="mb-muted">{s.agents} agent cards · {s.pending} waiting in Jev</span></li>)}</ul>}</>}
      {chan === 'blame' && <>{header('blame', 'Which agent wrote what')}{d.blame.length === 0 ? <p className="mb-muted mb-hub-empty">No records yet</p> : <table className="mb-av-table"><thead><tr><th scope="col">Author</th><th scope="col">Commits</th><th scope="col">Diff lines</th><th scope="col">Kinds</th></tr></thead><tbody>{d.blame.map((b) => <tr key={b.author}><td>{b.author}</td><td>{b.commits}</td><td>{b.lines}</td><td>{b.kinds.join(', ')}</td></tr>)}</tbody></table>}</>}
      {chan === 'onboarding' && <>{header('onboarding', 'Real env status. Values are never shown.')}<ul className="mb-av-cards" data-testid="av-onboarding">{d.onboarding.map((o) => <li key={o.env}><span className="mb-av-tag" data-tone={o.present ? 'ok' : 'warn'}>{o.present ? 'set' : 'missing'}</span> <code>{o.env}</code><span className="mb-muted">{o.step}</span></li>)}</ul></>}
      {chan === 'roles' && <>{header('roles')}<table className="mb-av-table"><thead><tr><th scope="col">Role</th><th scope="col">Member role</th><th scope="col">Can</th></tr></thead><tbody><tr><td>Admin</td><td>owner</td><td>Create workspaces, draft, decide in Jev</td></tr><tr><td>Agent</td><td>manager</td><td>Draft, propose replies, revert and cherry-pick (as Jev items)</td></tr><tr><td>Viewer</td><td>member</td><td>Read only</td></tr></tbody></table><p className="mb-muted">You are: {d.role}</p></>}
      </>}
    </section>
    {k && <div className="mb-av-k" role="dialog" aria-modal="true" aria-label="Search">
      <div className="mb-av-kbox"><div className="mb-av-actions"><Search size={16} aria-hidden /><input ref={qRef} aria-label="Search commits, inbox, ads and agents" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search commits, inbox, ads, agents" /><button type="button" aria-label="Close search" onClick={() => setK(false)}><X size={16} aria-hidden /></button></div>
        <ul>{q.trim() && hits.length === 0 ? <li className="mb-muted">No records yet</li> : hits.map((h) => <li key={`${h.type}-${h.id}`}><button type="button" onClick={() => { setK(false); if (h.type === 'commit') { setChan('commit-log'); setSel(h.id); } else if (h.type === 'inbox') setChan('unified-inbox'); else if (h.type === 'ad') setChan('campaigns'); else setChan('agents-online'); }}><GitCommit size={14} aria-hidden /> <span className="mb-av-tag">{h.type}</span> {h.label}</button></li>)}</ul></div></div>}
  </div>;
}
