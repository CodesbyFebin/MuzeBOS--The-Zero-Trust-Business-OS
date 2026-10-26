/** Server-side provider adapters. Keys are read from env here and never returned to the client. */
import type { ProviderId } from './models';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type Usage = { promptTokens: number; completionTokens: number; totalTokens: number } | null;
export type ChatResult = { text: string; usage: Usage; model: string; provider: ProviderId };
export type ProviderState = 'ready' | 'needs_key' | 'unconfigured' | 'browser_only';
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
    chat: (model, messages, signal) => { if (!key) throw new Error('OpenRouter needs OPENROUTER_API_KEY'); return openAiChat(f, 'https://openrouter.ai/api/v1/chat/completions', key, model, messages, 'openrouter', { 'x-title': 'MuzeBOS' }, signal); },
  };
}

/** Meta Model API via its documented Responses endpoint. */
export function metaProvider(env: Env = process.env, f: Fetch = fetch): Provider {
  const key = env.META_MODEL_API_KEY?.trim() || null;
  return {
    id: 'meta',
    status: () => key ? { id: 'meta', name: 'Meta Model API (Muse)', state: 'ready', reason: 'META_MODEL_API_KEY is set on the server.', runsOn: 'server' }
      : { id: 'meta', name: 'Meta Model API (Muse)', state: 'needs_key', reason: 'Set META_MODEL_API_KEY. Muse is reachable at api.meta.ai but untested here without a key.', runsOn: 'server' },
    async chat(model, messages, signal) {
      if (!key) throw new Error('Meta Model API needs META_MODEL_API_KEY');
      const res = await f('https://api.meta.ai/v1/responses', { method: 'POST', signal, headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ model, input: messages.map((m) => ({ role: m.role, content: m.content })) }) });
      const body = await res.json().catch(() => null) as any;
      if (!res.ok) throw new Error(`meta returned ${res.status}`);
      const text = typeof body?.output_text === 'string' ? body.output_text
        : (body?.output ?? []).flatMap((o: any) => o?.content ?? []).map((c: any) => c?.text).filter((t: unknown) => typeof t === 'string').join('');
      if (!text) throw new Error('meta returned no text');
      return { text, usage: toUsage(body.usage), model: String(body.model ?? model), provider: 'meta' };
    },
  };
}

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
