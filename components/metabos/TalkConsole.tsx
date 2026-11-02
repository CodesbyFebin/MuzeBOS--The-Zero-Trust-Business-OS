'use client';
import { useCallback, useEffect, useState } from 'react';
import { postTo, useMe, SignedInAs } from '@/components/metabos/bizClient';

type Conv = { id: string; channel: string; address: string; name: string | null; status: string; aiPaused: number; pausedReason: string | null; lastInboundAt: string | null; lastOutboundAt: string | null; sentiment: number };
type Msg = { id: string; direction: 'in' | 'out'; author: string; body: string; kind: string; transcriptStatus: string | null; sentiment: number | null; at: string };
type Handoff = { id: string; conversationId: string; reason: string; status: string; assigneeId: string | null; createdAt: string; briefing: { contact: string; channel: string; trigger: string; sentimentTotal: number; ask: string; lastMessages: { author: string; body: string; at: string }[]; openInvoices: { number: string; total: number }[] } };
type View = { conversations: Conv[]; messages: Msg[]; handoffs: Handoff[]; optOuts: { channel: string; address: string; reason: string; source: string; at: string }[]; followUps: { conversation: Conv; silentHours: number; blocked: string | null }[]; approvers: { memberId: string; phoneEnding: string }[]; connection: { muse_voice: boolean; approval_signing: boolean; instagram: boolean; channels: Record<string, string> } };
export type TalkPanel = 'inbox' | 'handover' | 'contacts' | 'followups' | 'voice';
const post = postTo('/api/talk');
const who = (c: Conv) => c.name ? `${c.name} (${c.address})` : c.address;

/** Talk copilot console. The copilot drafts; every send is a pending dispatch that a Jev approver approves in /workspace/brain/jev or by a signed WhatsApp reply. */
export function TalkConsole({ panel, channel }: { panel: TalkPanel; channel?: 'whatsapp' | 'instagram' }) {
  const me = useMe();
  const [v, setV] = useState<View | null>(null); const [err, setErr] = useState(''); const [note, setNote] = useState('');
  const [sel, setSel] = useState<string>(''); const [text, setText] = useState(''); const [qr, setQr] = useState('');
  const load = useCallback(async () => {
    const r = await fetch(`/api/talk${sel ? `?conversation=${sel}` : ''}`, { cache: 'no-store' }); const j = await r.json();
    if (!r.ok) { setErr(j.error ?? 'Could not load conversations'); return; } setErr(''); setV(j);
  }, [sel]);
  useEffect(() => { void load(); }, [load]);
  const act = async (body: object, ok: string) => { try { const j = await post(body); setNote(j.dispatch ? `${ok}: dispatch ${j.dispatch.id.slice(0, 8)} is waiting for Jev approval.` : ok); setErr(''); await load(); } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } };
  if (err && !v) return <section className="mb-panel"><SignedInAs me={me} /><p className="mb-alert" role="alert">{err}</p></section>;
  if (!v) return <section className="mb-panel"><p className="mb-muted">Loading…</p></section>;
  const convs = v.conversations.filter((c) => !channel || c.channel === channel);
  const cur = v.conversations.find((c) => c.id === sel);
  return <section className="mb-panel mb-talk" aria-label="Talk copilot" data-testid={`talk-${panel}`}>
    <SignedInAs me={me} />
    {err && <p className="mb-alert" role="alert">{err}</p>}{note && <p className="mb-muted" role="status">{note}</p>}
    {panel === 'inbox' && <>
      <h2>Conversations</h2>
      <p className="mb-muted">Filled by signature-verified Meta webhooks. {channel ? v.connection.channels[channel] : ''}</p>
      {convs.length === 0 ? <p className="mb-muted">No records yet</p> :
        <table className="mb-table"><thead><tr><th scope="col">Contact</th><th scope="col">Channel</th><th scope="col">Status</th><th scope="col">Copilot</th><th scope="col">Last inbound</th><th scope="col"><span className="mb-sr">Open</span></th></tr></thead>
          <tbody>{convs.map((c) => <tr key={c.id}><td>{who(c)}</td><td>{c.channel}</td><td>{c.status}</td><td>{c.aiPaused ? `Paused: ${c.pausedReason}` : 'Drafting'}</td><td>{c.lastInboundAt ?? '—'}</td>
            <td><button onClick={() => setSel(c.id)} aria-label={`Open conversation with ${who(c)}`}>Open</button></td></tr>)}</tbody></table>}
      {cur && <div className="mb-talk-thread">
        <h3>{who(cur)}</h3>
        <ol className="mb-help-list" aria-label="Messages">{v.messages.map((m) => <li key={m.id}><strong>{m.author}</strong> · {m.at}{m.kind !== 'text' ? ` · ${m.kind}` : ''}: {m.body || (m.transcriptStatus ?? '')}</li>)}</ol>
        {cur.aiPaused ? <p className="mb-muted">Copilot paused: {cur.pausedReason}. {cur.status !== 'handover' && <button onClick={() => act({ action: 'resume', conversationId: cur.id }, 'Copilot resumed')}>Resume copilot</button>}</p> : null}
        <label className="mb-field">Quick reply shortcut (from Canned Replies)<input value={qr} onChange={(e) => setQr(e.target.value)} placeholder="e.g. thanks" /></label>
        <label className="mb-field">Reply<textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} /></label>
        <div className="mb-actions">
          <button className="mb-primary" onClick={() => act(qr ? { action: 'reply', conversationId: cur.id, quickReply: qr, author: 'human' } : { action: 'reply', conversationId: cur.id, text, author: 'human' }, 'Reply proposed')}>Propose my reply</button>
          <button disabled={!!cur.aiPaused} onClick={() => act(qr ? { action: 'reply', conversationId: cur.id, quickReply: qr, author: 'copilot' } : { action: 'reply', conversationId: cur.id, text, author: 'copilot' }, 'Copilot draft proposed')}>File as copilot draft</button>
          <button onClick={() => act({ action: 'handoff', conversationId: cur.id, reason: 'Manual handover' }, 'Handed to a human')}>Hand to a human</button>
        </div>
        <p className="mb-muted">Sending a reply you wrote pauses the copilot for this conversation (human takeover).</p>
      </div>}
    </>}
    {panel === 'handover' && <>
      <h2>Handoffs</h2>
      <p className="mb-muted">Opened by an escalation keyword (refund, complaint, lawyer…) or a sentiment total of −2 or lower. Sentiment is a lexicon rule, not a model.</p>
      {v.handoffs.length === 0 ? <p className="mb-muted">No records yet</p> : v.handoffs.map((h) => <article key={h.id} className="mb-talk-card" aria-label={`Handoff for ${h.briefing.contact}`}>
        <h3>{h.briefing.contact} · {h.briefing.channel} · {h.status}</h3>
        <p>Trigger: {h.briefing.trigger}. Sentiment total {h.briefing.sentimentTotal}.</p>
        <p>Latest ask: “{h.briefing.ask}”</p>
        {h.briefing.openInvoices.length > 0 && <p>Open invoices: {h.briefing.openInvoices.map((i) => `${i.number} ₹${(i.total / 100).toFixed(2)}`).join(', ')}</p>}
        <ol className="mb-help-list">{h.briefing.lastMessages.map((m, i) => <li key={i}><strong>{m.author}</strong>: {m.body}</li>)}</ol>
        <div className="mb-actions">
          {h.status === 'waiting' && <button onClick={() => act({ action: 'take', handoffId: h.id }, 'Taken')}>Take it</button>}
          {h.status !== 'closed' && <button onClick={() => act({ action: 'close', handoffId: h.id, resolution: 'Resolved by a human', resumeCopilot: true }, 'Closed; copilot resumed')}>Close and resume copilot</button>}
        </div></article>)}
    </>}
    {panel === 'contacts' && <OptOuts v={v} act={act} />}
    {panel === 'followups' && <>
      <h2>Follow-up gate</h2>
      <p className="mb-muted">Conversations where our message is the last one and 4+ hours have passed. Each follow-up is a draft that waits for Jev; outside Meta&apos;s 24-hour window it is blocked (needs a template).</p>
      {v.followUps.length === 0 ? <p className="mb-muted">No records yet</p> :
        <table className="mb-table"><thead><tr><th scope="col">Contact</th><th scope="col">Silent</th><th scope="col">Gate</th><th scope="col"><span className="mb-sr">Action</span></th></tr></thead>
          <tbody>{v.followUps.map((f) => <tr key={f.conversation.id}><td>{who(f.conversation)}</td><td>{f.silentHours}h</td><td>{f.blocked ?? 'Open'}</td>
            <td><button disabled={!!f.blocked} onClick={() => act({ action: 'follow-up', conversationId: f.conversation.id }, 'Follow-up drafted')}>Draft follow-up</button></td></tr>)}</tbody></table>}
    </>}
    {panel === 'voice' && <>
      <h2>Voice notes</h2>
      <p className="mb-muted">Muse Voice: {v.connection.muse_voice ? 'key present; the adapter still reports whether it is qualified' : 'Not connected — add META_MODEL_API_KEY'}.</p>
      <VoiceNotes v={v} act={act} />
    </>}
  </section>;
}

function OptOuts({ v, act }: { v: View; act: (b: object, ok: string) => Promise<void> }) {
  const [channel, setChannel] = useState('whatsapp'); const [address, setAddress] = useState('');
  return <>
    <h2>Opt-out list</h2>
    <p className="mb-muted">Enforced by the server when a send is proposed and again when it is dispatched. Customers who reply STOP are added automatically.</p>
    <div className="mb-actions">
      <label className="mb-field">Channel<select value={channel} onChange={(e) => setChannel(e.target.value)}><option>whatsapp</option><option>instagram</option><option>email</option></select></label>
      <label className="mb-field">Address<input value={address} onChange={(e) => setAddress(e.target.value)} /></label>
      <button className="mb-primary" onClick={() => act({ action: 'opt-out', channel, address, reason: 'Requested by customer' }, 'Opted out')}>Add opt-out</button>
    </div>
    {v.optOuts.length === 0 ? <p className="mb-muted">No records yet</p> :
      <table className="mb-table"><thead><tr><th scope="col">Channel</th><th scope="col">Address</th><th scope="col">Reason</th><th scope="col">Source</th><th scope="col">Since</th></tr></thead>
        <tbody>{v.optOuts.map((o) => <tr key={`${o.channel}:${o.address}`}><td>{o.channel}</td><td>{o.address}</td><td>{o.reason}</td><td>{o.source}</td><td>{o.at}</td></tr>)}</tbody></table>}
  </>;
}
function VoiceNotes({ v, act }: { v: View; act: (b: object, ok: string) => Promise<void> }) {
  const [rows, setRows] = useState<(Msg & { who: string })[] | null>(null);
  useEffect(() => { void (async () => {
    const all: (Msg & { who: string })[] = [];
    for (const c of v.conversations.slice(0, 50)) { const r = await fetch(`/api/talk?conversation=${c.id}`, { cache: 'no-store' }); if (!r.ok) continue; const j = await r.json(); for (const m of j.messages as Msg[]) if (m.kind === 'audio' || m.kind === 'voice') all.push({ ...m, who: who(c) }); }
    setRows(all);
  })(); }, [v.conversations]);
  if (!rows) return <p className="mb-muted">Loading…</p>;
  if (!rows.length) return <p className="mb-muted">No records yet</p>;
  return <table className="mb-table"><thead><tr><th scope="col">From</th><th scope="col">At</th><th scope="col">Transcript</th><th scope="col"><span className="mb-sr">Retry</span></th></tr></thead>
    <tbody>{rows.map((m) => <tr key={m.id}><td>{m.who}</td><td>{m.at}</td><td>{m.transcriptStatus}</td><td><button onClick={() => act({ action: 'transcribe', messageId: m.id }, 'Transcription retried')}>Retry</button></td></tr>)}</tbody></table>;
}
