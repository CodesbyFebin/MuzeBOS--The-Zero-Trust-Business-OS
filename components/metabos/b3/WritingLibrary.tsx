'use client';
import { useEffect, useState } from 'react';
type Src = { id: string; url: string; kind: string; posts: number; lastFetchedAt: string | null; lastError: string | null };
type Cit = { title: string; url: string; publishedAt: string | null; passage: string };
export function WritingLibrary() {
  const [srcs, setSrcs] = useState<Src[] | null>(null); const [emb, setEmb] = useState(''); const [url, setUrl] = useState(''); const [q, setQ] = useState('');
  const [cits, setCits] = useState<Cit[] | null>(null); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const load = (query = '') => fetch(`/api/b3/writing${query ? `?q=${encodeURIComponent(query)}` : ''}`).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setSrcs(j.sources); setEmb(j.embeddings.status); if (query) setCits(j.voice.citations); }).catch((e) => setMsg(String(e.message ?? e)));
  useEffect(() => { load(); }, []);
  const post = async (b: object) => { setBusy(true); setMsg(''); const r = await fetch('/api/b3/writing', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); const j = await r.json(); setBusy(false); if (!r.ok) setMsg(j.error ?? 'Failed'); else if (j.fetchError) setMsg(`Saved, but the feed could not be read: ${j.fetchError}`); load(); };
  return (<section className="mb-v3" aria-labelledby="wl-h">
    <h1 id="wl-h" className="mb-heading">Writing library</h1>
    <p className="mb-muted">Your own Substack, Medium or RSS posts, cached here so assistants can quote you. Read-only: nothing is posted back.</p>
    <form className="mb-panel" style={{ display: 'grid', gap: 8, padding: 12 }} aria-label="Add a source" onSubmit={(e) => { e.preventDefault(); post({ action: 'add', url }); setUrl(''); }}>
      <label>Feed or profile URL <input type="url" required placeholder="https://you.substack.com" value={url} onChange={(e) => setUrl(e.target.value)} style={{ minHeight: 44 }} /></label>
      <button type="submit" disabled={busy} style={{ minHeight: 44 }}>{busy ? 'Fetching…' : 'Add source'}</button>
    </form>
    {msg && <p role="alert">{msg}</p>}
    <p data-testid="wl-embeddings" className="mb-muted">Semantic search: {emb || 'Usage unavailable'}</p>
    <h2 className="mb-panel-head">Sources</h2>
    {srcs === null ? <p>Loading…</p> : srcs.length === 0 ? <p data-testid="wl-empty">No records yet</p> :
      <ul data-testid="wl-sources">{srcs.map((s) => <li key={s.id}><a href={s.url} rel="noreferrer noopener" target="_blank">{s.url}</a> · {s.kind} · {s.posts} posts · {s.lastFetchedAt ? `fetched ${s.lastFetchedAt.slice(0, 16).replace('T', ' ')} UTC` : 'not fetched'}{s.lastError ? ` · last error: ${s.lastError}` : ''}
        {' '}<button type="button" style={{ minHeight: 44 }} onClick={() => post({ action: 'refresh', id: s.id })} aria-label={`Refresh ${s.url}`}>Refresh</button>
        {' '}<button type="button" style={{ minHeight: 44 }} onClick={() => post({ action: 'remove', id: s.id })} aria-label={`Remove ${s.url}`}>Remove</button></li>)}</ul>}
    <h2 className="mb-panel-head">In your voice</h2>
    <form aria-label="Find your passages" onSubmit={(e) => { e.preventDefault(); load(q); }} style={{ display: 'flex', gap: 8 }}>
      <label style={{ flex: 1 }}>Topic <input value={q} onChange={(e) => setQ(e.target.value)} required maxLength={200} style={{ minHeight: 44, width: '100%' }} /></label>
      <button type="submit" style={{ minHeight: 44 }}>Search</button>
    </form>
    {cits && (cits.length === 0 ? <p>No records yet</p> : <ol data-testid="wl-citations">{cits.map((c) => <li key={c.url}><blockquote>{c.passage}</blockquote><cite><a href={c.url} rel="noreferrer noopener" target="_blank">{c.title}</a>{c.publishedAt ? `, ${c.publishedAt.slice(0, 10)}` : ''}</cite></li>)}</ol>)}
  </section>);
}
