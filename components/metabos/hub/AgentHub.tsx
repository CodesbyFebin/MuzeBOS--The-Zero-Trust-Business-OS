'use client';
/** Agent Hub — chat-style command center over real swarm records. Layout idea from the owner's prototype; rebuilt. */
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Hash, ShieldCheck, Activity, Plus, Bot, Users, X, Send } from 'lucide-react';

type Server = { name: string; agents: number; runs: number; pending: number };
type Channel = { id: string; name: string; group: string; topic: string; subcluster?: string };
type Msg = { id: string; kind: 'agent_draft' | 'composer_draft'; author: string; cardId: string | null; source: string; text: string; guard: string | null; jev: string; jevRunId: string | null; platform: string | null; createdAt: string };
type Member = { id: string; name: string; role: string; tier: string; risk: string; jev: boolean; tools: string[]; status: string };
type View = { servers: Server[]; swarm: string | null; channels: Channel[]; channel: Channel | null; messages: Msg[]; members: Member[]; yao: { connected: boolean; label: string }; claw: { connected: boolean; label: string } };

const PLATFORMS = [['none', 'No platform'], ['facebook', 'Facebook'], ['instagram', 'Instagram'], ['threads', 'Threads'], ['whatsapp', 'WhatsApp'], ['messenger', 'Messenger']] as const;
const acr = (n: string) => n.replace(/Forge$/, '').slice(0, 2).toUpperCase();
const tone = (j: string) => j === 'pending' ? 'amber' : j === 'approved' ? 'green' : j === 'rejected' ? 'red' : 'neutral';
async function post(body: unknown) {
  const r = await fetch('/api/hub', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json(); if (!r.ok) throw new Error(j.issues?.join('; ') || j.error || 'Request failed'); return j;
}

export function AgentHub() {
  const [v, setV] = useState<View | null>(null); const [err, setErr] = useState(''); const [note, setNote] = useState('');
  const [swarm, setSwarm] = useState(''); const [channel, setChannel] = useState('');
  const [text, setText] = useState(''); const [platform, setPlatform] = useState('none');
  const [dlg, setDlg] = useState<'' | 'channel' | 'agent'>(''); const [pick, setPick] = useState<Member | null>(null); const [task, setTask] = useState(''); const [busy, setBusy] = useState('');
  const feed = useRef<HTMLOListElement>(null);
  const load = useCallback(() => {
    const q = new URLSearchParams(); if (swarm) q.set('swarm', swarm); if (channel) q.set('channel', channel);
    fetch(`/api/hub?${q}`).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setV(j); setErr(''); }).catch((e) => setErr(String(e.message ?? e)));
  }, [swarm, channel]);
  useEffect(load, [load]);
  useEffect(() => { feed.current?.scrollTo({ top: feed.current.scrollHeight }); }, [v?.messages.length]);

  async function send(e: FormEvent) {
    e.preventDefault(); if (!v?.swarm || !v.channel || !text.trim()) return; setBusy('post');
    try { const j = await post({ action: 'post', input: { swarm: v.swarm, channel: v.channel.id, platform, body: text } }); setText(''); setNote(`Saved as draft ${j.id}, waiting in Jev (${j.jevRunId}). Nothing was posted.`); load(); } catch (x) { setErr((x as Error).message); } finally { setBusy(''); }
  }
  async function runAgent(target: 'yao' | 'claw-local') {
    if (!pick) return; setBusy(target);
    try { const r = await fetch('/api/b3/swarms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cardId: pick.id, task, target }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error);
      setNote(j.status === 'pending_jev' ? `${pick.name} draft ${j.id} saved; Llama Guard ${j.guard.verdict}; waiting in Jev.` : `Llama Guard flagged the draft (${j.guard.verdict}); saved, not sent to Jev.`); setPick(null); setTask(''); load();
    } catch (x) { setErr((x as Error).message); } finally { setBusy(''); }
  }

  const groups = v ? [...new Set(v.channels.map((c) => c.group))] : [];
  return <div className="mb-hub mb-v3" data-testid="agent-hub">
    <nav className="mb-hub-rail" aria-label="Swarms">
      {v?.servers.map((s) => <button key={s.name} type="button" className="mb-hub-server" aria-current={v.swarm === s.name ? 'true' : undefined} aria-label={`${s.name}: ${s.agents} agents, ${s.pending} waiting in Jev`} title={s.name} onClick={() => { setSwarm(s.name); setChannel(''); }}>
        {acr(s.name)}{s.pending > 0 && <span className="mb-hub-badge" aria-hidden="true">{s.pending}</span>}
      </button>)}
    </nav>
    <aside className="mb-hub-side" aria-label="Channels">
      <header className="mb-hub-side-head"><strong>{v?.swarm ?? 'Loading…'}</strong><span className="mb-muted">{v ? `${v.servers.find((s) => s.name === v.swarm)?.agents ?? 0} agent cards` : ''}</span></header>
      {groups.map((g) => <div key={g}><p className="mb-hub-group">{g}</p><ul>
        {v!.channels.filter((c) => c.group === g).map((c) => <li key={c.id}><button type="button" className="mb-hub-chan" aria-current={v!.channel?.id === c.id ? 'true' : undefined} onClick={() => setChannel(c.id)}>
          {c.id === 'approvals' ? <ShieldCheck size={16} aria-hidden /> : c.id === 'runs' ? <Activity size={16} aria-hidden /> : <Hash size={16} aria-hidden />}<span>{c.name}</span></button></li>)}
      </ul></div>)}
      <div className="mb-hub-actions">
        <button type="button" onClick={() => setDlg('channel')} data-testid="hub-create-channel"><Plus size={16} aria-hidden /> Create channel</button>
        <button type="button" onClick={() => setDlg('agent')} data-testid="hub-build-agent"><Bot size={16} aria-hidden /> Build agent</button>
      </div>
      <p className="mb-muted mb-hub-status">Yao: {v?.yao.label ?? '…'}<br />Local swarm: {v?.claw.label ?? '…'}</p>
    </aside>
    <main className="mb-hub-chat" aria-label={v?.channel ? `#${v.channel.name}` : 'Channel'}>
      <header className="mb-hub-chat-head"><Hash size={18} aria-hidden /><h1>{v?.channel?.name ?? '…'}</h1><span className="mb-muted">{v?.channel?.topic}</span></header>
      {err && <p className="mb-bad" role="alert">{err}</p>}
      {note && <p role="status" className="mb-hub-note">{note}</p>}
      <ol className="mb-hub-feed" ref={feed} aria-label="Messages" data-testid="hub-feed">
        {v && v.messages.length === 0 && <li className="mb-muted mb-hub-empty">No records yet. Run an agent from the member list, or write a draft below.</li>}
        {v?.messages.map((m) => <li key={m.id} className="mb-hub-msg" data-testid="hub-msg">
          <span className="mb-hub-avatar" aria-hidden="true">{m.kind === 'agent_draft' ? <Bot size={18} /> : acr(m.author)}</span>
          <div><p className="mb-hub-meta"><strong>{m.author}</strong> <span className="mb-hub-chip">{m.source}</span>{m.platform && m.platform !== 'none' && <span className={`mb-hub-chip mb-hub-plat-${m.platform}`}>{m.platform}</span>} <time dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleString()}</time></p>
            <p className="mb-hub-text">{m.text}</p>
            <p className="mb-hub-meta"><span className="mb-kpi-icon" data-tone={tone(m.jev)}>Jev: {m.jev}</span>{m.guard && <span className="mb-hub-chip">Llama Guard: {m.guard}</span>}{m.jevRunId && <a href="/workspace/brain/runtime">Review in Jev</a>}</p></div>
        </li>)}
      </ol>
      <form className="mb-hub-composer" onSubmit={send} aria-label="Write a draft">
        <label className="sr-only" htmlFor="hub-platform">Platform</label>
        <select id="hub-platform" value={platform} onChange={(e) => setPlatform(e.target.value)}>{PLATFORMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <label className="sr-only" htmlFor="hub-text">Draft</label>
        <textarea id="hub-text" data-testid="hub-text" rows={2} maxLength={3000} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Draft in #${v?.channel?.name ?? ''} — saved as a draft for Jev review, never posted directly`} />
        <button type="submit" disabled={!text.trim() || busy === 'post'} data-testid="hub-send" aria-label="Save draft for Jev review"><Send size={16} aria-hidden /> Draft</button>
      </form>
    </main>
    <aside className="mb-hub-members" aria-label="Agent cards">
      <p className="mb-hub-group"><Users size={14} aria-hidden /> Agents — {v?.members.length ?? 0}</p>
      <ul>{v?.members.slice(0, 120).map((m) => <li key={m.id}><button type="button" className="mb-hub-member" onClick={() => setPick(m)} aria-label={`${m.name}, ${m.tier}, ${m.risk} risk, ${m.status}`}>
        <span className="mb-hub-dot" data-tone={m.status === 'awaiting review' ? 'amber' : m.status === 'has drafts' ? 'green' : 'neutral'} aria-hidden />
        <span><strong>{m.name}</strong><small>{m.tier} · {m.risk} risk{m.jev ? ' · Jev' : ''} · {m.status}</small></span></button></li>)}</ul>
    </aside>
    {dlg && v?.swarm && <HubDialog kind={dlg} swarm={v.swarm} subclusters={v.channels.filter((c) => c.subcluster && c.subcluster !== 'Swarm lead').map((c) => c.subcluster!)} tools={[...new Set(v.members.flatMap((m) => m.tools))]} onClose={() => setDlg('')} onDone={(msg, ch) => { setDlg(''); setNote(msg); if (ch) setChannel(ch); load(); }} />}
    {pick && <div className="mb-hub-modal" role="dialog" aria-modal="true" aria-labelledby="hub-pick-h"><div className="mb-panel">
      <header className="mb-panel-head"><h2 id="hub-pick-h">{pick.name}</h2><button type="button" aria-label="Close" onClick={() => setPick(null)}><X size={18} /></button></header>
      <p className="mb-muted">{pick.role} · {pick.tier} · {pick.risk} risk · {pick.status}</p>
      <p>Tools: {pick.tools.join(', ') || 'none'}</p>
      <label>Task<textarea rows={3} maxLength={2000} value={task} onChange={(e) => setTask(e.target.value)} /></label>
      <div className="mb-hub-actions"><button type="button" disabled={!!busy || task.trim().length < 3 || !v?.yao.connected} onClick={() => runAgent('yao')}>{busy === 'yao' ? 'Running on Yao…' : 'Run on Yao'}</button>
        <button type="button" disabled={!!busy || task.trim().length < 3 || !v?.claw.connected} onClick={() => runAgent('claw-local')}>{busy === 'claw-local' ? 'Running locally…' : 'Run on local swarm'}</button></div>
      <p className="mb-muted">The result becomes a Brain draft, goes through Llama Guard and waits in Jev. Nothing is sent.</p>
    </div></div>}
  </div>;
}

function HubDialog({ kind, swarm, subclusters, tools, onClose, onDone }: { kind: 'channel' | 'agent'; swarm: string; subclusters: string[]; tools: string[]; onClose: () => void; onDone: (m: string, ch?: string) => void }) {
  const [f, setF] = useState({ name: '', topic: '', role: '', responsibility: '', subcluster: subclusters[0] ?? '', risk: 'low', tools: [] as string[] }); const [err, setErr] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr('');
    try {
      if (kind === 'channel') { const j = await post({ action: 'createChannel', input: { swarm, name: f.name, topic: f.topic } }); onDone(`Channel #${j.name} created.`, j.id); }
      else { const j = await post({ action: 'buildAgent', input: { swarm, subcluster: f.subcluster || null, name: f.name, role: f.role, responsibility: f.responsibility, tools: f.tools, risk: f.risk } }); onDone(`Agent card ${j.id} saved as a definition${j.jev_required ? ' (Jev required)' : ''}.`); }
    } catch (x) { setErr((x as Error).message); }
  }
  return <div className="mb-hub-modal" role="dialog" aria-modal="true" aria-labelledby="hub-dlg-h"><form className="mb-panel" onSubmit={submit}>
    <header className="mb-panel-head"><h2 id="hub-dlg-h">{kind === 'channel' ? `Create channel in ${swarm}` : `Build agent in ${swarm}`}</h2><button type="button" aria-label="Close" onClick={onClose}><X size={18} /></button></header>
    <label>Name<input required minLength={2} maxLength={kind === 'channel' ? 40 : 80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="hub-dlg-name" /></label>
    {kind === 'channel' ? <label>Topic<input maxLength={200} value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} /></label> : <>
      <label>Role<input required minLength={2} maxLength={80} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} data-testid="hub-dlg-role" /></label>
      <label>Responsibility<textarea required minLength={10} maxLength={600} rows={3} value={f.responsibility} onChange={(e) => setF({ ...f, responsibility: e.target.value })} data-testid="hub-dlg-resp" /></label>
      <label>Sub-cluster<select value={f.subcluster} onChange={(e) => setF({ ...f, subcluster: e.target.value })}>{subclusters.map((s) => <option key={s}>{s}</option>)}</select></label>
      <label>Risk<select value={f.risk} onChange={(e) => setF({ ...f, risk: e.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High (Jev required)</option></select></label>
      <fieldset><legend>Tools (from this swarm)</legend>{tools.map((t) => <label key={t} className="mb-hub-tool"><input type="checkbox" checked={f.tools.includes(t)} onChange={(e) => setF({ ...f, tools: e.target.checked ? [...f.tools, t] : f.tools.filter((x) => x !== t) })} />{t}</label>)}</fieldset>
      <p className="mb-muted">Any dispatch, connector or planned tool makes this agent require Jev. The card is a definition; it does not run on its own.</p></>}
    {err && <p className="mb-bad" role="alert">{err}</p>}
    <div className="mb-hub-actions"><button type="submit" data-testid="hub-dlg-save">Save</button><button type="button" onClick={onClose}>Cancel</button></div>
  </form></div>;
}
