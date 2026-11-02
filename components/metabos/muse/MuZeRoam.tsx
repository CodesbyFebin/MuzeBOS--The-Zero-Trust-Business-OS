'use client';
/**
 * Free-roaming MuZe: a full-viewport overlay with pointer-events:none; only the MuZe handle takes pointer input, so it never blocks
 * clicks underneath. MuZe flies to a UI element (on view switch or "show me X"), reads that element's own guide text, can dance,
 * be booped or dragged, and can open a pure-black fullscreen mode. Uses the repo's three.js 0.169 fur engine (MuseFurSimulator,
 * compact). prefers-reduced-motion: no flight animation, no dance spin. Idea from the owner's pre-existing Operator Mode HTML.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { MuseFurSimulator, type MuseFurHandle } from './MuseFurSimulator';
import { DEFAULT_COAT, type CoatPresetId } from '@/lib/metabos/fur-sim/presets';
import { ROAM_EVENT, flyTarget, guideTextFor, type RoamEvent } from '@/lib/metabos/muse/roam';
const SIZE = 96;
export function MuZeRoam({ homeSelector }: { homeSelector?: string }) {
  const fur = useRef<MuseFurHandle>(null); const [coat, setCoat] = useState<CoatPresetId>(DEFAULT_COAT);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null); const [guide, setGuide] = useState<string | null>(null);
  const [dancing, setDancing] = useState(false); const [full, setFull] = useState(false); const drag = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);
  const home = useCallback(() => { const el = homeSelector ? document.querySelector(homeSelector) : null;
    if (el) { const r = el.getBoundingClientRect(); setPos(flyTarget({ left: r.left, top: r.top, width: r.width, height: r.height }, innerWidth, innerHeight, SIZE)); }
    else setPos({ x: Math.max(0, innerWidth - SIZE - 24), y: Math.max(0, innerHeight - SIZE - 24) }); setGuide(null); }, [homeSelector]);
  useEffect(() => { home(); }, [home]);
  const toggleFull = useCallback(async () => { const on = !document.body.classList.contains('mb-muze-full'); document.body.classList.toggle('mb-muze-full', on); setFull(on);
    try { if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) await document.documentElement.requestFullscreen(); else if (!on && document.fullscreenElement) await document.exitFullscreen(); } catch { /* browser refused; the black mode still applies */ } }, []);
  useEffect(() => { const onFs = () => { if (!document.fullscreenElement && document.body.classList.contains('mb-muze-full')) { document.body.classList.remove('mb-muze-full'); setFull(false); } }; document.addEventListener('fullscreenchange', onFs); return () => { document.removeEventListener('fullscreenchange', onFs); document.body.classList.remove('mb-muze-full'); }; }, []);
  useEffect(() => { const on = (ev: Event) => { const e = (ev as CustomEvent<RoamEvent>).detail;
      if (e.kind === 'guide') { const el = document.querySelector(e.selector); if (!el) { setGuide('That part of the page is not on screen.'); return; } el.scrollIntoView?.({ block: 'nearest' }); const r = el.getBoundingClientRect(); setPos(flyTarget({ left: r.left, top: r.top, width: r.width, height: r.height }, innerWidth, innerHeight, SIZE)); setGuide(e.text ?? guideTextFor(el)); fur.current?.triggerBoop(); }
      else if (e.kind === 'dance') { setDancing(true); fur.current?.triggerBoop(); setTimeout(() => setDancing(false), 1200); }
      else if (e.kind === 'boop') fur.current?.triggerBoop();
      else if (e.kind === 'home') home();
      else void toggleFull(); };
    window.addEventListener(ROAM_EVENT, on); return () => window.removeEventListener(ROAM_EVENT, on); }, [home, toggleFull]);
  const down = (e: React.PointerEvent) => { if (!pos) return; (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, moved: false }; };
  const move = (e: React.PointerEvent) => { const d = drag.current; if (!d) return; d.moved = true; setPos({ x: Math.max(0, Math.min(innerWidth - SIZE, e.clientX - d.dx)), y: Math.max(0, Math.min(innerHeight - SIZE, e.clientY - d.dy)) }); };
  const up = () => { drag.current = null; };
  return <div className="mb-muze-roam" data-testid="muze-roam">
    {pos && <div className={`mb-muze-roam-handle${dancing ? ' is-dancing' : ''}`} style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }} data-testid="muze-roam-handle" data-x={pos.x} data-y={pos.y}>
      <div className="mb-muze-roam-body" title="Drag to move MuZe" onPointerDown={down} onPointerMove={move} onPointerUp={up}>
        <MuseFurSimulator ref={fur} compact state="idle" coat={coat} onCoatChange={setCoat} size={SIZE} />
      </div>
      <div className="mb-muze-roam-tools">
        <button type="button" onClick={() => fur.current?.triggerBoop()}>Boop</button>
        <button type="button" onClick={() => { setDancing(true); fur.current?.triggerBoop(); setTimeout(() => setDancing(false), 1200); }}>Dance</button>
        <button type="button" aria-pressed={full} onClick={() => void toggleFull()}>{full ? 'Exit fullscreen' : 'Fullscreen'}</button>
        {guide && <button type="button" onClick={home}>Dismiss</button>}
      </div>
      {guide && <p className="mb-muze-roam-guide" role="status" data-testid="muze-roam-guide">{guide}</p>}
    </div>}
  </div>;
}
