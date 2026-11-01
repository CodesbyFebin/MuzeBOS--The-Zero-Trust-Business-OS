'use client';
/**
 * MUSE avatar — clean-room Canvas 2D fur creature (built during the event). Inspired by the owner's
 * muse-companion.html prototype (look and states only). No code from that file or its bundled three.js
 * engine is used, so there is no WebGL, no three.js and no GPU shader. Cost control: about 420 strands, a
 * 30 fps cap, a device-pixel-ratio cap of 1.5, and a full stop when off-screen, when the tab is hidden, or under
 * prefers-reduced-motion (that case draws one static frame and shows the state as a ring).
 */
import { useEffect, useRef } from 'react';

export type MuseState = 'idle' | 'listening' | 'thinking' | 'speaking';
export type CoatId = 'ember' | 'graphite' | 'violet';
export const COATS: Record<CoatId, { label: string; base: string; tip: string; shade: string; eye: string }> = {
  ember: { label: 'Ember (red and black)', base: '#5a0a0a', tip: '#FF2A2A', shade: '#140202', eye: '#0A0A0A' },
  graphite: { label: 'Graphite', base: '#2a2a2a', tip: '#9a9a9a', shade: '#0a0a0a', eye: '#FF2A2A' },
  violet: { label: 'Violet (original mascot)', base: '#7b2fbf', tip: '#e28cff', shade: '#2d0a4a', eye: '#14051f' },
};

type Strand = { x: number; y: number; a: number; len: number; ph: number; inner: boolean };
/** Blob with two ear bumps, unit space (−1..1). r(θ) gives the silhouette radius. */
function radius(t: number) { const ears = Math.exp(-((t + 2.2) ** 2) * 14) * 0.28 + Math.exp(-((t + 0.94) ** 2) * 14) * 0.28; return 0.78 + 0.06 * Math.cos(2 * t) + ears; }
function makeStrands(n: number): Strand[] {
  const out: Strand[] = []; let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const t = -Math.PI + (i / n) * Math.PI * 2 + rnd() * 0.03; const inner = i % 3 !== 0; const k = inner ? 0.25 + rnd() * 0.7 : 1;
    const r = radius(t) * k * 0.92; out.push({ x: Math.cos(t) * r, y: Math.sin(t) * r * 0.8, a: t, len: (inner ? 0.1 : 0.2) + rnd() * 0.08, ph: rnd() * 6.28, inner });
  }
  return out.sort((p, q) => Number(p.inner) - Number(q.inner) || p.y - q.y);
}

export function MuseAvatar({ state, coat = 'ember', size = 180, level = 0, label = 'MUSE' }: { state: MuseState; coat?: CoatId; size?: number; level?: number; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ state, coat, level }); live.current = { state, coat, level };
  useEffect(() => {
    const cv = ref.current; if (!cv) return; const ctx = cv.getContext('2d'); if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5); cv.width = size * dpr; cv.height = size * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const strands = makeStrands(420); const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let raf = 0, last = 0, visible = true, blink = 0, nextBlink = 2.5, energy = 0, t0 = performance.now(), boop = 0;
    const draw = (now: number) => {
      const t = (now - t0) / 1000; const { state: st, coat: cId, level: lv } = live.current; const c = COATS[cId] ?? COATS.ember;
      const target = st === 'speaking' ? 0.55 + 0.45 * Math.abs(Math.sin(t * 9)) * Math.max(0.4, lv) : st === 'listening' ? 0.2 + lv : 0; energy += (target - energy) * 0.25; boop *= 0.9;
      if (!reduce && t > nextBlink) { blink = 1; nextBlink = t + 2.5 + Math.random() * 3; } blink = Math.max(0, blink - 0.2);
      const S = size / 2, breathe = reduce ? 1 : 1 + Math.sin(t * 1.6) * 0.015 + boop * 0.05, cy = S * 1.08;
      ctx.clearRect(0, 0, size, size);
      // state ring (also the only motion cue under reduced motion)
      if (st !== 'idle') { ctx.beginPath(); ctx.arc(S, cy - S * 0.05, S * 0.92, 0, Math.PI * 2); ctx.strokeStyle = st === 'thinking' ? '#F59E0B' : '#FF2A2A'; ctx.globalAlpha = reduce ? 0.9 : 0.35 + 0.3 * Math.sin(t * 4); ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1; }
      const g = ctx.createRadialGradient(S, cy - S * 0.3, S * 0.1, S, cy, S * 0.85); g.addColorStop(0, c.base); g.addColorStop(1, c.shade);
      ctx.beginPath(); for (let i = 0; i <= 64; i++) { const a = -Math.PI + (i / 64) * Math.PI * 2; const r = radius(a) * S * 0.62 * breathe; ctx.lineTo(S + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8); } ctx.fillStyle = g; ctx.fill();
      ctx.lineCap = 'round';
      for (const s of strands) {
        const sway = reduce ? 0 : Math.sin(t * 1.3 + s.ph + s.x * 2) * 0.12 + energy * Math.sin(t * 14 + s.ph) * 0.06 + boop * Math.sin(s.ph) * 0.3;
        const x0 = S + s.x * S * 0.62 * breathe, y0 = cy + s.y * S * 0.62 * breathe; const a = s.a + sway;
        const L = s.len * S * (1 + energy * 0.25); const x1 = x0 + Math.cos(a) * L, y1 = y0 + Math.sin(a) * L * 0.85 - (s.inner ? L * 0.15 : 0);
        ctx.strokeStyle = s.inner ? c.base : c.tip; ctx.globalAlpha = s.inner ? 0.55 : 0.8; ctx.lineWidth = s.inner ? 2.2 : 1.6;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2 + Math.cos(a + 1.2) * L * 0.25, (y0 + y1) / 2 + Math.sin(a + 1.2) * L * 0.25, x1, y1); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // eyes + mouth
      const ey = cy - S * 0.02, ex = S * 0.13, eh = S * 0.055 * (1 - blink * 0.9) * (st === 'listening' ? 1.25 : 1);
      for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(S + sx * ex, ey, S * 0.045, Math.max(1, eh), 0, 0, Math.PI * 2); ctx.fillStyle = c.eye; ctx.fill(); ctx.beginPath(); ctx.arc(S + sx * ex + S * 0.015, ey - eh * 0.4, S * 0.012, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.globalAlpha = blink > 0.5 ? 0 : 0.9; ctx.fill(); ctx.globalAlpha = 1; }
      const mo = st === 'speaking' ? energy * S * 0.05 : 0; ctx.beginPath(); ctx.ellipse(S, ey + S * 0.1, S * 0.035, Math.max(1.2, mo), 0, 0, Math.PI * 2); ctx.fillStyle = c.eye; ctx.fill();
      if (st === 'thinking' && !reduce) for (let i = 0; i < 3; i++) { const a = t * 2 + i * 2.09; ctx.beginPath(); ctx.arc(S + Math.cos(a) * S * 0.8, cy - S * 0.05 + Math.sin(a) * S * 0.3, 3, 0, Math.PI * 2); ctx.fillStyle = '#F59E0B'; ctx.fill(); }
    };
    const loop = (now: number) => { raf = 0; if (!visible || document.hidden) return; if (now - last >= 33) { last = now; draw(now); } raf = requestAnimationFrame(loop); };
    const kick = () => { if (!reduce && !raf && visible && !document.hidden) raf = requestAnimationFrame(loop); };
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); }); io.observe(cv);
    const onVis = () => kick(); document.addEventListener('visibilitychange', onVis);
    const onBoop = () => { boop = 1; if (reduce) draw(performance.now()); };
    cv.addEventListener('pointerdown', onBoop);
    draw(performance.now()); kick();
    const redraw = reduce ? setInterval(() => draw(performance.now()), 500) : null; // reduced motion: static frame refreshed only to show state changes
    return () => { cancelAnimationFrame(raf); io.disconnect(); document.removeEventListener('visibilitychange', onVis); cv.removeEventListener('pointerdown', onBoop); if (redraw) clearInterval(redraw); };
  }, [size]);
  const words = state === 'idle' ? 'ready' : state === 'listening' ? 'listening' : state === 'thinking' ? 'working' : 'speaking';
  return <canvas ref={ref} className="mb-muse-avatar" data-testid="muse-avatar" data-state={state} data-coat={coat} style={{ width: size, height: size }} role="img" aria-label={`${label}, ${words}`} />;
}
