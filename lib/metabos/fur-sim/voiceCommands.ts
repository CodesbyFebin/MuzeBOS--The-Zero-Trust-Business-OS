import { COAT_PRESETS, type CoatPresetId } from './presets';
import { ENVIRONMENTS, type EnvId } from './environments';
export type MuseCommand = { kind: 'boop' } | { kind: 'coat'; preset: CoatPresetId | 'next' } | { kind: 'env'; env: EnvId };
/** Local MUSE commands handled in the browser (no server round trip, nothing sent anywhere). */
export function parseMuseCommand(text: string): MuseCommand | null {
  const t = text.toLowerCase().replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (/^(muse |muze )?boop( muse| muze| me)?$/.test(t) || /\bboop (muse|muze|the nose)\b/.test(t)) return { kind: 'boop' };
  if (/\bflip (my|your|the) coat\b/.test(t) || /\b(next|change|switch) (my |your |the )?coat\b/.test(t)) {
    for (const c of COAT_PRESETS) if (t.includes(c.label.toLowerCase().split(' (')[0]) || t.includes(c.id.replace('-', ' '))) return { kind: 'coat', preset: c.id };
    return { kind: 'coat', preset: 'next' };
  }
  const coat = /\b(?:coat|fur) (?:to )?(.+)$/.exec(t)?.[1];
  if (coat && /^(set|make|use|wear)\b/.test(t)) { const c = COAT_PRESETS.find((p) => coat.includes(p.label.toLowerCase().split(' (')[0])); if (c) return { kind: 'coat', preset: c.id }; }
  const env = /^(?:go to|show|switch to) (.+?)(?: view| scene)?$/.exec(t)?.[1];
  if (env) { const e = ENVIRONMENTS.find((x) => x.label.toLowerCase() === env || x.label.toLowerCase().replace(' view', '') === env); if (e && !e.usesCamera) return { kind: 'env', env: e.id }; }
  return null; // AR is never started by voice: camera needs a click
}
