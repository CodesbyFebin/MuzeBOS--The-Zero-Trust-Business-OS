'use client';
/**
 * Board: Homarr-style tiles over real service checks (idea only; no Homarr code).
 * Polls /api/board/status; layout (order, size, hidden) is saved to SQLite via PUT /api/board.
 * Panels ported from the owner's pre-existing "METABOS × MuZe" HTML: Jev queue, receipts and the
 * contribution ledger, here backed by real records (Jev runs, dispatches, evidence rows) instead of fixed figures.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { emitRoam } from '@/lib/metabos/muse/roam';
type Def = { id: string; group: string; name: string; checks: string };
type Tile = { id: string; size: 'sm' | 'md' | 'lg'; hidden: boolean };
type Status = { id: string; status: 'ok' | 'down' | 'not configured' | 'dry run'; latencyMs: number | null; detail: string; metrics: { label: string; value: number | string }[]; checkedAt: string };
const POLL_MS = 10_000;
export function Board() {
  const [defs, setDefs] = useState<Def[]>([]); const [tiles, setTiles] = useState<Tile[]>([]); const [st, setSt] = useState<Record<string, Status>>({});
  const [edit, setEdit] = useState(false); const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null); const [at, setAt] = useState<string | null>(null);
  const drag = useRef<string | null>(null);
  const loadBoard = useCallback(async () => { try { const r = await fetch('/api/board', { cache: 'no-store' }); const j = await r.json(); if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`); setDefs(j.defs); setTiles(j.board.tiles); } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } }, []);
  const poll = useCallback(async () => { try { const r = await fetch('/api/board/status', { cache: 'no-store' }); const j = await r.json(); if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`); setSt(Object.fromEntries((j.tiles as Status[]).map((t) => [t.id, t]))); setAt(j.at); setErr(null); } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } }, []);
  useEffect(() => { loadBoard(); poll(); const t = setInterval(poll, POLL_MS); return () => clearInterval(t); }, [loadBoard, poll]);
  const move = (id: string, to: number) => setTiles((ts) => { const i = ts.findIndex((t) => t.id === id); if (i < 0 || to < 0 || to >= ts.length) return ts; const n = [...ts]; const [x] = n.splice(i, 1); n.splice(to, 0, x); return n; });
  const patch = (id: string, p: Partial<Tile>) => setTiles((ts) => ts.map((t) => t.id === id ? { ...t, ...p } : t));
  const save = async () => { setMsg(null); const r = await fetch('/api/board', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tiles }) }); const j = await r.json(); if (!r.ok) { setMsg(`Not saved: ${j.error ?? r.status}`); return; } setTiles(j.board.tiles); setEdit(false); setMsg('Layout saved.'); };
  const name = (id: string) => defs.find((d) => d.id === id)?.name ?? id;
  const shown = edit ? tiles : tiles.filter((t) => !t.hidden);
  return <div data-testid="bos-board"><h2>Board</h2>
    <p className="mb-muted">Each tile runs a real check on this server. Refreshes every {POLL_MS / 1000}s; checks are cached briefly. {at && <>Last check <time>{new Date(at).toLocaleTimeString()}</time>.</>}</p>
    <div className="mb-board-bar">{edit ? <><button type="button" onClick={save}>Save layout</button><button type="button" onClick={() => { setEdit(false); loadBoard(); }}>Cancel</button></> : <button type="button" onClick={() => setEdit(true)}>Edit board</button>}<button type="button" onClick={poll}>Check now</button>{msg && <span role="status">{msg}</span>}</div>
    <Summary st={st} defs={defs} />
    {err && <p role="alert" className="mb-bos-err">Could not load: {err}</p>}
    {tiles.length === 0 && !err && <p className="mb-muted">Loading board…</p>}
    <ul className="mb-board-grid" aria-label="Service tiles">{shown.map((t, i) => { const s = st[t.id]; const d = defs.find((x) => x.id === t.id);
      return <li key={t.id} className={`mb-board-tile is-${t.size}`} data-status={s?.status ?? 'pending'} data-hidden={t.hidden || undefined} data-testid={`tile-${t.id}`} data-guide-id={`tile-${t.id}`} data-guide={`${d?.name ?? t.id}: ${s ? `${s.status}. ${s.detail}` : 'checking.'}`}
        draggable={edit} onDragStart={() => { drag.current = t.id; }} onDragOver={(e) => edit && e.preventDefault()} onDrop={() => { if (drag.current) move(drag.current, tiles.findIndex((x) => x.id === t.id)); drag.current = null; }}>
        <header><button type="button" className="mb-board-name" onClick={() => emitRoam({ kind: 'guide', selector: `[data-guide-id="tile-${t.id}"]` })} aria-label={`Ask MuZe about ${name(t.id)}`}>{name(t.id)}</button><em className="mb-board-pill">{s?.status ?? 'checking'}</em></header>
        <small className="mb-muted">{d?.group}</small>
        <p>{s?.detail ?? '…'}</p>
        {s?.latencyMs != null && <p className="mb-board-lat">{s.latencyMs} ms</p>}
        {s && s.metrics.length > 0 && <dl>{s.metrics.map((m) => <div key={m.label}><dt>{m.label}</dt><dd>{typeof m.value === 'string' && /^\d{4}-\d\d-\d\dT/.test(m.value) ? new Date(m.value).toLocaleString() : m.value}</dd></div>)}</dl>}
        <details><summary>What this checks</summary><p>{d?.checks}</p></details>
        {edit && <div className="mb-board-edit" role="group" aria-label={`Arrange ${name(t.id)}`}>
          <button type="button" onClick={() => move(t.id, i - 1)} disabled={i === 0} aria-label={`Move ${name(t.id)} earlier`}>↑</button>
          <button type="button" onClick={() => move(t.id, i + 1)} disabled={i === shown.length - 1} aria-label={`Move ${name(t.id)} later`}>↓</button>
          <label>Size <select value={t.size} onChange={(e) => patch(t.id, { size: e.target.value as Tile['size'] })}><option value="sm">Small</option><option value="md">Medium</option><option value="lg">Large</option></select></label>
          <button type="button" aria-pressed={t.hidden} onClick={() => patch(t.id, { hidden: !t.hidden })}>{t.hidden ? 'Show' : 'Hide'}</button>
        </div>}
      </li>; })}</ul>
  </div>;
}

/** Honest version of the reference's "28/28 systems wired": counts by real status, plus the model substrate (AI tiles). */
function Summary({ st, defs }: { st: Record<string, Status>; defs: Def[] }) {
  const all = Object.values(st); if (all.length === 0) return null;
  const n = (k: Status['status']) => all.filter((t) => t.status === k).length;
  const models = defs.filter((d) => d.group === 'AI');
  return <section className="mb-board-sum" aria-label="Board summary" data-testid="board-summary">
    <p><strong data-testid="systems-ok">{n('ok')} of {all.length}</strong> checks ok · {n('dry run')} dry run · {n('down')} down · {n('not configured')} not configured</p>
    <p className="mb-board-models">Model substrate: {models.map((d) => <span key={d.id} className="mb-board-pill" data-status={st[d.id]?.status}>{d.name}: {st[d.id]?.status ?? 'checking'}</span>)}</p>
  </section>;
}
