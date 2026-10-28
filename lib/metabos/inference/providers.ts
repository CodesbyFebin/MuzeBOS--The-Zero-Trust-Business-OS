import { metaKey, basetenKey } from '../ai/meta';
import { z } from 'zod';
import { runtimeEnv } from '@/lib/creds';
import { BusinessError, businessStore } from '@/lib/metabos/store';
import { metaCall, MetaApiError } from '../ai/meta-call';
import { InferenceStore } from './store';
import type { InferencePayload, Route } from './types';
const responseSchema = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string().min(1).max(100000), tool_calls: z.array(z.unknown()).optional(), function_call: z.unknown().optional() }), finish_reason: z.string().nullable().optional() })).min(1).max(1000), usage: z.object({ prompt_tokens: z.number().int().min(0).max(1_000_000).optional(), completion_tokens: z.number().int().min(0).max(1_000_000).optional() }).optional() });
const SYSTEM = 'You produce business drafts only. Do not claim to execute actions. Do not call tools. Return a concise draft or, for planning, propose at most five bounded tasks for human review.';
export { validLocalEndpoint } from './endpoint';
import { validLocalEndpoint } from './endpoint';
export async function callTextProvider(payload: InferencePayload, route: Route, env: Record<string, string | undefined> = runtimeEnv(), fetcher: typeof fetch = fetch) {
  if (!route.configured || route.provider !== payload.provider || route.model !== payload.model || route.configHash !== payload.configHash || route.paid && !payload.paidConsent) throw new BusinessError('Inference route is not authorized', 409);
  let endpoint: string, key: string | undefined;
  switch (route.provider) {
    case 'ollama': { const local = validLocalEndpoint(route.endpoint || ''); if (!local) throw new BusinessError('Ollama endpoint must be a configured local/private URL', 409); endpoint = `${local}/chat/completions`; break; }
    case 'meta': endpoint = 'https://api.meta.ai/v1/chat/completions'; key = metaKey(env) || undefined; break;
    case 'baseten': endpoint = 'https://inference.baseten.co/v1/chat/completions'; key = basetenKey(env) || undefined; break;
    case 'openrouter': endpoint = 'https://openrouter.ai/api/v1/chat/completions'; key = env.OPENROUTER_API_KEY; break;
    default: throw new BusinessError('This route requires its dedicated qualified runner', 409);
  }
  if (route.provider !== 'ollama' && !key) throw new BusinessError('Provider credential not configured', 409);
  if (route.provider === 'meta') {
    // All Meta calls go through metaCall: spend cap, reasoning effort, output cap, 429 backoff, measured cost.
    const task = payload.kind === 'plan' ? 'plan' : payload.kind === 'analysis' ? 'analysis' : 'draft';
    try {
      const r = await metaCall({ store: businessStore(), key: key!, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: payload.prompt }], task, model: payload.model, maxOutputTokens: payload.maxTokens, fetch: fetcher, sideEffects: true, skipRules: true });
      return { output: r.text, usage: r.usage ? { promptTokens: r.usage.promptTokens, completionTokens: r.usage.completionTokens } : undefined };
    } catch (e) {
      if (e instanceof MetaApiError) throw new BusinessError(e.status === 402 ? 'Billing not set up: the Meta Model API answered 402 billing_not_configured' : `Provider request failed (${e.status})`, e.status === 402 ? 402 : 502);
      throw e;
    }
  }
  const response = await fetcher(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60_000), headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify({ model: payload.model, stream: false, max_tokens: payload.maxTokens, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: payload.prompt }] }) });
  if (!response.ok) { const txt = await response.text().catch(() => ''); void txt; throw new BusinessError(`Provider request failed (${response.status})`, 502); }
  const reader = response.body?.getReader(); if (!reader) throw new BusinessError('Provider response is empty', 502);
  let size = 0; const chunks: Uint8Array[] = [];
  for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 256000) { await reader.cancel(); throw new BusinessError('Provider response exceeded limit', 502); } chunks.push(value); }
  const parsed = responseSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  if (parsed.choices[0].message.tool_calls?.length || parsed.choices[0].message.function_call != null) throw new BusinessError('Tool calls are not authorized in inference drafts', 409);
  if (route.provider === 'baseten' ? parsed.choices[0].finish_reason !== 'stop' : parsed.choices[0].finish_reason && parsed.choices[0].finish_reason !== 'stop') throw new BusinessError('Provider output did not finish normally; review before retrying', 502);
  return { output: parsed.choices[0].message.content, usage: parsed.usage ? { promptTokens: parsed.usage.prompt_tokens, completionTokens: parsed.usage.completion_tokens } : undefined };
}
export async function runServerOnce(store: InferenceStore, workerId: string, env: Record<string, string | undefined> = runtimeEnv(), fetcher: typeof fetch = fetch) {
  const lease = store.claim(workerId, 'server');
  if (!lease) return { state: 'idle' as const };
  try {
    const route = store.catalog().find(r => r.provider === lease.task.payload.provider)!;
    const result = await callTextProvider(lease.task.payload, route, env, fetcher);
    store.complete(lease.task.id, lease.token, result.output, result.usage);
    return { state: 'completed' as const, taskId: lease.task.id };
  } catch {
    try { store.fail(lease.task.id, lease.token); } catch { /* Cancellation/expiry fences out the worker. */ }
    return { state: 'failed' as const, taskId: lease.task.id };
  }
}
