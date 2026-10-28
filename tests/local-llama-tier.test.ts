/** Local Llama tier and Llama Guard gate. Fixture fetches only; the live run is recorded in docs/PROVIDER-ENV.md. */
import { afterEach, describe, expect, it } from 'vitest';
import { BusinessStore } from '@/lib/metabos/store';
import { guardDraft, localStatus, parseGuard, localUrl } from '@/lib/metabos/ai/local-llm';
import { metaCall } from '@/lib/metabos/ai/meta-call';
const stores: BusinessStore[] = []; const fresh = () => { const s = new BusinessStore(':memory:'); stores.push(s); return s; };
afterEach(() => { stores.splice(0).forEach((s) => s.db.close()); });
const chat = (content: string, model = 'Llama-3.2-1B-Instruct-Q4_K_M') => new Response(JSON.stringify({ model, choices: [{ message: { content } }], usage: { prompt_tokens: 30, completion_tokens: 4 } }));
const down = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
const ev = (s: BusinessStore, kind: string) => s.db.prepare('SELECT detail FROM mb_audit WHERE action = ?').all(kind) as { detail: string }[];

describe('local tier', () => {
  it('is not configured without MUZEBOS_LOCAL_LLM_URL and rejects non-http URLs', async () => {
    expect(localUrl({})).toBeNull(); expect(localUrl({ MUZEBOS_LOCAL_LLM_URL: 'file:///etc' })).toBeNull();
    expect((await localStatus({})).label).toMatch(/^Not connected/);
  });
  it('reports Not connected when the server is down, never ready', async () => {
    const st = await localStatus({ MUZEBOS_LOCAL_LLM_URL: 'http://127.0.0.1:1/v1' }, down);
    expect(st.state).toBe('not_connected'); expect(st.label).toMatch(/Not connected/);
  });
  it('routes classify to local with no Meta spend, and drafts to Meta', async () => {
    const s = fresh(); const urls: string[] = [];
    const f = (async (u: string) => { urls.push(String(u)); return String(u).startsWith('http://local') ? chat('billing') : new Response(JSON.stringify({ model: 'muse-spark-1.3-contributor', choices: [{ message: { content: 'Draft' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } })); }) as unknown as typeof fetch;
    const env = { MUZEBOS_LOCAL_LLM_URL: 'http://local/v1' };
    const a = await metaCall({ store: s, key: 'k', task: 'classify', messages: [{ role: 'user', content: 'Which team handles a refund dispute for order 77?' }], fetch: f, env, skipRules: true } as any);
    expect(a.source).toBe('local'); expect(a.costPico).toBe(0);
    const b = await metaCall({ store: s, key: 'k', task: 'draft', messages: [{ role: 'user', content: 'Draft a note to Asha' }], fetch: f, env } as any);
    expect(b.source).toBe('model'); expect(urls.some((u) => u.includes('api.meta.ai'))).toBe(true);
    expect(ev(s, 'ai.local')[0].detail).toMatch(/no Meta spend/);
  });
  it('falls through to Meta when the local server is down', async () => {
    const s = fresh();
    const f = (async (u: string) => { if (String(u).startsWith('http://local')) throw new TypeError('fetch failed'); return new Response(JSON.stringify({ model: 'muse-spark-1.3-contributor', choices: [{ message: { content: 'billing' } }], usage: { prompt_tokens: 10, completion_tokens: 2 } })); }) as unknown as typeof fetch;
    const r = await metaCall({ store: s, key: 'k', task: 'classify', messages: [{ role: 'user', content: 'Which team handles a refund dispute for order 77?' }], fetch: f, env: { MUZEBOS_LOCAL_LLM_URL: 'http://local/v1' }, skipRules: true } as any);
    expect(r.source).toBe('model');
  });
});

describe('Llama Guard gate', () => {
  it('parses safe and unsafe with S-categories', () => {
    expect(parseGuard('safe').verdict).toBe('safe');
    expect(parseGuard('unsafe\nS6')).toEqual({ verdict: 'unsafe', categories: [{ code: 'S6', name: 'Specialized advice' }] });
    expect(parseGuard('unsafe\nS2,S7').categories.map((c) => c.code)).toEqual(['S2', 'S7']);
    expect(parseGuard('maybe').verdict).toBe('unavailable');
  });
  it('records the verdict in the evidence chain and says Not connected when down', async () => {
    const s = fresh();
    const v = await guardDraft(s, 'Bread cures diabetes', { env: { MUZEBOS_LOCAL_GUARD_URL: 'http://g/v1' }, fetch: (async () => chat('unsafe\nS6', 'Llama-Guard-3-1B')) as any, target: 't1' });
    expect(v.verdict).toBe('unsafe'); expect(ev(s, 'ai.guard')[0].detail).toMatch(/unsafe S6 Specialized advice/);
    const d = await guardDraft(s, 'x', { env: { MUZEBOS_LOCAL_GUARD_URL: 'http://g/v1' }, fetch: down });
    expect(d.verdict).toBe('unavailable'); expect(d.reason).toMatch(/Not connected/);
  });
});
