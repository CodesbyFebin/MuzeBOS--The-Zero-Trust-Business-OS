/**
 * Free-roaming MuZe overlay maths and events. Idea from the owner's pre-existing "METABOS Operator Mode … Free-Roaming 3D GPU-Fur
 * Guide" HTML (see THIRD_PARTY.md); rewritten. MuZe flies to a UI element and reads that element's own data-guide text or label.
 */
export type Rect = { left: number; top: number; width: number; height: number };
export type RoamEvent = { kind: 'guide'; selector: string; text?: string } | { kind: 'dance' } | { kind: 'boop' } | { kind: 'home' } | { kind: 'fullscreen' };
export const ROAM_EVENT = 'muze:roam';
/** Where the handle (size×size) lands next to a target: to the right if it fits, else to the left; always inside the viewport. */
export function flyTarget(r: Rect, vw: number, vh: number, size: number, gap = 12) {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const right = r.left + r.width + gap; const x = right + size <= vw ? right : r.left - gap - size;
  return { x: Math.round(clamp(x, 0, Math.max(0, vw - size))), y: Math.round(clamp(r.top + r.height / 2 - size / 2, 0, Math.max(0, vh - size))) };
}
/** Guide text comes only from the element itself: data-guide, then aria-label, then its visible text. Nothing invented. */
export function guideTextFor(el: { getAttribute(n: string): string | null; textContent: string | null } | null): string {
  if (!el) return 'That part of the page is not on screen.';
  const t = el.getAttribute('data-guide') ?? el.getAttribute('aria-label') ?? (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, 240) : 'No description for this element yet.';
}
export function emitRoam(e: RoamEvent) { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<RoamEvent>(ROAM_EVENT, { detail: e })); }
