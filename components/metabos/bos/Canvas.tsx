'use client';
/** Design canvas: infinite pan/zoom surface of frames holding real HTML (Doop-style idea; no Doop code).
 *  Frames update live over SSE as agents write. Frame HTML runs in sandboxed iframes with scripts disabled. */
import { useCallback, useEffect, useRef, useState } from 'react';
type Frame = { id: string; title: string; html: string; x: number; y: number; w: number; h: number; status: 'draft' | 'ready'; rev: number; createdBy: string };
type Comment = { id: string; body: string; author: string; issueId: string | null; createdAt: string };
const post = (u: string, b: unknown, m = 'POST') => fetch(u, { method: m, headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
export function Canvas() {
  const [frames, setFrames] = useState<Frame[]>([]); const [loaded, setLoaded] = useState(false); const [live, setLive] = useState(false); const [model, setModel] = useState<string | null>(null);
  const [view, setView] = useState({ x: 40, y: 40, z: 1 }); const [sel, setSel] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const [title, setTitle] = useState(''); const [draft, setDraft] = useState(''); const [comments, setComments] = useState<Comment[]>([]); const [cbody, setCbody] = useState(''); const [cagent, setCagent] = useState(''); const [agents, setAgents] = useState<string[]>([]); const [brief, setBrief] = useState('');
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const load = useCallback(async () => { const r = await fetch('/api/canvas', { cache: 'no-store' }); const j = await r.json(); if (!r.ok) { setMsg(`Could not load: ${j.error ?? r.status}`); return; } setFrames(j.frames); setModel(j.model); setLoaded(true); }, []);
  useEffect(() => { load(); fetch('/api/board/issues', { cache: 'no-store' }).then((r) => r.ok ? r.json() : null).then((j) => j && setAgents(j.agents)).catch(() => {});
    const es = new EventSource('/api/canvas/stream'); es.addEventListener('frames', (ev) => { setFrames(JSON.parse((ev as MessageEvent).data).frames); setLive(true); setLoaded(true); }); es.onerror = () => setLive(false); return () => es.close(); }, [load]);
  const cur = frames.find((f) => f.id === sel) ?? null;
  const loadComments = useCallback(async (id: string) => { const r = await fetch(`/api/canvas/comments?frameId=${id}`, { cache: 'no-store' }); if (r.ok) setComments((await r.json()).comments); }, []);
  useEffect(() => { if (sel) { loadComments(sel); setDraft(frames.find((f) => f.id === sel)?.html ?? ''); } }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const zoom = (d: number) => setView((v) => ({ ...v, z: Math.min(3, Math.max(0.2, +(v.z * d).toFixed(2))) }));
  const pan = (dx: number, dy: number) => setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  const create = async (e: React.FormEvent) => { e.preventDefault(); const n = frames.length; const r = await post('/api/canvas', { title, x: (n % 3) * 520, y: Math.floor(n / 3) * 420 }); const j = await r.json(); if (!r.ok) { setMsg(`Not created: ${j.error}`); return; } setTitle(''); setSel(j.frame.id); setMsg(`Frame "${j.frame.title}" created.`); load(); };
  const save = async () => { if (!cur) return; const r = await post('/api/canvas', { id: cur.id, html: draft }, 'PATCH'); const j = await r.json(); setMsg(r.ok ? `Saved (rev ${j.frame.rev}).` : `Not saved: ${j.error}`); load(); };
  const ready = async () => { if (!cur) return; const r = await post('/api/canvas/ready', { id: cur.id }); const j = await r.json(); setMsg(r.ok ? 'Marked ready. A Jev approval is waiting for a reviewer.' : `Not marked: ${j.error}`); load(); };
  const comment = async (e: React.FormEvent) => { e.preventDefault(); if (!cur) return; const r = await post('/api/canvas/comments', { frameId: cur.id, body: cbody, ...(cagent ? { agent: cagent } : {}) }); const j = await r.json(); if (!r.ok) { setMsg(`Comment not saved: ${j.error}`); return; } setCbody(''); setMsg(j.comment.issueId ? `Comment saved and opened as an Issue for ${cagent}.` : 'Comment saved.'); loadComments(cur.id); };
  const generate = async (e: React.FormEvent) => { e.preventDefault(); if (!cur) return; setMsg('Writing with the configured model…'); const r = await post('/api/canvas/generate', { id: cur.id, brief }); const j = await r.json(); setMsg(r.ok ? `Model ${j.model} wrote ${j.bytes} bytes.` : `Not generated: ${j.error}`); };
  const png = async () => { if (!cur) return; try {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cur.w}" height="${cur.h}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">${new XMLSerializer().serializeToString(new DOMParser().parseFromString(cur.html, 'text/html').body)}</div></foreignObject></svg>`;
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); await img.decode();
    const c = document.createElement('canvas'); c.width = cur.w; c.height = cur.h; const g = c.getContext('2d')!; g.fillStyle = '#0A0A0A'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0);
    const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = `frame-${cur.id.slice(0, 8)}.png`; a.click(); setMsg('PNG exported (browser render).'); } catch { setMsg('PNG export failed in this browser; use HTML export or the screenshot_frame MCP tool.'); } };
  return <div data-testid="bos-canvas" className="mb-canvas-wrap"><h2>Design canvas</h2>
    <p className="mb-muted">Frames hold real HTML. Agents write to them through the canvas MCP tools and you see it arrive live. <span data-testid="canvas-live">{live ? 'Live updates on.' : 'Live updates connecting…'}</span></p>
    <form className="mb-issues-form" onSubmit={create}><label>New frame<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required /></label><button type="submit">Add frame</button></form>
    <div className="mb-canvas-tools" role="group" aria-label="Canvas view"><button type="button" onClick={() => zoom(1.2)} aria-label="Zoom in">+</button><button type="button" onClick={() => zoom(1 / 1.2)} aria-label="Zoom out">−</button>
      <button type="button" onClick={() => pan(80, 0)} aria-label="Pan left">←</button><button type="button" onClick={() => pan(-80, 0)} aria-label="Pan right">→</button><button type="button" onClick={() => pan(0, 80)} aria-label="Pan up">↑</button><button type="button" onClick={() => pan(0, -80)} aria-label="Pan down">↓</button>
      <button type="button" onClick={() => setView({ x: 40, y: 40, z: 1 })}>Reset</button><span className="mb-muted" data-testid="canvas-zoom">{Math.round(view.z * 100)}%</span></div>
    {msg && <p role="status" data-testid="canvas-msg">{msg}</p>}
    <div className="mb-canvas" data-testid="canvas-surface" aria-label="Canvas surface. Drag to pan, scroll to zoom, or use the buttons above."
      onWheel={(e) => zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1)} onPointerDown={(e) => { if ((e.target as HTMLElement).closest('.mb-frame')) return; drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => { const d = drag.current; if (d) setView((v) => ({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y })); }} onPointerUp={() => { drag.current = null; }}>
      <div className="mb-canvas-plane" style={{ transform: `translate(${view.x}px,${view.y}px) scale(${view.z})` }}>
        {frames.map((f) => <section key={f.id} className={`mb-frame${sel === f.id ? ' is-sel' : ''}`} style={{ left: f.x, top: f.y, width: f.w }} data-testid="canvas-frame">
          <button type="button" className="mb-frame-head" onClick={() => setSel(f.id)} aria-pressed={sel === f.id}>{f.title} · rev {f.rev} · {f.status === 'ready' ? 'Ready' : 'Draft'}</button>
          {f.html.trim() ? <iframe title={`Frame ${f.title}`} sandbox="" srcDoc={f.html} style={{ width: f.w, height: f.h }} /> : <div className="mb-frame-empty" style={{ height: f.h }}>Empty frame. Write HTML here or let an agent write it.</div>}
        </section>)}
      </div>
      {loaded && frames.length === 0 && <p className="mb-canvas-empty" data-testid="canvas-empty">No frames yet. Add one above, or let an agent call canvas.create_frame.</p>}
    </div>
    {cur && <div className="mb-canvas-side" data-testid="canvas-side"><h3>{cur.title}</h3>
      <label>HTML<textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={8} /></label>
      <div className="mb-canvas-tools"><button type="button" onClick={save}>Save HTML</button><button type="button" onClick={ready} data-testid="canvas-ready">Mark ready</button>
        <a href={`/api/canvas/export?id=${cur.id}`} data-testid="canvas-export-html">Export HTML</a><button type="button" onClick={png}>Export PNG</button></div>
      {model ? <form className="mb-issues-form" onSubmit={generate}><label>Ask the model to write this frame<input value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={2000} required /></label><button type="submit">Write</button></form>
        : <p className="mb-muted" data-testid="canvas-no-model">No model is configured, so MuZe will not write frames. Agents can still write through the canvas MCP tools.</p>}
      <h4>Comments</h4>{comments.length === 0 ? <p className="mb-muted">No comments yet.</p> : <ul className="mb-issues">{comments.map((c) => <li key={c.id}>{c.body} <span className="mb-muted">— {c.author}{c.issueId ? ' · opened as an Issue' : ''}</span></li>)}</ul>}
      <form className="mb-issues-form" onSubmit={comment}><label>Comment<input value={cbody} onChange={(e) => setCbody(e.target.value)} maxLength={2000} required /></label>
        <label>Open as an Issue for<select value={cagent} onChange={(e) => setCagent(e.target.value)}><option value="">No issue</option>{agents.map((a) => <option key={a}>{a}</option>)}</select></label><button type="submit">Comment</button></form>
    </div>}
  </div>;
}
