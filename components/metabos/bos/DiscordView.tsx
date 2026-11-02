'use client';
/** Discord-style view: Information, Governance and Swarm channel groups. Messages render as text (no HTML injection). */
import { useState } from 'react';
type Msg = { id: string; author: string; text: string; at: string; embed: { title: string; fields: string[][] } };
export type DiscordData = { groups: { name: string; channels: { id: string; name: string; messages: Msg[] }[] }[] };
export function DiscordView({ data }: { data: DiscordData }) {
  const all = data.groups.flatMap((g) => g.channels); const [id, setId] = useState(all[0]?.id ?? ''); const ch = all.find((c) => c.id === id) ?? all[0];
  return <div data-testid="bos-discord" className="mb-bos-dc">
    <nav aria-label="Channels">{data.groups.map((g) => <div key={g.name}><p className="mb-bos-railhead">{g.name}</p>{g.channels.length === 0 ? <p className="mb-muted">None yet</p> : <ul>{g.channels.map((c) => <li key={c.id}><button type="button" aria-current={c.id === ch?.id ? 'true' : undefined} onClick={() => setId(c.id)}># {c.name}</button></li>)}</ul>}</div>)}</nav>
    <section aria-label={ch ? `#${ch.name}` : 'Channel'} tabIndex={0}>{!ch ? <p className="mb-muted">No channels.</p> : <><h3># {ch.name}</h3>{ch.messages.length === 0 ? <p className="mb-muted">No messages in #{ch.name} yet.</p> :
      <ol className="mb-bos-msgs">{ch.messages.map((m) => <li key={m.id}><b>{m.author}</b> <time>{m.at ? new Date(m.at).toLocaleString() : ''}</time><p>{m.text}</p>
        <div className="mb-bos-embed"><strong>{m.embed.title}</strong>{m.embed.fields.map(([k, v]) => <span key={k}>{k}: <code>{v}</code></span>)}</div></li>)}</ol>}</>}</section>
  </div>;
}
