'use client';
/** MeTa Server — one Discord-style shell over MeTaBos. Business servers list every registry page as a
 *  channel (links/embeds the real page), swarm servers embed the Agent Hub, and #commits is the
 *  "git for agents" log over Jev, drafts, dispatches and the evidence chain. Ideas from the owner's
 *  prototypes; rebuilt with no copied code, CDN assets or mock data. */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { GitCommit, Hash, Megaphone, Plug, Menu, PanelLeft, ExternalLink, X } from 'lucide-react';
import { businessServers, type ServerChannel } from '@/lib/metabos/server/servers';
import { AgentHub } from '@/components/metabos/hub/AgentHub';
import { coatById, isCoatId } from '@/lib/metabos/fur-sim/presets';
import { MuseAvatar, type CoatId } from '@/components/metabos/muse/MuseAvatar';

type Commit = { sha: string; id: string; kind: string; server: string; author: string; title: string; diff: string[]; status: string; jevRunId: string | null; dispatchId: string | null; dispatch: string; createdAt: string; evidence: { seq: number; action: string; hash: string }[] };
type Conn = { id: string; label: string; adapter: boolean; status: string };
type Data = { commits: Commit[]; meta: Conn[]; suiteSetupEnv: string[]; swarms: { name: string; agents: number; pending: number }[] };
const SERVERS = businessServers();
const tone = (s: string) => s === 'pending' ? 'amber' : s === 'approved' || s === 'executed' || s === 'sent' ? 'green' : s === 'rejected' || s === 'failed' ? 'red' : 'neutral';
const acr = (n: string) => n.replace(/Forge$/, '').slice(0, 2).toUpperCase();
const SUITE = [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['messenger', 'Messenger'], ['whatsapp', 'WhatsApp'], ['threads', 'Threads'], ['meta-ai', 'Meta AI']] as const;
const SPECIAL: Record<string, { id: string; label: string }[]> = { marketing: [{ id: 'ads-manager', label: 'ads-manager' }, { id: 'meta', label: 'meta-connections' }], support: [{ id: 'meta', label: 'meta-connections' }] };

export function MetaServer() {
  const [d, setD] = useState<Data | null>(null); const [err, setErr] = useState(''); const [note, setNote] = useState('');
  const [server, setServer] = useState('hq'); const [chan, setChan] = useState('commits'); const [preview, setPreview] = useState(false);
  const [rail, setRail] = useState(false); const [side, setSide] = useState(false); const [coat, setCoat] = useState<CoatId>('ember');
  const [mode, setMode] = useState<'personal' | 'business'>('business'); const [sText, setSText] = useState('');
  const [ad, setAd] = useState({ name: '', objective: 'awareness', budget: '', audience: '', creative: '' }); const [busy, setBusy] = useState(false);
  const load = useCallback(() => { fetch('/api/server').then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); setErr(''); }).catch((e) => setErr(String(e.message ?? e))); }, []);
  useEffect(load, [load]);
  useEffect(() => { const m = localStorage.getItem('metaserver.mode'); if (m === 'personal' || m === 'business') setMode(m); }, []);
  useEffect(() => { const c = localStorage.getItem('muse.coat'); if (c === 'ember' || c === 'graphite' || c === 'violet') setCoat(c); else if (isCoatId(c)) setCoat(coatById(c).legacy2d); }, []);
  const biz = SERVERS.find((s) => s.id === server); const suite = server === 'suite'; const swarm = server.startsWith('swarm:') ? server.slice(6) : null;
  const page: ServerChannel | undefined = useMemo(() => biz?.categories.flatMap((c) => c.channels).find((c) => c.id === chan), [biz, chan]);
  const commits = (d?.commits ?? []).filter((c) => server === 'hq' || c.server === server);
  const pendingFor = (id: string) => (d?.commits ?? []).filter((c) => c.status === 'pending' && (id === 'hq' || c.server === id)).length;
  function pick(id: string) { setServer(id); setChan('commits'); setPreview(false); setRail(false); }
  function open(id: string) { setChan(id); setPreview(false); setSide(false); }
  function setM(m: 'personal' | 'business') { setMode(m); localStorage.setItem('metaserver.mode', m); if (m === 'personal' && chan === 'ads-manager') setChan('commits'); }
  async function saveSuite(e: FormEvent) {
    e.preventDefault(); setBusy(true); setNote('');
    try { const r = await fetch('/api/server', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'suiteDraft', input: { product: chan.slice(6), mode, body: sText } }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.issues?.join('; ') || j.error); setNote(`Draft ${j.id} saved and waiting in Jev (${j.jevRunId}). Nothing was sent.`); setSText(''); load();
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  }
  async function saveAd(e: FormEvent) {
    e.preventDefault(); setBusy(true); setNote('');
    try { const r = await fetch('/api/server', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'adDraft', input: { name: ad.name, objective: ad.objective, dailyBudgetMinor: Math.round(Number(ad.budget) * 100), audience: ad.audience, creative: ad.creative } }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.issues?.join('; ') || j.error); setNote(`Ad draft ${j.id} saved and waiting in Jev (${j.jevRunId}). Nothing was created on Meta.`); setAd({ name: '', objective: 'awareness', budget: '', audience: '', creative: '' }); load();
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  }

  return <div className="mb-srv mb-v3" data-testid="meta-server" data-rail={rail ? 'open' : undefined} data-side={side ? 'open' : undefined}>
    <div className="mb-srv-mobile">
      <button type="button" aria-expanded={rail} aria-controls="mb-srv-rail" onClick={() => { setRail(!rail); setSide(false); }}><Menu size={18} aria-hidden /> Servers</button>
      {!swarm && <button type="button" aria-expanded={side} aria-controls="mb-srv-side" onClick={() => { setSide(!side); setRail(false); }}><PanelLeft size={18} aria-hidden /> Channels</button>}
    </div>
    <nav id="mb-srv-rail" className="mb-srv-rail" aria-label="Servers">
      {SERVERS.map((s) => <button key={s.id} type="button" className="mb-srv-icon" aria-current={server === s.id ? 'true' : undefined} aria-label={`${s.name}${pendingFor(s.id) ? `, ${pendingFor(s.id)} waiting in Jev` : ''}`} title={s.name} onClick={() => pick(s.id)}>{s.short}{pendingFor(s.id) > 0 && <span className="mb-hub-badge" aria-hidden="true">{pendingFor(s.id)}</span>}</button>)}
      <button type="button" className="mb-srv-icon" aria-current={server === 'suite' ? 'true' : undefined} aria-label={`Meta Suite${pendingFor('suite') ? `, ${pendingFor('suite')} waiting in Jev` : ''}`} title="Meta Suite" onClick={() => { pick('suite'); setChan('suite:facebook'); }}>MS{pendingFor('suite') > 0 && <span className="mb-hub-badge" aria-hidden="true">{pendingFor('suite')}</span>}</button>
      <hr aria-hidden="true" />
      {d?.swarms.map((s) => <button key={s.name} type="button" className="mb-srv-icon is-swarm" aria-current={swarm === s.name ? 'true' : undefined} aria-label={`${s.name} swarm: ${s.agents} agents, ${s.pending} waiting in Jev`} title={s.name} onClick={() => pick(`swarm:${s.name}`)}>{acr(s.name)}{s.pending > 0 && <span className="mb-hub-badge" aria-hidden="true">{s.pending}</span>}</button>)}
      <p className="mb-srv-note"><a href="/workspace/brain/arena">Open Arena</a></p>
    </nav>
    {swarm ? <div className="mb-srv-swarm"><AgentHub swarm={swarm} embedded /></div> : <>
    <aside id="mb-srv-side" className="mb-srv-side" aria-label="Channels">
      <header className="mb-hub-side-head"><strong>{suite ? 'Meta Suite' : biz?.name}</strong><span className="mb-muted">{suite ? 'Facebook, Instagram, Messenger, WhatsApp, Threads, Meta AI' : biz?.topic}</span></header>
      <div className="mb-srv-mode" role="group" aria-label="Mode">{(['personal', 'business'] as const).map((m) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => setM(m)}>{m === 'personal' ? 'Personal' : 'Business'}</button>)}</div>
      <ul>
        <li><button type="button" className="mb-hub-chan" aria-current={chan === 'commits' ? 'true' : undefined} onClick={() => open('commits')}><GitCommit size={16} aria-hidden /><span>commits</span></button></li>
        {suite && <><p className="mb-hub-group">Products</p>{SUITE.map(([id, label]) => <li key={id}><button type="button" className="mb-hub-chan" aria-current={chan === `suite:${id}` ? 'true' : undefined} onClick={() => open(`suite:${id}`)}><Hash size={16} aria-hidden /><span>{label}</span></button></li>)}</>}
        {(SPECIAL[server] ?? []).filter((c) => mode === 'business' || c.id !== 'ads-manager').map((c) => <li key={c.id}><button type="button" className="mb-hub-chan" aria-current={chan === c.id ? 'true' : undefined} onClick={() => open(c.id)}>{c.id === 'meta' ? <Plug size={16} aria-hidden /> : <Megaphone size={16} aria-hidden />}<span>{c.label}</span></button></li>)}
      </ul>
      {biz?.categories.map((c) => <div key={c.id}><p className="mb-hub-group">{c.label}</p><ul>
        {c.channels.map((ch) => <li key={ch.id}><button type="button" className="mb-hub-chan" aria-current={chan === ch.id ? 'true' : undefined} onClick={() => open(ch.id)} data-route={ch.route}><Hash size={16} aria-hidden /><span>{ch.label}</span></button></li>)}
      </ul></div>)}
    </aside>
    <section className="mb-hub-chat" aria-label="Channel">
      {err && <p className="mb-bad" role="alert">{err}</p>}{note && <p className="mb-hub-note" role="status">{note}</p>}
      {chan === 'commits' && <><header className="mb-hub-chat-head"><GitCommit size={18} aria-hidden /><h1>commits</h1><span className="mb-muted">Every agent draft and action: author, diff, Jev approval, evidence hash, dispatch state.</span></header>
        {!d ? <p className="mb-muted mb-hub-empty">Loading…</p> : commits.length === 0 ? <p className="mb-muted mb-hub-empty" style={{ padding: 16 }}>No records yet</p> :
        <ol className="mb-hub-feed" data-testid="commit-log">{commits.map((c) => <li key={`${c.kind}-${c.id}`} className="mb-srv-commit">
          <p className="mb-hub-meta"><code className="mb-srv-sha">{c.sha}</code><strong>{c.title}</strong><span className="mb-hub-chip">{c.kind}</span><span className="mb-hub-chip"><span className="mb-hub-dot" data-tone={tone(c.status)} aria-hidden /> {c.status}</span></p>
          <p className="mb-hub-meta">by {c.author} · {new Date(c.createdAt).toLocaleString()}{c.jevRunId && <> · Jev <a className="mb-srv-link" href="/workspace/brain/runtime">{c.jevRunId.slice(0, 8)}</a></>}</p>
          <pre className="mb-srv-diff" aria-label={`Diff for ${c.sha}`}>{c.diff.join('\n')}</pre>
          <p className="mb-hub-meta">{c.dispatch}</p>
          <p className="mb-hub-meta">{c.evidence.length ? c.evidence.map((e) => <a key={e.seq} href="/workspace/evidence" className="mb-hub-chip mb-srv-link">#{e.seq} {e.action} {e.hash}</a>) : 'No evidence rows reference this yet'}</p>
        </li>)}</ol>}</>}
      {chan.startsWith('suite:') && (() => { const id = chan.slice(6); const label = SUITE.find((x) => x[0] === id)?.[1] ?? id; const st = d?.meta.find((m) => m.id === id)?.status ?? 'Not connected'; return <>
        <header className="mb-hub-chat-head"><Hash size={18} aria-hidden /><h1>{label}</h1><span className="mb-hub-chip">{mode}</span><span className="mb-muted">{st}</span></header>
        <form className="mb-srv-form" onSubmit={saveSuite} aria-label={`${label} draft`}>
          <label>{mode === 'business' ? `${label} business draft` : `${label} personal draft`}<textarea required rows={4} maxLength={3000} value={sText} onChange={(e) => setSText(e.target.value)} /></label>
          <button type="submit" disabled={busy}>Save draft for Jev</button>
          <p className="mb-muted">Saved as a draft plus one Jev item. Nothing is sent; sends go through /api/dispatch after approval, and only where an adapter exists.</p>
          {mode === 'business' && <p className="mb-muted">Business mode: ad drafts live in Marketing &amp; Ads → #ads-manager; the dashboard is #commits on HQ.</p>}
          <p className="mb-muted">Setup notes (no adapter reads these yet): {d?.suiteSetupEnv.join(', ')}. No OAuth or auto-setup runs here.</p>
        </form></>; })()}
      {chan === 'meta' && <><header className="mb-hub-chat-head"><Plug size={18} aria-hidden /><h1>meta-connections</h1><span className="mb-muted">Status from the adapters that exist. No OAuth or auto-setup here.</span></header>
        <ul className="mb-hub-feed">{d?.meta.map((m) => <li key={m.id} className="mb-srv-commit"><p className="mb-hub-meta"><strong>{m.label}</strong><span className="mb-hub-chip">{m.adapter ? 'adapter exists' : 'no adapter'}</span></p><p className="mb-hub-text">{m.status}</p></li>)}</ul></>}
      {chan === 'ads-manager' && mode === 'business' && <><header className="mb-hub-chat-head"><Megaphone size={18} aria-hidden /><h1>ads-manager</h1><span className="mb-muted">{d?.meta.find((m) => m.id === 'ads')?.status ?? 'Not connected'}</span></header>
        <form className="mb-srv-form" onSubmit={saveAd} aria-label="Ad draft">
          <label>Campaign name<input required maxLength={120} value={ad.name} onChange={(e) => setAd({ ...ad, name: e.target.value })} /></label>
          <label>Objective<select value={ad.objective} onChange={(e) => setAd({ ...ad, objective: e.target.value })}>{['awareness', 'traffic', 'engagement', 'leads', 'sales'].map((o) => <option key={o}>{o}</option>)}</select></label>
          <label>Daily budget (₹)<input required inputMode="decimal" pattern="\d+(\.\d{1,2})?" value={ad.budget} onChange={(e) => setAd({ ...ad, budget: e.target.value })} /></label>
          <label>Audience<textarea required rows={2} maxLength={500} value={ad.audience} onChange={(e) => setAd({ ...ad, audience: e.target.value })} /></label>
          <label>Creative text<textarea required rows={3} maxLength={2000} value={ad.creative} onChange={(e) => setAd({ ...ad, creative: e.target.value })} /></label>
          <button type="submit" disabled={busy}>Save draft for Jev</button>
          <p className="mb-muted">Saved as a draft and one Jev item. Nothing is created on Meta; there is no Marketing API adapter yet.</p>
        </form></>}
      {page && <><header className="mb-hub-chat-head"><Hash size={18} aria-hidden /><h1>{page.label}</h1><span className="mb-hub-chip">{page.status}</span></header>
        <div className="mb-srv-page"><p className="mb-hub-text">{page.summary}</p>
          <p className="mb-srv-row"><a className="mb-srv-btn" href={page.route}><ExternalLink size={16} aria-hidden /> Open page</a>
          <button type="button" onClick={() => setPreview(!preview)} aria-pressed={preview}>{preview ? <><X size={16} aria-hidden /> Close preview</> : 'Preview here'}</button><code className="mb-muted">{page.route}</code></p>
          {preview && <iframe className="mb-srv-frame" src={page.route} title={`${page.label} preview`} />}</div></>}
    </section></>}
    {!swarm && <aside className="mb-hub-members" aria-label="Assistant">
      <p className="mb-hub-group">Assistant</p>
      <a className="mb-srv-muse" href="/workspace/brain/voice" aria-label="Open MUSE voice assistant"><MuseAvatar state="idle" coat={coat} size={72} /><span><strong>MUSE</strong><small>Voice and memory</small></span></a>
      <p className="mb-hub-group">Jev</p>
      <a className="mb-srv-muse" href="/workspace/brain/runtime"><span><strong>{pendingFor('hq')} waiting</strong><small>Review in Jev</small></span></a>
    </aside>}
  </div>;
}
