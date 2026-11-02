/**
 * The one way the app calls the Meta Model API. Every Meta request goes through metaCall, which:
 * deterministic-first -> exact cache -> spend-cap reservation -> request (reasoning effort + hard output cap, cache-friendly
 * prefix) with 429 backoff -> settle the real cost (cached and reasoning split) -> cache the text when side-effect free.
 * A 402 billing refusal surfaces as "Billing not set up"; nothing is invented.
 */
import { BusinessError, type BusinessStore } from '@/lib/metabos/store';
import { failMetaCall, reserveMetaCall, settleMetaCall, type MetaUsage } from './meta-budget';
import { cacheGet, cacheKey, cachePut, deterministic, policyFor, stablePrefix, type Msg, type TaskClass } from './token-saver';

export const META_API = 'https://api.meta.ai/v1';
export type ModelMode = 'contributor' | 'standard';
/** Contributor (default): prompts and replies may be used by Meta to train models; see the privacy policy. */
export const MODEL_MODES: Record<ModelMode, { primary: string; fallback: string | null; large: string; label: string }> = {
  contributor: { primary: 'muse-spark-1.3-contributor', fallback: 'muse-spark-1.2-contributor', large: 'muse-spark-1.3-contributor', label: 'Contributor (lower price; Meta may use prompts and replies to train models)' },
  standard: { primary: 'muse-spark-1.3', fallback: null, large: 'muse-wonder-1.0', label: 'Standard (Meta does not use prompts for training under contributor terms)' },
};
export const CONTRIBUTOR_DISCLOSURE = 'Contributor mode: prompts and replies sent to the Meta Model API may be used by Meta to train its models.';
const MODE_KEY = 'meta.model.mode';
export const HIGH_EFFORT_KEY = 'meta.highEffort';
/** Owner opt-in for high reasoning effort on deep tasks (off by default). */
export function highEffortAllowed(s: BusinessStore) { return (s.db.prepare('SELECT value FROM mb_settings WHERE key=?').get(HIGH_EFFORT_KEY) as { value: string } | undefined)?.value === '1'; }
export function modelMode(s: BusinessStore): ModelMode {
  const r = s.db.prepare('SELECT value FROM mb_settings WHERE key=?').get(MODE_KEY) as { value: string } | undefined;
  return r?.value === 'standard' ? 'standard' : 'contributor';
}
export function setModelMode(s: BusinessStore, actor: { id: string; role: string }, mode: ModelMode) {
  if (actor.role !== 'owner') throw new BusinessError('Only the owner can change the Meta model setting', 403);
  if (!(mode in MODEL_MODES)) throw new BusinessError('Unknown model mode', 422);
  s.transact(() => {
    s.db.prepare('INSERT INTO mb_settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(MODE_KEY, mode);
    s.appendEvidence('meta.model.mode', actor.id, `Meta model setting: ${MODEL_MODES[mode].primary}${MODEL_MODES[mode].fallback ? ` (fallback ${MODEL_MODES[mode].fallback})` : ''}`);
  });
  return mode;
}
/** Map any requested Meta model to the owner's mode (contributor mode uses contributor models for everything). */
export function modelsFor(s: BusinessStore, task: TaskClass, requested?: string): string[] {
  const m = MODEL_MODES[modelMode(s)];
  if (modelMode(s) === 'standard' && requested && ['muse-spark-1.3', 'muse-wonder-1.0'].includes(requested)) return [requested];
  const first = task === 'plan' || task === 'deep' ? m.large : m.primary;
  return [first, ...(m.fallback && m.fallback !== first ? [m.fallback] : [])];
}

export type MetaCallResult = { text: string; model: string; usage: MetaUsage | null; source: 'model' | 'cache' | 'rule'; rule?: string; callId?: string; effort: string; maxOutputTokens: number; estimatePico?: number; costPico?: number; responseId?: string | null };
export type MetaCallOpts = { store: BusinessStore; key: string; messages: Msg[]; task: TaskClass; api?: 'chat' | 'responses'; model?: string; maxOutputTokens?: number; ownerHighEffort?: boolean; sideEffects?: boolean; fetch?: typeof fetch; signal?: AbortSignal; sleep?: (ms: number) => Promise<void>; random?: () => number; maxRetries?: number; skipRules?: boolean };

export class MetaApiError extends Error { constructor(public status: number, public code: string | null, message: string) { super(message); } }
export const parseUsage = (u: any): MetaUsage | null => {
  if (!u) return null;
  const p = Number(u.prompt_tokens ?? u.input_tokens), c = Number(u.completion_tokens ?? u.output_tokens);
  if (!Number.isFinite(p) || !Number.isFinite(c)) return null;
  const cached = Number((u.prompt_tokens_details ?? u.input_tokens_details)?.cached_tokens) || 0;
  const reasoning = Number((u.completion_tokens_details ?? u.output_tokens_details)?.reasoning_tokens) || 0;
  return { promptTokens: p, cachedTokens: cached, completionTokens: c, reasoningTokens: reasoning };
};
/** Backoff for 429: honour Retry-After (seconds or HTTP date), else exponential with full jitter; capped at 20 s. */
export function backoffMs(attempt: number, retryAfter: string | null, random: () => number = Math.random, now = Date.now()) {
  if (retryAfter) {
    const secs = Number(retryAfter);
    const ms = Number.isFinite(secs) ? secs * 1000 : Date.parse(retryAfter) - now;
    if (Number.isFinite(ms) && ms >= 0) return Math.min(ms, 20_000);
  }
  return Math.floor(random() * Math.min(20_000, 500 * 2 ** attempt));
}

async function once(o: MetaCallOpts, model: string, messages: Msg[], effort: string, maxOut: number) {
  const f = o.fetch ?? fetch; const api = o.api ?? 'chat';
  const body = api === 'responses'
    ? { model, input: messages.map((m) => ({ role: m.role, content: m.content })), reasoning: { effort }, max_output_tokens: maxOut }
    : { model, messages, reasoning_effort: effort, max_tokens: maxOut };
  const sleep = o.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    const res = await f(`${META_API}/${api === 'responses' ? 'responses' : 'chat/completions'}`, { method: 'POST', redirect: 'error', signal: o.signal ?? AbortSignal.timeout(60_000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${o.key}` }, body: JSON.stringify(body) });
    const raw = await res.text().catch(() => '');
    if (raw.length > 512_000) throw new MetaApiError(502, 'too_large', 'Meta Model API response exceeded the size cap');
    let json: any = null; try { json = JSON.parse(raw); } catch { json = null; }
    if (res.ok) {
      const text = api === 'responses'
        ? (typeof json?.output_text === 'string' ? json.output_text : (json?.output ?? []).flatMap((x: any) => x?.content ?? []).map((c: any) => c?.text ?? '').join(''))
        : json?.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || !text) throw new MetaApiError(502, 'empty', 'Meta Model API returned no text');
      return { text, usage: parseUsage(json?.usage), model: String(json?.model ?? model), id: json?.id ?? null };
    }
    const code = typeof json?.error?.code === 'string' ? json.error.code : null;
    if (res.status === 429 && attempt < (o.maxRetries ?? 3)) { await sleep(backoffMs(attempt, res.headers?.get?.('retry-after') ?? null, o.random)); continue; }
    if (res.status === 402 || code === 'billing_not_configured') throw new MetaApiError(402, code ?? 'billing_not_configured', `Billing not set up: the Meta Model API refused the call (HTTP ${res.status}${code ? `, ${code}` : ''}).`);
    throw new MetaApiError(res.status, code, `Meta Model API returned ${res.status}${json?.error?.message ? `: ${String(json.error.message).slice(0, 160)}` : ''}`);
  }
}

export async function metaCall(o: MetaCallOpts): Promise<MetaCallResult> {
  const pol = policyFor(o.task, o.ownerHighEffort ?? highEffortAllowed(o.store), o.maxOutputTokens);
  const messages = stablePrefix(o.messages);
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  if (!o.skipRules && messages.filter((m) => m.role === 'user').length === 1) {
    const d = deterministic(lastUser);
    if (d) return { text: d.text, model: 'rule', usage: null, source: 'rule', rule: d.rule, effort: 'none', maxOutputTokens: 0 };
  }
  const models = o.model ? modelsFor(o.store, o.task, o.model) : modelsFor(o.store, o.task);
  const cacheable = pol.cacheable && !o.sideEffects;
  const inputChars = messages.reduce((n, m) => n + m.content.length, 0);
  let lastErr: unknown;
  for (const model of models) {
    const key = cacheKey(model, { api: o.api ?? 'chat', effort: pol.effort, max: pol.maxOutputTokens }, messages);
    if (cacheable) { const hit = cacheGet(o.store, key); if (hit) return { text: hit.text, model: hit.model, usage: null, source: 'cache', effort: pol.effort, maxOutputTokens: pol.maxOutputTokens, costPico: 0 }; }
    const r = reserveMetaCall(o.store, { model, inputChars, maxOutputTokens: pol.maxOutputTokens, taskClass: o.task, effort: pol.effort, api: o.api ?? 'chat' });
    try {
      const out = await once(o, model, messages, pol.effort, pol.maxOutputTokens);
      settleMetaCall(o.store, r.id, model, out.usage);
      const row = o.store.db.prepare('SELECT costPico AS c FROM mb_model_calls WHERE id=?').get(r.id) as { c: number } | undefined;
      if (cacheable) cachePut(o.store, key, out.model, out.text, false);
      return { text: out.text, model: out.model, usage: out.usage, source: 'model', callId: r.id, effort: pol.effort, maxOutputTokens: pol.maxOutputTokens, estimatePico: r.estimate, costPico: row?.c, responseId: out.id };
    } catch (e) {
      const http = e instanceof MetaApiError;
      failMetaCall(o.store, r.id, !http, e instanceof Error ? e.message : 'failed');
      lastErr = e;
      // Fall back to the next model only for model-side problems (not billing, key or rate-limit refusals).
      if (http && [402, 401, 403, 429].includes((e as MetaApiError).status)) throw e;
    }
  }
  throw lastErr;
}
