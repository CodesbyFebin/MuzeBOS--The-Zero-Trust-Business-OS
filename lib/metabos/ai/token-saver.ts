/**
 * Token saver: policies that cut Meta Model API tokens before a call is made. Clean-room; ideas credited in THIRD_PARTY.md
 * (litellm budgets/caching, GPTCache exact-match cache, RouteLLM cheap-model routing, LLMLingua compression, OpenHuman
 * tool-result shrinking). No code copied.
 */
import { createHash } from 'node:crypto';
import type { BusinessStore } from '@/lib/metabos/store';

export type TaskClass = 'draft' | 'reply' | 'classify' | 'plan' | 'analysis' | 'deep';
export type Effort = 'minimal' | 'low' | 'medium' | 'high';
/** Per task: reasoning effort and a hard output cap. Per Meta docs the cap includes reasoning tokens. */
export const TASK_POLICY: Record<TaskClass, { effort: Effort; maxOutputTokens: number; cacheable: boolean }> = {
  classify: { effort: 'low', maxOutputTokens: 256, cacheable: true },
  reply: { effort: 'low', maxOutputTokens: 512, cacheable: false },
  draft: { effort: 'low', maxOutputTokens: 768, cacheable: false },
  analysis: { effort: 'medium', maxOutputTokens: 1536, cacheable: true },
  plan: { effort: 'medium', maxOutputTokens: 2048, cacheable: false },
  deep: { effort: 'high', maxOutputTokens: 4096, cacheable: false },
};
/** High effort only when the owner opts in; otherwise deep work runs at medium. 'max' is never sent (not supported on contributor models). */
export function policyFor(task: TaskClass, ownerHighEffort = false, requestedMax?: number) {
  const p = TASK_POLICY[task];
  const effort: Effort = p.effort === 'high' && !ownerHighEffort ? 'medium' : p.effort;
  const maxOutputTokens = Math.max(16, Math.min(p.maxOutputTokens, requestedMax ?? p.maxOutputTokens));
  return { effort, maxOutputTokens, cacheable: p.cacheable };
}
export function taskClassFor(text: string, tier?: string): TaskClass {
  if (tier === 'large') return 'plan';
  if (/\b(plan|roadmap|strategy|steps)\b/i.test(text)) return 'plan';
  if (/\b(classify|category|tag|label|sentiment)\b/i.test(text)) return 'classify';
  if (/\b(reply|respond|answer)\b/i.test(text)) return 'reply';
  if (/\b(why|explain|analy[sz]e|compare)\b/i.test(text)) return 'analysis';
  return 'draft';
}

export type Msg = { role: 'system' | 'user' | 'assistant'; content: string };
/** Prefix ordering for provider prompt caching: static system prompt, then the static agent card, then variable data last. */
export function orderForCache(o: { system: string; agentCard?: string; history?: Msg[]; variable: string }): Msg[] {
  const head = [o.system.trim(), o.agentCard?.trim()].filter(Boolean).join('\n\n');
  return [{ role: 'system', content: head }, ...(o.history ?? []), { role: 'user', content: o.variable }];
}
/** Normalise caller messages: every system message moves to the front (stable prefix); order of the rest is kept. */
export function stablePrefix(messages: Msg[]): Msg[] {
  const sys = messages.filter((m) => m.role === 'system').map((m) => m.content.trim());
  const rest = messages.filter((m) => m.role !== 'system');
  return sys.length ? [{ role: 'system', content: sys.join('\n\n') }, ...rest] : rest;
}

// ---------- Exact-match response cache ----------
export const CACHE_TTL_MS = 24 * 60 * 60_000;
export function cacheKey(model: string, params: Record<string, unknown>, messages: Msg[]) {
  return createHash('sha256').update(JSON.stringify({ model, params, messages })).digest('hex');
}
function ensureCache(s: BusinessStore) {
  s.db.exec('CREATE TABLE IF NOT EXISTS mb_model_cache(key TEXT PRIMARY KEY, model TEXT NOT NULL, response TEXT NOT NULL, createdAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL, hits INTEGER NOT NULL DEFAULT 0)');
}
export function cacheGet(s: BusinessStore, key: string, now = Date.now()): { text: string; model: string } | null {
  ensureCache(s);
  const r = s.db.prepare('SELECT response, model, expiresAt FROM mb_model_cache WHERE key=?').get(key) as { response: string; model: string; expiresAt: number } | undefined;
  if (!r) return null;
  if (r.expiresAt <= now) { s.db.prepare('DELETE FROM mb_model_cache WHERE key=?').run(key); return null; }
  s.db.prepare('UPDATE mb_model_cache SET hits=hits+1 WHERE key=?').run(key);
  return { text: r.response, model: r.model };
}
/** Callers pass sideEffects=true for anything that sends, writes or calls tools; those are never cached. */
export function cachePut(s: BusinessStore, key: string, model: string, text: string, sideEffects: boolean, ttl = CACHE_TTL_MS, now = Date.now()) {
  if (sideEffects) return false;
  ensureCache(s);
  s.db.prepare('INSERT INTO mb_model_cache(key,model,response,createdAt,expiresAt) VALUES(?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET response=excluded.response, createdAt=excluded.createdAt, expiresAt=excluded.expiresAt').run(key, model, text, now, now + ttl);
  return true;
}
export function cacheStats(s: BusinessStore) { ensureCache(s); return s.db.prepare('SELECT COUNT(*) AS entries, COALESCE(SUM(hits),0) AS hits FROM mb_model_cache WHERE expiresAt>?').get(Date.now()) as { entries: number; hits: number }; }

// ---------- Deterministic first ----------
export type Rule = { id: string; test: (text: string) => boolean; answer: (text: string) => string };
export const RULES: Rule[] = [
  { id: 'ack', test: (t) => /^\s*(thanks|thank you|ok|okay|noted|got it|👍)[.! ]*$/i.test(t), answer: () => 'You are welcome. Let us know if you need anything else.' },
  { id: 'hours', test: (t) => /^\s*(what are your|when are you) (open|opening hours|hours)\??\s*$/i.test(t), answer: () => 'Our opening hours are listed on our profile; the owner will confirm any change.' },
];
/** Returns a template answer when a rule matches, so no model call is made. */
export function deterministic(text: string, rules: Rule[] = RULES) { const r = rules.find((x) => x.test(text)); return r ? { rule: r.id, text: r.answer(text) } : null; }

// ---------- Shrink tool results ----------
const ID_KEY = /(^id$|Id$|_id$|^ref$|^sku$|^number$|^invoice|^order)/;
/** Truncate long strings, cap arrays (with a "+n more" note), drop deep nesting, and always keep id-like fields. */
export function shrinkToolResult(v: unknown, o: { maxString?: number; maxItems?: number; maxDepth?: number } = {}, depth = 0): unknown {
  const maxString = o.maxString ?? 200, maxItems = o.maxItems ?? 10, maxDepth = o.maxDepth ?? 3;
  if (typeof v === 'string') return v.length > maxString ? `${v.slice(0, maxString)}… [${v.length - maxString} chars cut]` : v;
  if (Array.isArray(v)) { const head = v.slice(0, maxItems).map((x) => shrinkToolResult(x, o, depth + 1)); return v.length > maxItems ? [...head, `+${v.length - maxItems} more`] : head; }
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      if (ID_KEY.test(k)) { out[k] = x; continue; }
      if (depth >= maxDepth) continue;
      out[k] = shrinkToolResult(x, o, depth + 1);
    }
    return out;
  }
  return v;
}

// ---------- Top-k tools and memory ----------
const words = (t: string) => new Set(t.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
export function topK<T>(items: T[], query: string, k: number, text: (t: T) => string): T[] {
  const q = words(query);
  return items.map((it, i) => { const w = words(text(it)); let n = 0; for (const x of q) if (w.has(x)) n++; return { it, i, n }; })
    .filter((x) => x.n > 0).sort((a, b) => b.n - a.n || a.i - b.i).slice(0, k).map((x) => x.it);
}

// ---------- Cheap-model routing ----------
/** Pick the cheapest available model unless the task needs the large one. `available` is ordered cheapest first. */
export function cheapestModel(task: TaskClass, available: string[], large?: string) {
  if ((task === 'plan' || task === 'deep') && large && available.includes(large)) return large;
  return available[0] ?? null;
}
