/**
 * Optional local tier: an OpenAI-compatible llama-server on the operator's machine (see /workspace/local-llm/README.md).
 * MUZEBOS_LOCAL_LLM_URL (e.g. http://127.0.0.1:8089/v1) serves Llama 3.2 1B for classification and short replies.
 * MUZEBOS_LOCAL_GUARD_URL (defaults to the same server) serves Llama Guard 3 1B, which checks AI drafts before they reach Jev.
 * When the server is down the tier is "Not connected" and nothing is invented: callers fall through to the next tier.
 * Local 1B/8B models invented a promo code in testing, so local output is always a draft for review.
 * Built with Llama. Llama 3.2 is licensed under the Llama 3.2 Community License, Copyright © Meta Platforms, Inc.
 */
import type { BusinessStore } from '@/lib/metabos/store';
type Env = Record<string, string | undefined>;
type Msg = { role: 'system' | 'user' | 'assistant'; content: string };
const clean = (u?: string) => { const v = u?.trim().replace(/\/+$/, ''); if (!v) return null; try { const x = new URL(v); return ['http:', 'https:'].includes(x.protocol) ? v : null; } catch { return null; } };
export const localUrl = (env: Env = process.env) => clean(env.MUZEBOS_LOCAL_LLM_URL);
export const guardUrl = (env: Env = process.env) => clean(env.MUZEBOS_LOCAL_GUARD_URL) ?? localUrl(env);
export const LOCAL_TASKS = new Set(['classify', 'reply']);

/** Llama Guard 3 hazard categories (MLCommons taxonomy, per the Llama Guard 3 model card). */
export const GUARD_CATEGORIES: Record<string, string> = {
  S1: 'Violent crimes', S2: 'Non-violent crimes', S3: 'Sex-related crimes', S4: 'Child sexual exploitation', S5: 'Defamation', S6: 'Specialized advice', S7: 'Privacy', S8: 'Intellectual property', S9: 'Indiscriminate weapons', S10: 'Hate', S11: 'Suicide and self-harm', S12: 'Sexual content', S13: 'Elections', S14: 'Code interpreter abuse',
};

export async function localStatus(env: Env = process.env, f: typeof fetch = fetch): Promise<{ state: 'ready' | 'not_connected' | 'not_configured'; label: string; model?: string }> {
  const u = localUrl(env);
  if (!u) return { state: 'not_configured', label: 'Not connected — set MUZEBOS_LOCAL_LLM_URL' };
  try {
    const r = await f(`${u}/models`, { signal: AbortSignal.timeout(1500), redirect: 'error' });
    if (!r.ok) return { state: 'not_connected', label: `Not connected (local server answered ${r.status})` };
    const j: any = await r.json().catch(() => null);
    return { state: 'ready', label: 'Local Llama ready', model: j?.data?.[0]?.id };
  } catch { return { state: 'not_connected', label: 'Not connected (local server is not running)' }; }
}

export async function localChat(base: string, messages: Msg[], maxTokens: number, f: typeof fetch = fetch, timeoutMs = 20_000) {
  const r = await f(`${base}/chat/completions`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages, max_tokens: maxTokens, temperature: 0 }) });
  if (!r.ok) throw new Error(`local server answered ${r.status}`);
  const j: any = await r.json();
  const text = j?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('local server returned no text');
  return { text: text.trim(), model: String(j?.model ?? 'local'), usage: j?.usage ? { promptTokens: Number(j.usage.prompt_tokens) || 0, completionTokens: Number(j.usage.completion_tokens) || 0 } : null };
}

export type GuardVerdict = { verdict: 'safe' | 'unsafe' | 'unavailable'; categories: { code: string; name: string }[]; model: string | null; reason?: string };
export function parseGuard(text: string): Omit<GuardVerdict, 'model'> {
  const lines = text.trim().toLowerCase().split(/\s*\n\s*/).filter(Boolean);
  if (lines[0] === 'safe') return { verdict: 'safe', categories: [] };
  if (lines[0] === 'unsafe') {
    const codes = (text.match(/S\d{1,2}/gi) ?? []).map((c) => c.toUpperCase());
    return { verdict: 'unsafe', categories: [...new Set(codes)].map((code) => ({ code, name: GUARD_CATEGORIES[code] ?? 'Unknown category' })) };
  }
  return { verdict: 'unavailable', categories: [], reason: 'Guard output was not "safe" or "unsafe"' };
}
/** Check an AI draft with Llama Guard. The draft is sent as the single user turn (a trailing assistant turn is treated as a prefill by llama-server and echoed back). */
export async function guardDraft(store: BusinessStore | null, draft: string, opts: { env?: Env; fetch?: typeof fetch; target?: string } = {}): Promise<GuardVerdict> {
  const u = guardUrl(opts.env ?? process.env);
  let v: GuardVerdict;
  if (!u) v = { verdict: 'unavailable', categories: [], model: null, reason: 'Not connected — set MUZEBOS_LOCAL_LLM_URL or MUZEBOS_LOCAL_GUARD_URL' };
  else {
    try {
      const r = await localChat(u, [{ role: 'user', content: draft.slice(0, 6000) }], 20, opts.fetch);
      v = { ...parseGuard(r.text), model: r.model };
    } catch (e) { v = { verdict: 'unavailable', categories: [], model: null, reason: `Not connected (${e instanceof Error ? e.message.slice(0, 80) : 'error'})` }; }
  }
  if (store) store.transact(() => store.appendEvidence('ai.guard', opts.target ?? 'draft', `Llama Guard: ${v.verdict}${v.categories.length ? ` ${v.categories.map((c) => `${c.code} ${c.name}`).join(', ')}` : ''}${v.reason ? ` (${v.reason})` : ''}`));
  return v;
}
