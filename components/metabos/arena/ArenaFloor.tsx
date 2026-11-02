'use client';
import { useEffect, useRef, useState } from 'react';
import { STATIONS } from '@/lib/metabos/arena/snapshot';
export type FloorActor = { id: string; agent: string; title: string; state: string; station: string; leased: boolean; parentId: string | null };
/** Original procedural artwork. No upstream tilesets, cast sprites, or terminal processes. */
export function ArenaFloor({ actors, taskIds }: { actors: FloorActor[]; taskIds: string[] }) {
  const host = useRef<HTMLDivElement>(null), latest = useRef({ actors, taskIds }); latest.current = { actors, taskIds };
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false; let cleanup: (() => void) | undefined;
    void (async () => {
      const { Application, Graphics, Container, Text } = await import('pixi.js');
      const app = new Application();
      await app.init({ width: 960, height: 490, backgroundAlpha: 0, preference: 'webgl', antialias: true });
      if (cancelled || !host.current) { app.destroy(true, { children: true }); return; }
      host.current.append(app.canvas); app.canvas.setAttribute('aria-hidden', 'true');
      const style = getComputedStyle(host.current), color = (key: string) => style.getPropertyValue(key).trim();
      const palette = { panel: color('--mb-panel'), text: color('--mb-text'), line: color('--mb-line'), accent: color('--mb-accent'), muted: color('--mb-muted'), good: color('--mb-success'), warn: color('--mb-amber') };
      const reduced = matchMedia('(prefers-reduced-motion: reduce)');
      const label = (text: string, x: number, y: number, size = 12) => { const t = new Text({ text, style: { fill: palette.text, fontSize: size, fontFamily: 'monospace' } }); t.position.set(x, y); app.stage.addChild(t); };
      for (const s of STATIONS) {
        app.stage.addChild(new Graphics().roundRect(s.x - 132, s.y - 70, 264, 155, 8).fill(palette.panel).stroke({ color: palette.line, width: 1 }));
        label(s.label, s.x - 115, s.y - 48); label(s.id === 'jev' ? 'Human approval boundary' : 'Recorded task state', s.x - 115, s.y - 27, 10);
      }
      label('Completed parent drafts → delegation evidence', 560, 465, 10);
      const sprites = new Map<string, { node: InstanceType<typeof Container>; body: InstanceType<typeof Graphics>; tint: string; x: number; y: number }>();
      const paint = (body: InstanceType<typeof Graphics>, tint: string) => body.clear().rect(-8, -20, 16, 14).fill(palette.panel).stroke({ color: tint, width: 2 }).rect(-11, -4, 22, 14).fill(tint).rect(-7, 12, 5, 6).fill(tint).rect(2, 12, 5, 6).fill(tint);
      const envelopes: { node: InstanceType<typeof Graphics>; from: { x: number; y: number }; to: { x: number; y: number }; age: number }[] = [];
      let seen: Set<string> | null = null;
      app.ticker.add(ticker => {
        const dt = Math.min(ticker.deltaMS / 1000, .1), data = latest.current;
        const slots: Record<string, number> = {}; const visible = data.actors.filter(a => (slots[a.station] = (slots[a.station] ?? 0) + 1) <= 4);
        const ids = new Set(visible.map(a => a.id));
        for (const [id, s] of sprites) if (!ids.has(id)) { s.node.destroy({ children: true }); sprites.delete(id); }
        const index: Record<string, number> = {};
        for (const a of visible) {
          const station = STATIONS.find(s => s.id === a.station)!; const n = index[a.station] ?? 0; index[a.station] = n + 1;
          const target = { x: station.x - 83 + n * 53, y: station.y + 27 };
          let sprite = sprites.get(a.id); const tint = a.station === 'jev' ? palette.warn : a.leased ? palette.good : palette.accent;
          if (!sprite) {
            const node = new Container(), body = new Graphics(); paint(body, tint); node.addChild(body);
            const text = new Text({ text: a.agent.slice(0, 8), style: { fill: palette.text, fontSize: 8, fontFamily: 'monospace' } }); text.anchor.set(.5, 0); text.y = 23; node.addChild(text); app.stage.addChild(node);
            sprite = { node, body, tint, ...target }; sprites.set(a.id, sprite);
            if (seen && !seen.has(a.id) && a.parentId && data.taskIds.includes(a.parentId) && !reduced.matches) {
              const envelope = new Graphics().rect(-8, -5, 16, 10).fill(palette.warn).stroke({ color: palette.panel, width: 1 }); app.stage.addChild(envelope); envelopes.push({ node: envelope, from: { x: 745, y: 450 }, to: target, age: 0 });
            }
          }
          if (sprite.tint !== tint) { paint(sprite.body, tint); sprite.tint = tint; }
          const rate = reduced.matches ? 1 : Math.min(1, dt * 5); sprite.x += (target.x - sprite.x) * rate; sprite.y += (target.y - sprite.y) * rate;
          sprite.node.position.set(sprite.x, sprite.y); sprite.node.alpha = a.leased && !reduced.matches ? .85 + Math.sin(performance.now() / 400) * .15 : 1;
        }
        seen = new Set(data.taskIds);
        for (let i = envelopes.length - 1; i >= 0; i--) { const e = envelopes[i]; e.age += dt; const t = Math.min(1, e.age / 1.5); e.node.position.set(e.from.x + (e.to.x - e.from.x) * t, e.from.y + (e.to.y - e.from.y) * t - Math.sin(t * Math.PI) * 30); if (t === 1 || reduced.matches) { e.node.destroy(); envelopes.splice(i, 1); } }
      });
      cleanup = () => app.destroy(true, { children: true });
    })().catch(() => { if (!cancelled) setError('Office graphics unavailable in this browser. The task list below remains available.'); });
    return () => { cancelled = true; cleanup?.(); };
  }, []);
  return <><div ref={host} className="mb-arena-floor" data-testid="arena-floor" role="region" tabIndex={0} aria-label="Scrollable office diagram of recorded inference task states; equivalent task list follows" />{error && <p className="mb-muted">{error}</p>}<p className="mb-muted">Four avatars per station at most. Scroll the floor horizontally on small screens. Motion reflects observed task changes. Envelopes mark newly observed parent-to-child delegation, not a chat transport. Reduced-motion preference is respected.</p></>;
}
