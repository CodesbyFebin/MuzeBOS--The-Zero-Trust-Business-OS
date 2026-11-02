'use client';
import { useEffect, useState } from 'react';
type Post = { id: string; channel: string; body: string; scheduledFor: string; status: string; jevRunId: string };
type Ch = { channel: string; status: string };
export function SocialQueue() {
  const [posts, setPosts] = useState<Post[] | null>(null); const [chs, setChs] = useState<Ch[]>([]); const [err, setErr] = useState('');
  const [channel, setChannel] = useState('linkedin'); const [when, setWhen] = useState(''); const [body, setBody] = useState('');
  const load = () => fetch('/api/b3/social').then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setPosts(j.posts); setChs(j.channels); }).catch((e) => setErr(String(e.message ?? e)));
  useEffect(() => { load(); }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    const r = await fetch('/api/b3/social', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ posts: [{ channel, body, scheduledFor: new Date(when).toISOString() }] }) });
    const j = await r.json(); if (!r.ok) setErr(j.error ?? 'Could not queue'); else { setBody(''); load(); }
  };
  return (<section className="mb-v3" aria-labelledby="sq-h">
    <h1 id="sq-h" className="mb-heading">Social post queue</h1>
    <p className="mb-muted">Each post goes to Jev on its own. Nothing is published from this page.</p>
    <form onSubmit={submit} className="mb-panel" aria-label="Queue a post" style={{ display: 'grid', gap: 8, padding: 12 }}>
      <label>Channel <select value={channel} onChange={(e) => setChannel(e.target.value)} style={{ minHeight: 44 }}>{['linkedin', 'bluesky', 'x', 'webhook'].map((c) => <option key={c}>{c}</option>)}</select></label>
      <label>Scheduled for <input type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} style={{ minHeight: 44 }} /></label>
      <label>Post <textarea required maxLength={3000} value={body} onChange={(e) => setBody(e.target.value)} rows={4} /></label>
      <button type="submit" style={{ minHeight: 44 }}>Send to Jev for approval</button>
    </form>
    {err && <p role="alert">{err}</p>}
    <h2 className="mb-panel-head">Channels</h2>
    <ul data-testid="social-channels">{chs.map((c) => <li key={c.channel}><strong>{c.channel}</strong>: {c.status}</li>)}</ul>
    <h2 className="mb-panel-head">Queued posts</h2>
    {posts === null ? <p>Loading…</p> : posts.length === 0 ? <p data-testid="social-empty">No records yet</p> :
      <ul data-testid="social-posts">{posts.map((p) => <li key={p.id}>{p.scheduledFor.slice(0, 16)} · {p.channel} · <span data-status={p.status}>{p.status.replace('_', ' ')}</span> — {p.body.slice(0, 120)} <a href={`/brain?run=${p.jevRunId}`}>Open in Jev</a></li>)}</ul>}
  </section>);
}
