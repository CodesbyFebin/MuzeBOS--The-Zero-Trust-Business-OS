'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Star, FilePlus2 } from 'lucide-react';
import { ROLE_LABELS, type BrainRole, type FounderTemplate } from '@/lib/metabos/brain-templates';
import type { BrainDraft } from '@/lib/metabos/store';

type State = { templates: FounderTemplate[]; roles: BrainRole[]; role: BrainRole; favorites: string[]; drafts: BrainDraft[] };

export function BrainTemplatesWorkspace() {
  const [data, setData] = useState<State | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/brain-templates', { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Templates unavailable');
      setData(d); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Templates unavailable'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function send(body: unknown, done: string) {
    setBusy(true); setMessage('');
    try {
      const r = await fetch('/api/business', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Action failed');
      setMessage(done); await load();
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Action failed'); }
    finally { setBusy(false); }
  }
  if (error && !data) return <div className="mb-console mb-category"><h1>Founder templates</h1><p className="mb-alert" role="alert">{error}</p><button className="mb-button" onClick={() => void load()}>Retry</button></div>;
  if (!data) return <div className="mb-console mb-category"><h1>Founder templates</h1><p className="mb-muted">Loading templates…</p></div>;
  const fav = new Set(data.favorites);
  const favorites = data.favorites.map((id) => data.templates.find((t) => t.id === id)).filter((t): t is FounderTemplate => !!t);
  const recommended = data.templates.filter((t) => t.roles.includes(data.role));
  const others = data.templates.filter((t) => !t.roles.includes(data.role));
  const card = (t: FounderTemplate, where: string) => <article className="mb-panel mb-template" key={`${where}-${t.id}`} data-template={t.id}>
    <div className="mb-panel-head"><h3>{t.name}</h3><button className="mb-button mb-fav" aria-pressed={fav.has(t.id)} aria-label={`Favorite ${t.name}`} disabled={busy} onClick={() => void send({ action: 'favoriteTemplate', data: { id: t.id, favorite: !fav.has(t.id) } }, fav.has(t.id) ? `${t.name} removed from favorites.` : `${t.name} added to favorites.`)}><Star size={14} aria-hidden/>{fav.has(t.id) ? 'Favorited' : 'Favorite'}</button></div>
    <p className="mb-muted">{t.summary}</p>
    <small>{t.roles.map((r) => ROLE_LABELS[r]).join(' · ')} · Source: {t.source}</small>
    <div className="mb-actions"><button className="mb-primary" disabled={busy} aria-label={`Use template: ${t.name}`} onClick={() => void send({ action: 'useTemplate', data: { id: t.id } }, `Draft created from ${t.name}. Nothing was sent or run.`)}><FilePlus2 size={14} aria-hidden/> Use template</button>{t.referenceId && <Link className="mb-link" href="/workspace/brain/employees">Reference text</Link>}</div>
  </article>;
  return <div className="mb-console mb-category">
    <span className="mb-eyebrow">BRAIN / FOUNDER TEMPLATES</span><h1>Founder templates</h1>
    <p className="mb-muted">{data.templates.length} templates. Using one creates a local draft for you to edit. No agent runs, nothing is sent or scheduled.</p>
    <label className="mb-role">Your role<select aria-label="Your role" value={data.role} disabled={busy} onChange={(e) => void send({ action: 'setRole', role: e.target.value }, `Role set to ${ROLE_LABELS[e.target.value as BrainRole]}.`)}>{data.roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></label>
    <p role="status">{message}</p>
    {error && <p className="mb-alert" role="alert">{error}</p>}
    <section aria-label="Favorites"><h2>Favorites <small>{favorites.length}</small></h2>{favorites.length ? <div className="mb-template-grid">{favorites.map((t) => card(t, 'fav'))}</div> : <p className="mb-empty">Mark templates as favorites to keep them here.</p>}</section>
    <section aria-label="Recommended"><h2>Recommended for {ROLE_LABELS[data.role]} <small>{recommended.length}</small></h2><div className="mb-template-grid">{recommended.map((t) => card(t, 'rec'))}</div></section>
    {others.length > 0 && <section aria-label="Other templates"><h2>Other templates <small>{others.length}</small></h2><div className="mb-template-grid">{others.map((t) => card(t, 'all'))}</div></section>}
    <section className="mb-panel" aria-label="Drafts"><h2>Drafts <small>{data.drafts.length}</small></h2>{!data.drafts.length ? <p className="mb-empty">No drafts yet.</p> : data.drafts.map((d) => <details className="mb-draft" key={d.id}><summary><strong>{d.title}</strong> <span className="mb-badge">{d.status.toUpperCase()}</span> <small>{new Date(d.createdAt).toLocaleString()} · {ROLE_LABELS[d.role]}</small></summary><pre>{d.body}</pre></details>)}</section>
  </div>;
}
