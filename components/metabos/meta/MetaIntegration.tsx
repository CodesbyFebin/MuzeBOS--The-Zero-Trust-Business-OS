'use client';
/** Meta integration setup, lead pipeline, content calendar, catalogue preview, weekly report and Pixel/CAPI checklist.
 *  Real records or empty states only. Status comes from the server; env values and tokens are never shown.
 *  Layout ideas from the owner's AI Studio references (owner-made); the code is ours. */
import { useCallback, useEffect, useState } from 'react';
type Step = { n: number; title: string; state: string; detail: string };
type Lead = { conversationId: string; channel: string; address: string; name: string | null; lastInboundAt: string | null; stage: string; followUpAt: string | null; note: string | null };
type Data = { buildOrder: Step[]; scopes: { scope: string; use: string; review: boolean }[]; appReview: string; oauthReady: boolean;
  tenants: Record<string, string | null>[]; leads: Lead[];
  calendar: { drafts: { id: string; product: string; body: string; createdAt: string }[]; bestTimes: { day: number; hourUtc: number; posts: number; engagementRate: number }[]; insightsRows: number };
  catalog: { status: string; items: { retailer_id: string; title: string; price: string; availability: string }[] };
  report: { from: string; to: string; evidenceRows: number; chainValid: boolean; jev: { proposed: number; waiting: number; approvedOrDone: number; rejected: number }; inbound: number; dispatchesSent: number; leadStageChanges: number; adDrafts: number; guardBlocks: number };
  pixel: { item: string; ok: boolean; detail: string }[] };
const STAGES = ['new', 'qualified', 'quoted', 'won', 'lost'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TABS = ['setup', 'tenants', 'leads', 'calendar', 'catalog', 'report', 'pixel'] as const;
const LABEL: Record<(typeof TABS)[number], string> = { setup: 'Build order', tenants: 'Brand mapping', leads: 'Lead pipeline', calendar: 'Content calendar', catalog: 'Catalogue', report: 'Weekly report', pixel: 'Pixel / CAPI' };
const tone = (s: string) => s === 'done' ? 'ok' : s === 'partial' ? 'warn' : s === 'blocked' ? 'bad' : 'idle';
const post = async (action: string, input: unknown) => { const r = await fetch('/api/meta', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, input }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error ?? 'Request failed'); return j; };

export function MetaIntegration() {
  const [d, setD] = useState<Data | null>(null); const [err, setErr] = useState(''); const [note, setNote] = useState(''); const [tab, setTab] = useState<(typeof TABS)[number]>('setup');
  const [scopes, setScopes] = useState<string[]>([]); const [replies, setReplies] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  const [map, setMap] = useState<Record<string, Record<string, string>>>({});
  const load = useCallback(() => { fetch('/api/meta').then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); }).catch((e) => setErr(String(e.message ?? e))); }, []);
  useEffect(() => { load(); }, [load]);
  const run = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); setErr(''); try { await fn(); setNote(ok); load(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };
  const empty = (t = 'No records yet') => <p className="mb-muted mb-hub-empty">{t}</p>;
  return <div className="mb-meta" data-testid="meta-integration">
    <header className="mb-av-head"><h1>Meta integration</h1><span className="mb-muted">MuZe is built on Meta&apos;s official APIs. It is not a Meta product and has no relationship with Meta.</span></header>
    <div className="mb-av-tabs" role="tablist" aria-label="Meta integration sections">{TABS.map((t) => <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{LABEL[t]}</button>)}</div>
    {err && <p className="mb-bad" role="alert">{err}</p>}{note && <p className="mb-hub-note" role="status">{note}</p>}
    {!d ? <p className="mb-muted">Loading…</p> : <div role="tabpanel" aria-label={LABEL[tab]}>
      {tab === 'setup' && <>
        <ol className="mb-av-cards" data-testid="meta-build-order">{d.buildOrder.map((s) => <li key={s.n}><span><span className="mb-av-tag" data-tone={tone(s.state)}>{s.state.replace('_', ' ')}</span> <strong>{s.n}. {s.title}</strong></span><span className="mb-muted">{s.detail}</span></li>)}</ol>
        <h2 className="mb-hub-group">Login with Facebook — permissions</h2><p className="mb-muted">{d.appReview}</p>
        <fieldset className="mb-av-form"><legend>Scopes to request</legend>{d.scopes.map((s) => <label key={s.scope} className="mb-av-check"><input type="checkbox" checked={scopes.includes(s.scope)} onChange={(e) => setScopes(e.target.checked ? [...scopes, s.scope] : scopes.filter((x) => x !== s.scope))} /><code>{s.scope}</code> <span className="mb-muted">{s.use}{s.review ? ' · App Review required' : ''}</span></label>)}
          <button type="button" disabled={busy || !d.oauthReady || scopes.length === 0} onClick={() => run(async () => { const r = await post('oauthStart', { scopes }); window.location.assign(r.url); }, 'Opening Meta login…')}>Login with Facebook</button>
          {!d.oauthReady && <p className="mb-muted">Not configured — set META_APP_ID, META_OAUTH_REDIRECT_URI and MUZEBOS_TOKEN_KEY on the server.</p>}</fieldset></>}
      {tab === 'tenants' && (d.tenants.length === 0 ? empty('No workspaces yet. Create one in AgentVerse, then map its Meta asset IDs here.') : <ul className="mb-av-cards">{d.tenants.map((t) => { const id = String(t.workspaceId); const v = { ...Object.fromEntries(['businessId', 'pageId', 'adAccountId', 'pixelId', 'catalogId', 'wabaId'].map((k) => [k, t[k] ?? ''])), ...map[id] };
        return <li key={id}><strong>{t.name}</strong><form className="mb-av-form" aria-label={`Meta IDs for ${t.name}`} onSubmit={(e) => { e.preventDefault(); run(() => post('saveTenant', { workspaceId: id, ...Object.fromEntries(Object.entries(v).map(([k, x]) => [k, String(x).trim() || null])) }), `Saved Meta IDs for ${t.name}`); }}>
          {Object.keys(v).map((k) => <label key={k}>{k}<input inputMode="numeric" value={v[k] as string} onChange={(e) => setMap({ ...map, [id]: { ...v as Record<string, string>, [k]: e.target.value } })} /></label>)}<button type="submit" disabled={busy}>Save mapping</button></form></li>; })}</ul>)}
      {tab === 'leads' && <>
        <p className="mb-muted">Click-to-WhatsApp and DM threads from the real inbox. Replies are proposals: they send only after Jev approval through /api/dispatch.</p>
        {d.leads.length === 0 ? empty() : <div className="mb-meta-board">{STAGES.map((st) => <section key={st} aria-label={`Stage ${st}`}><h2 className="mb-hub-group">{st} ({d.leads.filter((l) => l.stage === st).length})</h2><ul className="mb-av-cards">{d.leads.filter((l) => l.stage === st).map((l) => <li key={l.conversationId}>
          <strong>{l.name ?? l.address}</strong> <span className="mb-av-tag">{l.channel}</span>{l.followUpAt && <span className="mb-muted">Follow-up {new Date(l.followUpAt).toLocaleString()}</span>}
          <label>Stage<select value={l.stage} onChange={(e) => run(() => post('updateLead', { conversationId: l.conversationId, stage: e.target.value, followUpAt: l.followUpAt, note: l.note }), 'Stage saved')}>{STAGES.map((x) => <option key={x}>{x}</option>)}</select></label>
          <label>Follow-up<input type="datetime-local" onChange={(e) => e.target.value && run(() => post('updateLead', { conversationId: l.conversationId, stage: l.stage, followUpAt: new Date(e.target.value).toISOString(), note: l.note }), 'Follow-up reminder queued in Jev')} /></label>
          <label>Reply draft<textarea rows={2} maxLength={4096} value={replies[l.conversationId] ?? ''} onChange={(e) => setReplies({ ...replies, [l.conversationId]: e.target.value })} /></label>
          <button type="button" disabled={busy || !(replies[l.conversationId] ?? '').trim()} onClick={() => run(() => post('leadReply', { conversationId: l.conversationId, body: replies[l.conversationId] }), 'Reply proposed. It sends only after Jev approval through /api/dispatch.')}>Propose reply (Jev)</button></li>)}</ul></section>)}</div>}</>}
      {tab === 'calendar' && <>
        <h2 className="mb-hub-group">Best times to post</h2>
        {d.calendar.bestTimes.length === 0 ? empty(`No Insights yet (${d.calendar.insightsRows} rows). Best-time slots appear only from real Page/Instagram Insights.`) : <ul className="mb-av-cards">{d.calendar.bestTimes.map((b) => <li key={`${b.day}-${b.hourUtc}`}><strong>{DAYS[b.day]} {String(b.hourUtc).padStart(2, '0')}:00 UTC</strong><span className="mb-muted">{b.engagementRate}% engagement over {b.posts} posts</span></li>)}</ul>}
        <h2 className="mb-hub-group">Drafts waiting to be scheduled</h2>
        {d.calendar.drafts.length === 0 ? empty() : <ul className="mb-av-cards">{d.calendar.drafts.map((x) => <li key={x.id}><span className="mb-av-tag">{x.product}</span><p className="mb-hub-text">{x.body}</p></li>)}</ul>}</>}
      {tab === 'catalog' && <><p className="mb-muted">{d.catalog.status}</p>{d.catalog.items.length === 0 ? empty('No products yet. Add products in Business to preview the catalogue feed.') : <table className="mb-av-table"><thead><tr><th scope="col">retailer_id</th><th scope="col">title</th><th scope="col">price</th><th scope="col">availability</th></tr></thead><tbody>{d.catalog.items.map((i) => <tr key={i.retailer_id}><td>{i.retailer_id}</td><td>{i.title}</td><td>{i.price}</td><td>{i.availability}</td></tr>)}</tbody></table>}</>}
      {tab === 'report' && <div data-testid="meta-report"><p className="mb-muted">{new Date(d.report.from).toLocaleDateString()} – {new Date(d.report.to).toLocaleDateString()} · from the evidence chain and Jev · chain {d.report.chainValid ? 'verified' : 'FAILED verification'}</p>
        <table className="mb-av-table"><tbody>{([['Evidence rows', d.report.evidenceRows], ['Jev items proposed', d.report.jev.proposed], ['Waiting in Jev', d.report.jev.waiting], ['Approved or done', d.report.jev.approvedOrDone], ['Rejected', d.report.jev.rejected], ['Inbound messages', d.report.inbound], ['Sent via /api/dispatch', d.report.dispatchesSent], ['Lead stage changes', d.report.leadStageChanges], ['Ad drafts', d.report.adDrafts], ['Guard blocks', d.report.guardBlocks]] as const).map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}</tbody></table></div>}
      {tab === 'pixel' && <ul className="mb-av-cards">{d.pixel.map((p) => <li key={p.item}><span><span className="mb-av-tag" data-tone={p.ok ? 'ok' : 'warn'}>{p.ok ? 'done' : 'not done'}</span> <strong>{p.item}</strong></span><span className="mb-muted">{p.detail}</span></li>)}</ul>}
    </div>}
  </div>;
}
