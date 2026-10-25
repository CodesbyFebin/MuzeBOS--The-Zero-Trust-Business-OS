import { createHash } from 'node:crypto';
import { validLocalEndpoint } from './endpoint';
import { runtimeEnv } from '@/lib/creds';
import { BROWSER_MODEL, BROWSER_CONTEXT, type Lane, type Route, type TaskKind, type Tier } from './types';
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  const result = JSON.stringify(value); if (result === undefined) throw new Error('Unsupported canonical value'); return result;
}
export const fingerprint = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
export function tierFor(kind: TaskKind, prompt: string): Tier { return kind === 'plan' || kind === 'code' ? 'large' : kind === 'analysis' || prompt.length > 2000 ? 'medium' : 'small'; }
export function routes(env: Record<string, string | undefined> = runtimeEnv()): Route[] {
  const paid = env.MUZEBOS_INFERENCE_PAID === '1';
  const localEndpoint = validLocalEndpoint(env.MUZEBOS_OLLAMA_URL || '');
  const candidates = [
    { provider: 'browser' as const, model: BROWSER_MODEL, endpoint: null, configured: true, reason: 'Requires WebGPU, an explicit model download and an active browser.', paid: false },
    { provider: 'ollama' as const, model: env.MUZEBOS_OLLAMA_MODEL || 'llama3.2:3b', endpoint: localEndpoint, configured: !!localEndpoint, reason: 'Set MUZEBOS_OLLAMA_URL and install the selected model. Configuration is not a health check.', paid: false },
    { provider: 'meta' as const, model: 'muse-wonder-1.0', endpoint: 'https://api.meta.ai/v1', configured: !!env.MODEL_API_KEY && paid, reason: 'Requires MODEL_API_KEY and MUZEBOS_INFERENCE_PAID=1. Wonder Full is a separate Muse Code product.', paid: true },
    { provider: 'openrouter' as const, model: env.MUZEBOS_OPENROUTER_MODEL || '', endpoint: 'https://openrouter.ai/api/v1', configured: !!env.OPENROUTER_API_KEY && !!env.MUZEBOS_OPENROUTER_MODEL && (paid || !!env.MUZEBOS_OPENROUTER_MODEL?.endsWith(':free')), reason: 'Requires a key and explicit model. Non-free routes require paid opt-in; provider limits still apply.', paid: !env.MUZEBOS_OPENROUTER_MODEL?.endsWith(':free') },
    { provider: 'openclaw' as const, model: 'openclaw/default', endpoint: null, configured: false, reason: 'External tool-capable gateway requires an independently qualified isolation and approval bridge. Not enabled by a URL alone.', paid: true },
    { provider: 'muse-code' as const, model: 'Muse Wonder Full', endpoint: null, configured: false, reason: 'Requires a Muse Code subscription, isolated runner and per-tool approval bridge. No generic API substitution.', paid: true },
  ];
  return candidates.map(route => ({ ...route, configHash: fingerprint({ provider: route.provider, model: route.model, endpoint: route.endpoint, paid: route.paid, policyVersion: 1, browserContext: route.provider === 'browser' ? BROWSER_CONTEXT : null }) }));
}
export function chooseRoute(kind: TaskKind, prompt: string, lane: Lane, available = routes()): { tier: Tier; route: Route } {
  const tier = tierFor(kind, prompt);
  const provider = lane === 'auto' ? tier === 'small' ? 'browser' : tier === 'medium' ? 'ollama' : 'meta' : lane;
  const route = available.find(r => r.provider === provider);
  if (!route) throw new Error('Unsupported inference route');
  return { tier, route };
}
