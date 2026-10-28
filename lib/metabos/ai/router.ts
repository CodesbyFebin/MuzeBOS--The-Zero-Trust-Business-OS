/** Deterministic, explainable model router. Same input always gives the same decision. */
import { TIERS, type ModelRef, type Tier } from './models';
import type { ProviderState } from './providers';

export type TierChoice = 'auto' | Tier;
export type Availability = { webgpu: boolean; states: Partial<Record<ModelRef['provider'], ProviderState>> };
export type RouteDecision = {
  requested: TierChoice; classified: Tier | null; tier: Tier; chosen: ModelRef | null; fallback: boolean;
  reasons: string[]; skipped: { model: string; provider: string; why: string }[];
};

const LARGE = /\b(plan|strategy|strategic|roadmap|forecast|analy[sz]e|analysis|compare|evaluate|research|design|negotiat)/i;
const MEDIUM = /\b(why|explain|summari[sz]e|reconcile|which|recommend|draft|review|prioriti[sz]e)/i;

/** Classify task size by length and intent words. Documented so the operator can predict it. */
export function classify(text: string): { tier: Tier; why: string } {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words > 120) return { tier: 'large', why: `${words} words (over 120)` };
  if (LARGE.test(text) && words > 12) return { tier: 'large', why: `planning/analysis wording and ${words} words` };
  if (LARGE.test(text) || MEDIUM.test(text) || words > 40) return { tier: 'medium', why: LARGE.test(text) || MEDIUM.test(text) ? 'reasoning wording in a short request' : `${words} words (over 40)` };
  return { tier: 'small', why: `short request (${words} words) with no reasoning wording` };
}

const ORDER: Tier[] = ['large', 'medium', 'small'];

function available(ref: ModelRef, a: Availability): string | null {
  if (ref.provider === 'webllm') return a.webgpu ? null : 'this browser has no WebGPU';
  const s = a.states[ref.provider];
  if (s === 'ready') return null;
  return s === 'needs_key' ? 'provider needs a key' : s === 'unconfigured' ? 'provider not configured' : 'provider unavailable';
}

/** Fallback policy: try the tier's candidates in order; if none is available step DOWN a tier
 *  (never up, so cost never rises silently); if nothing at all is available, return no model. */
export function route(text: string, requested: TierChoice, a: Availability): RouteDecision {
  const c = requested === 'auto' ? classify(text) : null;
  const start: Tier = c ? c.tier : (requested as Tier);
  const reasons = [c ? `Auto: classified as ${c.tier} because ${c.why}.` : `Operator selected the ${start} tier.`];
  const skipped: RouteDecision['skipped'] = [];
  for (const tier of ORDER.slice(ORDER.indexOf(start))) {
    for (const ref of TIERS[tier].candidates) {
      const why = available(ref, a);
      if (why) { skipped.push({ model: ref.model, provider: ref.provider, why }); continue; }
      const fallback = tier !== start || skipped.length > 0;
      if (tier !== start) reasons.push(`No ${start} model available; fell back to the ${tier} tier.`);
      if (skipped.some((s) => TIERS[start].candidates.find((x) => x.model === s.model)?.family === 'muse') && ref.family === 'llama') reasons.push('Muse unavailable here; using Llama.');
      reasons.push(`Chose ${ref.model} on ${ref.provider}${skipped.length ? ` after skipping ${skipped.length}` : ''}.`);
      return { requested, classified: c?.tier ?? null, tier, chosen: ref, fallback, reasons, skipped };
    }
  }
  reasons.push('No model is available: add a provider key, configure a local server, or use a WebGPU browser.');
  return { requested, classified: c?.tier ?? null, tier: start, chosen: null, fallback: true, reasons, skipped };
}
