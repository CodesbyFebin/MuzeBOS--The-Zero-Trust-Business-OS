/** Server-side provider adapters. Keys are read from env here and never returned to the client. */
import { createHash } from 'node:crypto';
import type { ProviderId } from './models';
import { metaKey } from './meta';
import { businessStore, BusinessError, type BusinessStore } from '@/lib/metabos/store';
import { metaCall, MetaApiError } from './meta-call';
import { taskClassFor, type TaskClass } from './token-saver';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type Usage = { promptTokens: number; completionTokens: number; totalTokens: number } | null;
export type ChatResult = { text: string; usage: Usage; model: string; provider: ProviderId };
export type ProviderState = 'ready' | 'needs_key' | 'unconfigured' | 'browser_only' | 'billing_required';
export type ProviderStatus = { id: ProviderId; name: string; state: ProviderState; reason: string; runsOn: 'browser' | 'server' };

export interface Provider {
  id: ProviderId;
  status(): ProviderStatus;
  chat(model: string, messages: ChatMessage[], signal?: AbortSignal): Promise<ChatResult>;
}

type Env = Record<string, string | undefined>;
type Fetch = typeof fetch;

const toUsage = (u: any): Usage => {
  if (!u) return null;
  const p = Number(u.prompt_tokens ?? u.input_tokens); const c = Number(u.completion_tokens ?? u.output_tokens);
  if (!Number.isFinite(p) || !Number.isFinite(c)) return null;
  return { promptTokens: p, completionTokens: c, totalTokens: Number.isFinite(Number(u.total_tokens)) ? Number(u.total_tokens) : p + c };
};

async function openAiChat(f: Fetch, url: string, key: string | null, model: string, messages: ChatMessage[], provider: ProviderId, extra: Record<string, string> = {}, signal?: AbortSignal): Promise<ChatResult> {
  const res = await f(url, { method: 'POST', signal, headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}), ...extra }, body: JSON.stringify({ model, messages }) });
  const body = await res.json().catch(() => null) as any;
  if (!res.ok) throw new Error(`${provider} returned ${res.status}${body?.error?.message ? `: ${String(body.error.message).slice(0, 200)}` : ''}`);
  const text = body?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new Error(`${provider} returned no message`);
  return { text, usage: toUsage(body.usage), model: String(body.model ?? model), provider };
}

export function openRouterProvider(env: Env = process.env, f: Fetch = fetch): Provider {
  const key = env.OPENROUTER_API_KEY?.trim() || null;
  return {
    id: 'openrouter',
    status: () => key ? { id: 'openrouter', name: 'OpenRouter (BYOK)', state: 'ready', reason: 'OPENROUTER_API_KEY is set on the server.', runsOn: 'server' }
      : { id: 'openrouter', name: 'OpenRouter (BYOK)', state: 'needs_key', reason: 'Set OPENROUTER_API_KEY in the server environment. It is never sent to the browser.', runsOn: 'server' },
    chat: (model, messages, signal) => { if (!key) throw new Error('OpenRouter needs OPENROUTER_API_KEY'); return openAiChat(f, 'https://openrouter.ai/api/v1/chat/completions', key, model, messages, 'openrouter', { 'x-title': 'MeTaBos' }, signal); },
  };
}

/** A provider refusal we can name, so the UI can say what is wrong instead of showing output. */
export class ProviderError extends Error { constructor(public provider: ProviderId, public status: number, public code: string | null, message: string) { super(message); } }
export const BILLING_NOT_SET_UP = 'Billing not set up';
/** Last billing refusal per key fingerprint, so status() reports it without another paid call. In-memory, reset on restart. */
const billingBlocked = new Map<string, string>();
const fp = (k: string) => createHash('sha256').update(k).digest('hex').slice(0, 16);
export const META_DEFAULT_MODEL = 'muse-spark-1.3-contributor';
export const META_MODELS_ALLOWED = ['muse-spark-1.3-contributor', 'muse-spark-1.2-contributor', 'muse-spark-1.3', 'muse-wonder-1.0'] as const;

async function metaError(res: Response): Promise<ProviderError> {
  const body = await res.json().catch(() => null) as any;
  const code = typeof body?.error?.code === 'string' ? body.error.code : null;
  if (res.status === 402 || code === 'billing_not_configured') return new ProviderError('meta', res.status, code ?? 'billing_not_configured', `${BILLING_NOT_SET_UP}: the Meta Model API refused the call (HTTP ${res.status}${code ? `, ${code}` : ''}). Resolve billing at dev.meta.ai.`);
  if (res.status === 401 || res.status === 403) return new ProviderError('meta', res.status, code, `Meta Model API rejected the key (HTTP ${res.status})`);
  return new ProviderError('meta', res.status, code, `meta returned ${res.status}${body?.error?.message ? `: ${String(body.error.message).slice(0, 160)}` : ''}`);
}

/**
 * Meta Model API (Muse). Base https://api.meta.ai/v1, OpenAI-compatible /chat/completions (default) and /responses.
 * Key: MODEL_API_KEY (META_MODEL_API_KEY is still accepted). Default model muse-spark-1.3-contributor (fallback muse-spark-1.2-contributor); the owner can switch to standard muse-spark-1.3 / muse-wonder-1.0.
 * Every call goes through metaCall: spend cap, token saver, 429 backoff.
 * A 402 billing_not_configured is surfaced as "Billing not set up"; no output is ever invented.
 */
export function metaProvider(env: Env = process.env, f: Fetch = fetch, api: 'chat' | 'responses' = 'chat', opts: { store?: BusinessStore; task?: TaskClass; sideEffects?: boolean } = {}): Provider & { responses(model: string, messages: ChatMessage[], signal?: AbortSignal): Promise<ChatResult> } {
  const key = metaKey(env);
  const blocked = () => (key ? billingBlocked.get(fp(key)) : undefined);
  const call = async (which: 'chat' | 'responses', model: string, messages: ChatMessage[], signal?: AbortSignal): Promise<ChatResult> => {
    if (!key) throw new ProviderError('meta', 0, 'needs_key', 'Meta Model API needs MODEL_API_KEY');
    if (!(META_MODELS_ALLOWED as readonly string[]).includes(model)) throw new ProviderError('meta', 0, 'model', `Model ${model} is not enabled for the Meta adapter`);
    const store = opts.store ?? businessStore();
    const task = opts.task ?? taskClassFor(messages.filter((m) => m.role === 'user').map((m) => m.content).join(' '));
    try {
      const r = await metaCall({ store, key, messages, task, api: which, model, sideEffects: opts.sideEffects, fetch: f, signal });
      billingBlocked.delete(fp(key));
      const u = r.usage;
      return { text: r.text, usage: u ? { promptTokens: u.promptTokens, completionTokens: u.completionTokens, totalTokens: u.promptTokens + u.completionTokens } : null, model: r.model, provider: 'meta' };
    } catch (e) {
      if (e instanceof MetaApiError) {
        if (e.status === 402) { billingBlocked.set(fp(key), new Date().toISOString()); throw new ProviderError('meta', 402, e.code ?? 'billing_not_configured', `${BILLING_NOT_SET_UP}: the Meta Model API refused the call (HTTP 402${e.code ? `, ${e.code}` : ''}). Resolve billing at dev.meta.ai.`); }
        throw new ProviderError('meta', e.status, e.code, e.message);
      }
      if (e instanceof BusinessError && e.status === 402) throw new ProviderError('meta', 402, 'spend_cap', e.message);
      throw e;
    }
  };
  const responses = (model: string, messages: ChatMessage[], signal?: AbortSignal) => call('responses', model, messages, signal);
  const chat = (model: string, messages: ChatMessage[], signal?: AbortSignal) => call(api, model, messages, signal);
  return {
    id: 'meta',
    status: () => !key ? { id: 'meta', name: 'Meta Model API (Muse)', state: 'needs_key', reason: 'Set MODEL_API_KEY on the server. Preferred provider; OpenRouter is the fallback.', runsOn: 'server' }
      : blocked() ? { id: 'meta', name: 'Meta Model API (Muse)', state: 'billing_required', reason: `${BILLING_NOT_SET_UP}. The Meta Model API answered 402 billing_not_configured at ${blocked()}. Calls fall back to OpenRouter until billing is resolved.`, runsOn: 'server' }
      : { id: 'meta', name: 'Meta Model API (Muse)', state: 'ready', reason: 'MODEL_API_KEY is set on the server. Preferred provider.', runsOn: 'server' },
    chat, responses,
  };
}
/** Test hook: forget remembered billing refusals. */
export function resetMetaBillingState() { billingBlocked.clear(); }

/** Optional OpenAI-compatible local server such as Ollama (http://127.0.0.1:11434/v1) or vLLM. */
export function localProvider(env: Env = process.env, f: Fetch = fetch): Provider {
  const base = env.MUZEBOS_LOCAL_OPENAI_BASE_URL?.trim().replace(/\/+$/, '') || null;
  const model = env.MUZEBOS_LOCAL_MODEL?.trim() || null;
  const key = env.MUZEBOS_LOCAL_OPENAI_API_KEY?.trim() || null;
  return {
    id: 'local',
    status: () => base && model ? { id: 'local', name: 'Local OpenAI-compatible', state: 'ready', reason: `Configured: ${model} at your server.`, runsOn: 'server' }
      : { id: 'local', name: 'Local OpenAI-compatible', state: 'unconfigured', reason: 'Optional. Set MUZEBOS_LOCAL_OPENAI_BASE_URL and MUZEBOS_LOCAL_MODEL (Ollama or vLLM).', runsOn: 'server' },
    chat: (_m, messages, signal) => { if (!base || !model) throw new Error('Local provider is not configured'); return openAiChat(f, `${base}/chat/completions`, key, model, messages, 'local', {}, signal); },
  };
}

/** WebLLM runs only in the browser; the server reports it so the router can hand the call to the client. */
export function webLlmProvider(): Provider {
  return {
    id: 'webllm',
    status: () => ({ id: 'webllm', name: 'WebLLM (on-device)', state: 'browser_only', reason: 'Runs in the browser with WebGPU. The page checks support before loading; unsupported devices skip it.', runsOn: 'browser' }),
    chat: async () => { throw new Error('WebLLM runs in the browser, not on the server'); },
  };
}

export function serverProviders(env: Env = process.env, f: Fetch = fetch): Record<ProviderId, Provider> {
  return { webllm: webLlmProvider(), openrouter: openRouterProvider(env, f), meta: metaProvider(env, f), local: localProvider(env, f) };
}
