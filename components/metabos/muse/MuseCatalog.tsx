'use client';
/** MUSE skill + MCP catalog. Read-only listing; entries with writes/external-send risk can only be proposed to Jev
 *  through /api/dispatch (channel "tool-call"). Nothing here runs a skill or starts an MCP server. */
import { useEffect, useState } from 'react';

type Item = { id: string; kind: 'skill' | 'mcp'; name: string; purpose: string; source: string; license: string; status: string; risk: string; env: string[]; fits: string[]; connection: string; needsJev: boolean };
type Resp = { total: number; items: Item[]; counts: Record<string, number>; notes: string[] };

export function MuseCatalog({ limit = 20 }: { limit?: number }) {
  const [q, setQ] = useState(''); const [kind, setKind] = useState(''); const [status, setStatus] = useState('');
  const [d, setD] = useState<Resp | null>(null); const [err, setErr] = useState(''); const [msg, setMsg] = useState<Record<string, string>>({});
  useEffect(() => {
    const p = new URLSearchParams({ limit: String(limit) }); if (q.trim()) p.set('q', q.trim()); if (kind) p.set('kind', kind); if (status) p.set('status', status);
    let dead = false; const t = setTimeout(() => fetch(`/api/muse/catalog?${p}`).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`); if (!dead) { setD(j); setErr(''); } }).catch((e) => { if (!dead) setErr(String(e.message ?? e)); }), 200);
    return () => { dead = true; clearTimeout(t); };
  }, [q, kind, status, limit]);
  async function propose(it: Item) {
    setMsg((m) => ({ ...m, [it.id]: 'Proposing…' }));
    const r = await fetch('/api/dispatch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'propose', channel: 'tool-call', payload: { catalogId: it.id, action: `Use ${it.name}`, input: '' } }) });
    const j = await r.json().catch(() => ({}));
    setMsg((m) => ({ ...m, [it.id]: r.ok ? 'Waiting for Jev approval' : `Not proposed: ${j.error ?? r.status}` }));
  }
  const c = d?.counts ?? {};
  return <div className="mb-muse-catalog" data-testid="muse-catalog">
    {err && <p className="mb-warn" role="status">Unavailable: {err}</p>}
    {d && <p className="mb-muted">{c.skill ?? 0} skills ({c['skill.adoptable'] ?? 0} adoptable) · {c.mcp ?? 0} MCP servers ({c['mcp.adoptable'] ?? 0} adoptable). Nothing runs automatically; writes and sends need Jev.</p>}
    <div className="mb-row">
      <label>Search skills and MCP <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={80} /></label>
      <label>Kind <select value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All</option><option value="skill">Skills</option><option value="mcp">MCP</option></select></label>
      <label>Status <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="adoptable">Adoptable</option><option value="reference">Reference only</option><option value="blocked">Blocked</option></select></label>
    </div>
    {d && <p className="mb-muted">{d.total} matching</p>}
    <ul>{d?.items.map((it) => <li key={it.id} data-testid="catalog-item">
      <a href={it.source} target="_blank" rel="noreferrer noopener">{it.name}</a> <span className="mb-hub-chip">{it.kind}</span> <span className="mb-hub-chip">{it.status}</span> <span className="mb-hub-chip">{it.risk}</span>
      <div className="mb-muted">{it.purpose}</div>
      <div className="mb-muted">Licence: {it.license} · {it.connection}{it.fits.length ? ` · fits ${it.fits.join(', ')}` : ''}</div>
      {it.needsJev && it.status !== 'blocked' && <button type="button" onClick={() => propose(it)}>Propose via Jev</button>} {msg[it.id] && <span role="status">{msg[it.id]}</span>}
    </li>)}</ul>
  </div>;
}
