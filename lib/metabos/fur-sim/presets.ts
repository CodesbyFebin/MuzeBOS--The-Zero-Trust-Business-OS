/**
 * MUSE fur-sim presets. Clean-room (three.js MIT only). Ember is the default coat; violet is the original
 * mascot coat; Sakura Mochi, Golden Fluff, Midnight Velvet and Matcha Puff are the owner's named presets
 * (names only; colours chosen here).
 */
export type CoatPresetId = 'ember' | 'violet' | 'sakura-mochi' | 'golden-fluff' | 'midnight-velvet' | 'matcha-puff';
export type CoatPreset = { id: CoatPresetId; label: string; root: string; tip: string; spec: string; eye: string; blush: string; legacy2d: 'ember' | 'violet' | 'graphite' };
export const COAT_PRESETS: CoatPreset[] = [
  { id: 'ember', label: 'Ember (red and black)', root: '#1a0303', tip: '#FF2A2A', spec: '#ffd0c8', eye: '#0A0A0A', blush: '#ff6a6a', legacy2d: 'ember' },
  { id: 'violet', label: 'Violet (original mascot)', root: '#2d0a4a', tip: '#e28cff', spec: '#f4dcff', eye: '#14051f', blush: '#ff9ad5', legacy2d: 'violet' },
  { id: 'sakura-mochi', label: 'Sakura Mochi', root: '#c9707f', tip: '#ffe3ea', spec: '#ffffff', eye: '#2a0f14', blush: '#ff7f9a', legacy2d: 'ember' },
  { id: 'golden-fluff', label: 'Golden Fluff', root: '#8a5a12', tip: '#ffd87a', spec: '#fff3cf', eye: '#1f1203', blush: '#ff9a6a', legacy2d: 'ember' },
  { id: 'midnight-velvet', label: 'Midnight Velvet', root: '#050507', tip: '#3a3a46', spec: '#c8c8d8', eye: '#FF2A2A', blush: '#7a2a2a', legacy2d: 'graphite' },
  { id: 'matcha-puff', label: 'Matcha Puff', root: '#3d5a1e', tip: '#cfe6a0', spec: '#f4ffe0', eye: '#142006', blush: '#ff9a8a', legacy2d: 'graphite' },
];
export const DEFAULT_COAT: CoatPresetId = 'ember';
export const coatById = (id: string | null | undefined): CoatPreset => COAT_PRESETS.find((c) => c.id === id) ?? COAT_PRESETS[0];
export const isCoatId = (id: unknown): id is CoatPresetId => typeof id === 'string' && COAT_PRESETS.some((c) => c.id === id);
/** "flip my coat": next preset in the cycle. */
export const nextCoat = (id: CoatPresetId): CoatPresetId => COAT_PRESETS[(COAT_PRESETS.findIndex((c) => c.id === id) + 1) % COAT_PRESETS.length].id;

export type FurParams = { length: number; density: number; clumping: number; curl: number; roughness: number; specular: number; keyLight: number; rimLight: number; wind: number };
export type SliderDef = { key: keyof FurParams; label: string; min: number; max: number; step: number };
export const FUR_SLIDERS: SliderDef[] = [
  { key: 'length', label: 'Fur length', min: 0.02, max: 0.3, step: 0.01 },
  { key: 'density', label: 'Density', min: 40, max: 400, step: 10 },
  { key: 'clumping', label: 'Clumping', min: 0, max: 1, step: 0.05 },
  { key: 'curl', label: 'Curliness', min: 0, max: 1, step: 0.05 },
  { key: 'roughness', label: 'Roughness', min: 0.05, max: 1, step: 0.05 },
  { key: 'specular', label: 'Specular', min: 0, max: 2, step: 0.05 },
  { key: 'keyLight', label: 'Key light', min: 0, max: 3, step: 0.05 },
  { key: 'rimLight', label: 'Rim light', min: 0, max: 3, step: 0.05 },
  { key: 'wind', label: 'Wind', min: 0, max: 1, step: 0.05 },
];
export const FUR_DEFAULTS: FurParams = { length: 0.12, density: 220, clumping: 0.45, curl: 0.15, roughness: 0.35, specular: 0.9, keyLight: 1.6, rimLight: 1.2, wind: 0.2 };
export function clampParams(p: Partial<FurParams>): FurParams {
  const out = { ...FUR_DEFAULTS };
  for (const s of FUR_SLIDERS) { const v = Number(p[s.key]); if (Number.isFinite(v)) out[s.key] = Math.min(s.max, Math.max(s.min, v)); }
  return out;
}
