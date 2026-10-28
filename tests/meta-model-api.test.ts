/**
 * Meta Model API adapter. These tests use a FIXTURE fetch, not the live API. The 402 body below is copied from the real
 * reply recorded on 28 Oct 2026 at 13:11 IST (see docs/PROVIDER-ENV.md), with the team id removed.
 * The opt-in live test at the bottom only runs with MUZEBOS_LIVE_META=1 and a real MODEL_API_KEY.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { metaProvider, resetMetaBillingState, ProviderError, BILLING_NOT_SET_UP } from '@/lib/metabos/ai/providers';
import { route } from '@/lib/metabos/ai/router';
import { runAdapter, missingEnv } from '@/lib/metabos/dispatch/adapters';
import { BusinessStore } from '@/lib/metabos/store';

const REAL_402 = { error: { code: 'billing_not_configured', message: 'Billing verification failed. Billing Issue. To use this API key, your team needs to resolve a billing issue first.', param: null, type: 'billing_error' } };
const fixture402 = () => vi.fn(async () => new Response(JSON.stringify(REAL_402), { status: 402 }));
beforeEach(() => resetMetaBillingState());

describe('Meta Model API adapter (fixture fetch)', () => {
  it('reads MODEL_API_KEY, calls /chat/completions with muse-spark-1.3 and returns the reply', async () => {
    const f = vi.fn(async (_u: any, _i: any) => new Response(JSON.stringify({ model: 'muse-spark-1.3', choices: [{ message: { content: 'draft' } }], usage: { prompt_tokens: 4, completion_tokens: 1 } })));
    const p = metaProvider({ MODEL_API_KEY: 'k' }, f as any);
    expect(p.status().state).toBe('ready');
    const r = await p.chat('muse-spark-1.3', [{ role: 'user', content: 'hi' }]);
    expect(f.mock.calls[0][0]).toBe('https://api.meta.ai/v1/chat/completions');
    expect((f.mock.calls[0][1] as any).headers.Authorization).toBe('Bearer k');
    expect(r).toMatchObject({ text: 'draft', provider: 'meta', usage: { totalTokens: 5 } });
    await expect(p.chat('gpt-4o', [])).rejects.toThrow(/not enabled/);
  });
  it('a 402 billing_not_configured becomes "Billing not set up", never output, and status remembers it', async () => {
    const p = metaProvider({ MODEL_API_KEY: 'k' }, fixture402() as any);
    const e = await p.chat('muse-spark-1.3', []).catch((x) => x);
    expect(e).toBeInstanceOf(ProviderError); expect(e.code).toBe('billing_not_configured'); expect(e.message).toContain(BILLING_NOT_SET_UP);
    expect(p.status().state).toBe('billing_required'); expect(p.status().reason).toContain('Billing not set up');
    const e2 = await metaProvider({ MODEL_API_KEY: 'k' }, fixture402() as any, 'responses').chat('muse-wonder-1.0', []).catch((x) => x);
    expect(e2.code).toBe('billing_not_configured');
  });
  it('router prefers Meta and falls back to OpenRouter when billing is not set up', () => {
    expect(route('explain this invoice', 'medium', { webgpu: false, states: { meta: 'ready', openrouter: 'ready' } }).chosen).toMatchObject({ provider: 'meta', model: 'muse-spark-1.3' });
    expect(route('plan', 'large', { webgpu: false, states: { meta: 'ready' } }).chosen).toMatchObject({ provider: 'meta', model: 'muse-wonder-1.0' });
    const d = route('explain this invoice', 'medium', { webgpu: false, states: { meta: 'billing_required', openrouter: 'ready' } });
    expect(d.chosen).toMatchObject({ provider: 'openrouter' }); expect(d.skipped[0]).toMatchObject({ provider: 'meta', why: 'billing not set up' });
  });
  it('dispatch completion tries Meta first, reports Billing not set up, then uses OpenRouter', async () => {
    expect(missingEnv('completion', {})).toEqual(['MODEL_API_KEY or OPENROUTER_API_KEY']);
    expect(missingEnv('completion', { MODEL_API_KEY: 'k' })).toEqual([]);
    const calls: string[] = [];
    const f = async (u: string) => { calls.push(u); return u.includes('meta.ai') ? { ok: false, status: 402, text: async () => JSON.stringify(REAL_402) } : { ok: true, status: 200, text: async () => JSON.stringify({ id: 'or1', model: 'meta/muse-spark-1.3', choices: [{ message: { content: 'x' } }] }) }; };
    const only = await runAdapter('completion', { prompt: 'explain why', tier: 'medium' }, 'idem', { env: { MODEL_API_KEY: 'k' }, fetch: f as any });
    expect(only.ok).toBe(false); expect(only.status).toBe(402); expect(only.evidence).toContain('Billing not set up');
    const both = await runAdapter('completion', { prompt: 'explain why', tier: 'medium' }, 'idem', { env: { MODEL_API_KEY: 'k', OPENROUTER_API_KEY: 'o' }, fetch: f as any });
    expect(both.ok).toBe(true); expect(both.evidence).toContain('openrouter'); expect(both.evidence).toContain('Billing not set up');
    expect(calls.filter((c) => c.includes('meta.ai'))).toHaveLength(2);
  });
});

describe.runIf(process.env.MUZEBOS_LIVE_META === '1' && !!process.env.MODEL_API_KEY)('Meta Model API (LIVE, opt-in)', () => {
  it('reports the real state of the key: either text or Billing not set up', async () => {
    const r = await metaProvider(process.env, fetch, 'chat', { store: new BusinessStore(':memory:') }).chat('muse-spark-1.3-contributor', [{ role: 'user', content: 'Reply with OK' }]).then((x) => ({ live: 'text', x }), (e) => ({ live: 'error', e }));
    console.log('LIVE META RESULT', r.live, r.live === 'error' ? `${(r as any).e.status} ${(r as any).e.code}` : 'text received');
    if (r.live === 'error') expect((r as any).e.status).toBeGreaterThan(0);
  }, 30_000);
});
