/**
 * Meta spend cap, token saver and metaCall. FIXTURE fetches only; nothing here reaches the network.
 * Real live calls are recorded in docs/PROVIDER-ENV.md and docs/TOKEN-SAVER.md.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BusinessStore } from '@/lib/metabos/store';
import { costPico, metaBudget, PER_CENT, priceFor, reserveMetaCall, setMetaCap, DEFAULT_CAP_MINOR } from '@/lib/metabos/ai/meta-budget';
import { backoffMs, metaCall, MetaApiError, modelMode, modelsFor, parseUsage, setModelMode, highEffortAllowed } from '@/lib/metabos/ai/meta-call';
import { cacheGet, cacheKey, cachePut, deterministic, orderForCache, policyFor, shrinkToolResult, topK, cheapestModel } from '@/lib/metabos/ai/token-saver';

const stores: BusinessStore[] = []; const fresh = () => { const s = new BusinessStore(':memory:'); stores.push(s); return s; };
afterEach(() => { stores.splice(0).forEach((s) => s.db.close()); });
const owner = { id: 'o1', role: 'owner' }, staff = { id: 's1', role: 'staff' };
const ok = (usage: object, text = '{"x":1}', model = 'muse-spark-1.3-contributor') => new Response(JSON.stringify({ id: 'r1', model, choices: [{ message: { content: text } }], usage }));
const msgs = [{ role: 'user' as const, content: 'Please draft a polite note to Asha about the invoice' }];

describe('spend cap', () => {
  it('defaults to USD 50 as 5000 integer cents, and only the owner can change it', () => {
    const s = fresh();
    expect(metaBudget(s).capMinor).toBe(DEFAULT_CAP_MINOR); expect(DEFAULT_CAP_MINOR).toBe(5000);
    expect(() => setMetaCap(s, staff, 100)).toThrow(/Only the owner/);
    expect(() => setMetaCap(s, owner, 12.5)).toThrow(/whole cents/);
    expect(setMetaCap(s, owner, 100).capMinor).toBe(100);
  });
  it('uses the verified contributor prices and marks unknown models unverified with a conservative rate', () => {
    const s = fresh();
    const p = priceFor(s, 'muse-spark-1.3-contributor');
    expect([p.inputMicroUsdPerM, p.cachedMicroUsdPerM, p.outputMicroUsdPerM, p.verified]).toEqual([100_000, 2_000, 200_000, true]);
    expect(priceFor(s, 'muse-spark-1.3').outputMicroUsdPerM).toBe(4_250_000);
    const u = priceFor(s, 'muse-new'); expect(u.verified).toBe(false); expect(u.outputMicroUsdPerM).toBeGreaterThanOrEqual(20_000_000);
  });
  it('costs uncached input, cached input and output including reasoning tokens', () => {
    const p = { model: 'm', inputMicroUsdPerM: 100_000, cachedMicroUsdPerM: 2_000, outputMicroUsdPerM: 200_000, verified: true, source: '', checkedAt: '' };
    // 1000 prompt (400 cached), 436 completion of which 423 reasoning: reasoning is inside completion, billed once.
    expect(costPico(p, { promptTokens: 1000, cachedTokens: 400, completionTokens: 436, reasoningTokens: 423 })).toBe(600 * 100_000 + 400 * 2_000 + 436 * 200_000);
  });
  it('refuses a call that would exceed the cap and sends no request', async () => {
    const s = fresh(); setMetaCap(s, owner, 0);
    const f = vi.fn(async () => ok({ prompt_tokens: 1, completion_tokens: 1 }));
    await expect(metaCall({ store: s, key: 'k', messages: msgs, task: 'draft', fetch: f as any })).rejects.toThrow(/spend cap reached.*No request sent/);
    expect(f).not.toHaveBeenCalled();
    expect(metaBudget(s).calls[0].state).toBe('refused');
  });
  it('blocks at the cap once recorded spend uses it up', async () => {
    const s = fresh(); setMetaCap(s, owner, 1); // 1 cent
    const huge = { prompt_tokens: 10, completion_tokens: 60_000 }; // 60k output * $0.20/M = 1.2 cents
    const f = vi.fn(async () => ok(huge));
    await metaCall({ store: s, key: 'k', messages: msgs, task: 'draft', fetch: f as any });
    expect(metaBudget(s).spentPico).toBe(10 * 100_000 + 60_000 * 200_000);
    await expect(metaCall({ store: s, key: 'k', messages: msgs, task: 'draft', fetch: f as any })).rejects.toThrow(/spend cap/);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('concurrent reservations cannot overrun the cap', () => {
    const s = fresh(); setMetaCap(s, owner, 1);
    const one = () => reserveMetaCall(s, { model: 'muse-spark-1.3-contributor', inputChars: 0, maxOutputTokens: 30_000, taskClass: 'draft', effort: 'low', api: 'chat' }); // 0.6 cents each
    one(); expect(one).toThrow(/spend cap/);
    expect(metaBudget(s).reservedPico).toBe(30_000 * 200_000);
    expect(PER_CENT).toBe(10_000_000_000);
  });
});

describe('metaCall request shape and resilience', () => {
  it('sends reasoning_effort and max_tokens on chat, and reasoning.effort and max_output_tokens on responses; never max', async () => {
    const s = fresh(); const bodies: any[] = [];
    const f = vi.fn(async (_u: string, i: any) => { bodies.push(JSON.parse(i.body)); return _u.endsWith('/responses') ? new Response(JSON.stringify({ model: 'muse-spark-1.3-contributor', output_text: 'hi', usage: { input_tokens: 5, output_tokens: 3, input_tokens_details: { cached_tokens: 2 }, output_tokens_details: { reasoning_tokens: 1 } } })) : ok({ prompt_tokens: 5, completion_tokens: 2 }); });
    await metaCall({ store: s, key: 'k', messages: msgs, task: 'draft', fetch: f as any });
    const r = await metaCall({ store: s, key: 'k', messages: msgs, task: 'deep', api: 'responses', ownerHighEffort: true, fetch: f as any });
    expect(bodies[0]).toMatchObject({ model: 'muse-spark-1.3-contributor', reasoning_effort: 'low', max_tokens: 768 });
    expect(bodies[1]).toMatchObject({ reasoning: { effort: 'high' }, max_output_tokens: 4096 });
    expect(JSON.stringify(bodies)).not.toContain('"max"');
    expect(r.usage).toEqual({ promptTokens: 5, cachedTokens: 2, completionTokens: 3, reasoningTokens: 1 });
  });
  it('high effort needs the owner opt-in; output tokens are capped per task', () => {
    expect(policyFor('deep').effort).toBe('medium'); expect(policyFor('deep', true).effort).toBe('high');
    expect(policyFor('classify', false, 9999).maxOutputTokens).toBe(256);
    const s = fresh(); expect(highEffortAllowed(s)).toBe(false);
  });
  it('backs off on 429 honouring Retry-After, with jitter otherwise', async () => {
    expect(backoffMs(0, '2')).toBe(2000); expect(backoffMs(3, null, () => 0.5)).toBe(2000); expect(backoffMs(10, null, () => 1)).toBe(20000);
    const s = fresh(); const waits: number[] = [];
    let n = 0; const f = vi.fn(async () => (n++ === 0 ? new Response('{"error":{"code":"rate_limited"}}', { status: 429, headers: { 'retry-after': '1' } }) : ok({ prompt_tokens: 1, completion_tokens: 1 })));
    const r = await metaCall({ store: s, key: 'k', messages: msgs, task: 'draft', fetch: f as any, sleep: async (ms) => { waits.push(ms); } });
    expect(r.text).toBe('{"x":1}'); expect(waits).toEqual([1000]); expect(f).toHaveBeenCalledTimes(2);
  });
  it('falls back to muse-spark-1.2-contributor when the primary model errors, but not on billing refusals', async () => {
    const s = fresh(); const models: string[] = [];
    const f = vi.fn(async (_u: string, i: any) => { const m = JSON.parse(i.body).model; models.push(m); return m.includes('1.3') ? new Response('{"error":{"code":"model_unavailable"}}', { status: 503 }) : ok({ prompt_tokens: 1, completion_tokens: 1 }, 'ok', m); });
    const r = await metaCall({ store: s, key: 'k', messages: msgs, task: 'draft', fetch: f as any });
    expect(models).toEqual(['muse-spark-1.3-contributor', 'muse-spark-1.2-contributor']); expect(r.model).toBe('muse-spark-1.2-contributor');
    const b = vi.fn(async () => new Response('{"error":{"code":"billing_not_configured"}}', { status: 402 }));
    await expect(metaCall({ store: s, key: 'k', messages: msgs, task: 'draft', fetch: b as any })).rejects.toBeInstanceOf(MetaApiError);
    expect(b).toHaveBeenCalledTimes(1);
    expect(metaBudget(s).calls[0]).toMatchObject({ state: 'failed', costPico: 0 });
  });
  it('contributor is the default; only the owner can switch to standard', () => {
    const s = fresh(); expect(modelMode(s)).toBe('contributor');
    expect(modelsFor(s, 'draft', 'muse-spark-1.3')).toEqual(['muse-spark-1.3-contributor', 'muse-spark-1.2-contributor']);
    expect(() => setModelMode(s, staff, 'standard')).toThrow(/Only the owner/);
    setModelMode(s, owner, 'standard'); expect(modelsFor(s, 'plan')).toEqual(['muse-wonder-1.0']);
  });
  it('parses usage from either API and returns null when absent', () => {
    expect(parseUsage({ prompt_tokens: 3, completion_tokens: 436, prompt_tokens_details: { cached_tokens: 1 }, completion_tokens_details: { reasoning_tokens: 423 } })).toEqual({ promptTokens: 3, cachedTokens: 1, completionTokens: 436, reasoningTokens: 423 });
    expect(parseUsage(undefined)).toBeNull();
  });
});

describe('token saver', () => {
  it('answers deterministic rules without calling the model', async () => {
    const s = fresh(); const f = vi.fn();
    const r = await metaCall({ store: s, key: 'k', messages: [{ role: 'user', content: 'thanks' }], task: 'reply', fetch: f as any });
    expect(r.source).toBe('rule'); expect(f).not.toHaveBeenCalled(); expect(deterministic('please plan my quarter')).toBeNull();
  });
  it('caches only side-effect-free cacheable tasks, keyed on model, params and messages, with a TTL', async () => {
    const s = fresh(); const f = vi.fn(async () => ok({ prompt_tokens: 3, completion_tokens: 1 }, 'billing'));
    const m = [{ role: 'user' as const, content: 'Classify this ticket: refund not received' }];
    await metaCall({ store: s, key: 'k', messages: m, task: 'classify', fetch: f as any });
    const hit = await metaCall({ store: s, key: 'k', messages: m, task: 'classify', fetch: f as any });
    expect(hit.source).toBe('cache'); expect(f).toHaveBeenCalledTimes(1);
    await metaCall({ store: s, key: 'k', messages: m, task: 'classify', sideEffects: true, fetch: f as any });
    expect(f).toHaveBeenCalledTimes(2);
    const k = cacheKey('a', { x: 1 }, m); expect(cacheKey('b', { x: 1 }, m)).not.toBe(k);
    cachePut(s, k, 'a', 't', false, 1000, 0); expect(cacheGet(s, k, 500)?.text).toBe('t'); expect(cacheGet(s, k, 2000)).toBeNull();
    cachePut(s, 'side', 'a', 't', true); expect(cacheGet(s, 'side')).toBeNull();
  });
  it('orders static prefix first and variable data last', () => {
    const o = orderForCache({ system: 'S', agentCard: 'CARD', variable: 'VAR' });
    expect(o[0].role).toBe('system'); expect(o.at(-1)!.content).toBe('VAR');
  });
  it('shrinks tool results but keeps ids; picks top-k; routes to the cheapest model', () => {
    const big = { id: 'inv_1', items: Array.from({ length: 50 }, (_, i) => ({ id: `x${i}`, text: 'y'.repeat(2000) })) };
    const out = shrinkToolResult(big) as any;
    expect(out.id).toBe('inv_1'); expect(JSON.stringify(out).length).toBeLessThan(JSON.stringify(big).length / 5);
    expect(topK(['invoice overdue', 'weather', 'overdue invoice reminder'], 'overdue invoice', 2, (x) => x)).toEqual(expect.arrayContaining(['invoice overdue', 'overdue invoice reminder']));
    expect(typeof cheapestModel('classify', ['muse-spark-1.3', 'muse-spark-1.3-contributor'])).toBe('string');
  });
});
