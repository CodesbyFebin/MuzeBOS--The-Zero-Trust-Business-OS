'use client';
import { useEffect, useRef, useState } from 'react';
import type { FloorActor } from '@/lib/metabos/arena/floor-layout';
import type { ArenaScene } from './arena-scene';
export function Arena3DFloor({ actors, selected, onSelect, onFallback }: { actors: FloorActor[]; selected: string | null; onSelect: (id: string) => void; onFallback: () => void }) {
  const host = useRef<HTMLDivElement>(null), scene = useRef<ArenaScene | null>(null);
  const latest = useRef({ actors, selected, onSelect }); latest.current = { actors, selected, onSelect };
  const [error, setError] = useState(''), [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void import('./arena-scene').then(({ createArenaScene }) => {
      if (cancelled || !host.current) return;
      scene.current = createArenaScene(host.current, id => latest.current.onSelect(id), () => {
        scene.current?.dispose(); scene.current = null;
        if (!cancelled) { setReady(false); setError('3D graphics unavailable. Use the 2D office or the recorded task list.'); }
      });
      scene.current.update(latest.current.actors, latest.current.selected); setReady(true);
    }).catch(() => { if (!cancelled) setError('3D graphics unavailable. Use the 2D office or the recorded task list.'); });
    return () => { cancelled = true; scene.current?.dispose(); scene.current = null; };
  }, []);
  useEffect(() => { scene.current?.update(actors, selected); }, [actors, selected]);
  return <>
    <div className="mb-arena-toolbar" aria-label="3D camera controls">
      <button disabled={!ready} onClick={() => scene.current?.reset()}>Reset camera</button>
      <button disabled={!ready} onClick={() => scene.current?.zoom(.8)}>Zoom in</button>
      <button disabled={!ready} onClick={() => scene.current?.zoom(1.25)}>Zoom out</button>
    </div>
    <div ref={host} className="mb-arena-3d" data-testid="arena-floor" data-renderer="three" role="img" aria-label="3D office of recorded task assignments. Select a task in the list below for equivalent details." />
    {error ? <p role="status">{error} <button onClick={onFallback}>Use 2D office</button></p> : !ready ? <p role="status">Loading 3D office…</p> : null}
    <p className="mb-muted">Drag to orbit, scroll or pinch to zoom. Click a robot to inspect its task. Up to four assignments per station; no task means no robot. Reduced motion is respected.</p>
  </>;
}
