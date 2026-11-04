'use client';
/**
 * Community server view. Layout patterns adapted from issam-seghir/discord-clone (MIT; see THIRD_PARTY.md): server rail,
 * channel sections by type, chat header, "Welcome to #channel" start, grouped message items with role badges and
 * author/staff edit-delete rules. Data is MuZe's own (/api/community, SSE /api/community/stream). Text only; no HTML injection.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Channel, Message, Server, Thread } from '@/lib/metabos/community/store';
type Snap = { servers: Server[]; channels: Channel[]; threads: (Thread & { replies: number })[]; messages: Message[]; rev: number; me: { id: string; name: string; role: string } };
const call = async (action: string, input: unknown) => { const r = await fetch('/api/community', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, input }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`); return j; };
const SECTIONS = [['text', 'Text channels'], ['forum', 'Forums'], ['announcement', 'Announcements']] as const;
const BADGE: Record<string, string> = { admin: 'Admin', moderator: 'Moderator', guest: 'Member', agent: 'Agent', system: 'Jev' };
const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

export function CommunityServer() {
  const [snap, setSnap] = useState<Snap | null>(null); const [err, setErr] = useState<string | null>(null); const [note, setNote] = useState<string | null>(null);
  const [serverId, setServerId] = useState<string>(''); const [channelId, setChannelId] = useState<string>(''); const [threadId, setThreadId] = useState<string>('');
  const [text, setText] = useState(''); const [live, setLive] = useState(false); const [editing, setEditing] = useState<string | null>(null); const [meta, setMeta] = useState<string | null>(null);
  const load = useCallback(async () => {
    const q = new URLSearchParams(); if (channelId) q.set('channelId', channelId); if (threadId) q.set('threadId', threadId);
    const r = await fetch(`/api/community?${q}`, { cache: 'no-store' }); const j = await r.json(); if (!r.ok) { setErr(r.status === 401 ? 'Sign in to see community channels.' : j.error ?? `HTTP ${r.status}`); return; }
    setErr(null); setSnap(j);
  }, [channelId, threadId]);
  useEffect(() => { void load(); const es = new EventSource('/api/community/stream'); es.addEventListener('rev', () => { setLive(true); void load(); }); es.onerror = () => setLive(false); return () => es.close(); }, [load]);
  const server = snap?.servers.find((x) => x.id === serverId) ?? snap?.servers[0];
  const channels = useMemo(() => (snap?.channels ?? []).filter((c) => c.serverId === server?.id), [snap, server]);
  const channel = channels.find((c) => c.id === channelId);
  useEffect(() => { if (server && server.id !== serverId) setServerId(server.id); }, [server, serverId]);
  useEffect(() => { if (!channel && channels[0]) { setChannelId(channels[0].id); setThreadId(''); } }, [channel, channels]);
  const staff = snap?.me.role === 'admin' || snap?.me.role === 'moderator';
  const run = async (f: () => Promise<unknown>, ok?: string) => { try { await f(); if (ok) setNote(ok); await load(); } catch (e) { setNote(e instanceof Error ? e.message : 'Failed'); } };
  const ask = (label: string) => window.prompt(label)?.trim();
  if (err) return <p className="mb-muted" role="status" data-testid="cs-error">{err}</p>;
  if (!snap) return <p className="mb-muted">Loading community…</p>;
  const thread = snap.threads.find((t) => t.id === threadId);
  const send = () => { const body = text.trim(); if (!body || !channel) return; setText(''); void run(() => call('post', { channelId: channel.id, threadId: threadId || null, body })); };
  return (
    <div className="mb-cs" data-testid="community-server">
      <nav className="mb-cs-servers" aria-label="Servers">
        <ul>{snap.servers.map((sv) => <li key={sv.id}><button type="button" className="mb-cs-sv" aria-label={sv.name} title={sv.name} aria-current={sv.id === server?.id ? 'true' : undefined} onClick={() => { setServerId(sv.id); setChannelId(''); setThreadId(''); }}>{initials(sv.name)}</button></li>)}</ul>
        {staff && <button type="button" className="mb-cs-sv mb-cs-add" aria-label="Create server" title="Create server" onClick={() => { const n = ask('Server name'); if (n) void run(async () => { const r = await call('createServer', { name: n }); await load(); setServerId(r.server.id); }, `Server ${n} created`); }}>+</button>}
      </nav>
      {!server ? <section className="mb-cs-empty" data-testid="cs-empty"><h3>No servers yet</h3><p className="mb-muted">{staff ? 'Create the first server with the + button. Channels, threads and messages are stored on this MuZe server.' : 'An owner or manager has not created a server yet.'}</p></section> : <>
      <nav className="mb-cs-side" aria-label={`${server.name} channels`}>
        <h3 className="mb-cs-svname">{server.name}</h3>
        {SECTIONS.map(([k, label]) => { const list = channels.filter((c) => c.kind === k); return <div key={k}>
          <div className="mb-cs-sechead"><span>{label}</span>{staff && <button type="button" aria-label={`Create ${label.toLowerCase().replace(/s$/, '')}`} onClick={() => { const n = ask('Channel name (a-z, 0-9, dashes)'); if (n) void run(async () => { const r = await call('createChannel', { serverId: server.id, name: n, kind: k }); await load(); setChannelId(r.channel.id); setThreadId(''); }); }}>+</button>}</div>
          {list.length === 0 ? <p className="mb-muted mb-cs-none">None</p> : <ul>{list.map((c) => <li key={c.id}><button type="button" className="mb-cs-ch" aria-current={c.id === channel?.id ? 'true' : undefined} onClick={() => { setChannelId(c.id); setThreadId(''); }}># {c.name}</button></li>)}</ul>}
        </div>; })}
        <p className="mb-muted mb-cs-live" role="status">{live ? 'Live updates on.' : 'Connecting…'}</p>
      </nav>
      <section className="mb-cs-chat" aria-label={channel ? `#${channel.name}` : 'Channel'}>
        {!channel ? <div className="mb-cs-empty"><h3>No channels in {server.name}</h3><p className="mb-muted">{staff ? 'Add one with + next to a section.' : 'No channels yet.'}</p></div> : <>
          <header className="mb-cs-head"><h3># {channel.name}{thread && <> › {thread.title}</>}</h3>{thread && <button type="button" onClick={() => setThreadId('')}>Back to #{channel.name}</button>}
            {!thread && <button type="button" onClick={() => { const t = ask('Thread title'); const b = t && ask('First message'); if (t && b) void run(async () => { const r = await call('createThread', { channelId: channel.id, title: t, body: b }); setThreadId(r.thread.id); }); }}>New thread</button>}</header>
          {!thread && snap.threads.length > 0 && <ul className="mb-cs-threads" aria-label="Threads">{snap.threads.map((t) => <li key={t.id}><button type="button" onClick={() => setThreadId(t.id)}>🧵 {t.title} · {t.replies} {t.replies === 1 ? 'message' : 'messages'}</button></li>)}</ul>}
          <ol className="mb-cs-msgs" aria-live="polite">
            {snap.messages.length === 0 && <li className="mb-cs-welcome"><div className="mb-cs-hash" aria-hidden="true">#</div><p><b>Welcome to #{thread ? thread.title : channel.name}</b></p><p className="mb-muted">{channel.kind === 'forum' && !thread ? 'Forum channels hold threads. Start one with New thread.' : `This is the start of #${thread ? thread.title : channel.name}.`}</p></li>}
            {snap.messages.map((m) => { const mine = m.authorKind === 'member' && m.authorId === snap.me.id; return <li key={m.id} className={`mb-cs-msg mb-cs-${m.authorKind}`} data-testid="cs-msg">
              <div className="mb-cs-avatar" aria-hidden="true">{initials(m.author)}</div>
              <div className="mb-cs-body"><p className="mb-cs-meta"><b>{m.author}</b> <span className="mb-cs-badge">{BADGE[m.role] ?? m.role}</span> <time>{new Date(m.createdAt).toLocaleString()}</time>{m.editedAt && <span className="mb-muted"> (edited)</span>}</p>
                {editing === m.id ? <form onSubmit={(e) => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get('b') ?? ''); setEditing(null); void run(() => call('edit', { id: m.id, body: v })); }}><label className="mb-sr-only" htmlFor={`e-${m.id}`}>Edit message</label><input id={`e-${m.id}`} name="b" defaultValue={m.body} /><button type="submit">Save</button><button type="button" onClick={() => setEditing(null)}>Cancel</button></form>
                  : <p className={m.deleted ? 'mb-muted' : undefined}>{m.body}</p>}
                {m.dispatchId && <p className="mb-cs-disp">Dispatch <code>{m.dispatchId.slice(0, 8)}</code> — review in Sanctum</p>}
                {!m.deleted && m.authorKind !== 'system' && <div className="mb-cs-acts">
                  {mine && <button type="button" onClick={() => setEditing(m.id)}>Edit</button>}
                  {(mine || staff) && <button type="button" onClick={() => void run(() => call('delete', { id: m.id }))}>Delete</button>}
                  {!m.dispatchId && <button type="button" onClick={() => setMeta(meta === m.id ? null : m.id)}>Send to Meta…</button>}
                </div>}
                {meta === m.id && <form className="mb-cs-meta-form" aria-label="Propose a Meta send" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); setMeta(null); void run(() => call('proposeMeta', { messageId: m.id, channel: f.get('c'), to: String(f.get('to') ?? '') }), 'Proposed. Two different reviewers must sign in Sanctum; dispatch runs in dry-run mode unless test mode is turned off.'); }}>
                  <label>Channel <select name="c" defaultValue="whatsapp"><option value="whatsapp">WhatsApp</option><option value="instagram">Instagram</option><option value="messenger">Messenger</option></select></label>
                  <label>To <input name="to" required placeholder="+15551234567 or user id" /></label><button type="submit">Propose to Jev</button></form>}
              </div></li>; })}
          </ol>
          <form className="mb-cs-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <label className="mb-sr-only" htmlFor="cs-input">Message {thread ? thread.title : `#${channel.name}`}</label>
            <input id="cs-input" value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} placeholder={channel.kind === 'forum' && !thread ? 'Open a thread to post in a forum' : `Message ${thread ? thread.title : `#${channel.name}`}`} disabled={channel.kind === 'forum' && !thread} />
            <button type="submit" disabled={!text.trim()}>Send</button>
          </form>
          {note && <p className="mb-muted" role="status" data-testid="cs-note">{note}</p>}
        </>}
      </section></>}
    </div>
  );
}
