/** Rakazo adapter tests. Every Rakazo HTTP response here comes from a TEST DOUBLE (fakeFetch), not a live Rakazo server. */
import { describe, it, expect, beforeEach } from 'vitest';
import { BusinessStore } from '@/lib/metabos/store';
import { rakazoConfig, RakazoClient, getRuntime, setRuntime, MUZE_BOT_RULES } from '@/lib/metabos/runtime/rakazo';
import { checkSecret, proposeFromRakazo, proposalOpenApi } from '@/lib/metabos/runtime/proposals';
import { listDispatches } from '@/lib/metabos/dispatch/service';
import { TILES } from '@/lib/metabos/board/registry';
let s: BusinessStore; beforeEach(() => { s = new BusinessStore(':memory:'); });
type Call = { url: string; init: RequestInit };
/** TEST DOUBLE: records requests and answers like Rakazo's oRPC handler is expected to. */
function fakeFetch(answer: (c: Call) => { status: number; json?: unknown }) { const calls: Call[] = []; const f = (async (url: string, init: RequestInit = {}) => { const c = { url: String(url), init }; calls.push(c); const a = answer(c); return new Response(JSON.stringify(a.json ?? {}), { status: a.status }); }) as unknown as typeof fetch; return { f, calls }; }
const env = { RAKAZO_URL: 'https://rakazo.example', RAKAZO_API_KEY: 'sess-token', RAKAZO_SPACE_ID: 'sp1' };
describe('rakazo config', () => {
  it('is null without url+key and refuses plain http off localhost', () => { expect(rakazoConfig({})).toBeNull(); expect(rakazoConfig({ RAKAZO_URL: 'http://evil.example', RAKAZO_API_KEY: 'x' })).toBeNull(); expect(rakazoConfig({ RAKAZO_URL: 'http://localhost:3001', RAKAZO_API_KEY: 'x' })?.url).toBe('http://localhost:3001'); });
});
describe('rakazo client (test double)', () => {
  it('speaks oRPC with bearer + space header and maps bots', async () => {
    const { f, calls } = fakeFetch(() => ({ status: 200, json: { json: [{ id: 'b1', name: 'Scout', description: 'd' }] } }));
    const c = new RakazoClient(rakazoConfig(env)!, f); expect(await c.listBots()).toEqual([{ id: 'b1', name: 'Scout', description: 'd' }]);
    expect(calls[0].url).toBe('https://rakazo.example/rpc/bots/list'); const h = calls[0].init.headers as Record<string, string>; expect(h.authorization).toBe('Bearer sess-token'); expect(h['x-rakazo-space-id']).toBe('sp1');
  });
  it('create sends MuZe rules; message uses threads/send', async () => {
    const { f, calls } = fakeFetch((c) => ({ status: 200, json: { json: c.url.endsWith('bots/create') ? { id: 'b2', name: 'N' } : { ok: true } } }));
    const c = new RakazoClient(rakazoConfig(env)!, f); await c.createBot({ name: 'N' }); await c.message('b2', 'hi');
    expect(JSON.parse(String(calls[0].init.body)).json.instructions).toBe(MUZE_BOT_RULES); expect(calls[1].url).toMatch(/rpc\/threads\/send$/); expect(JSON.parse(String(calls[1].init.body))).toEqual({ json: { botId: 'b2', text: 'hi' } });
  });
  it('never echoes upstream bodies on error', async () => { const { f } = fakeFetch(() => ({ status: 500, json: { secret: 'leak' } })); await expect(new RakazoClient(rakazoConfig(env)!, f).listBots()).rejects.toThrow(/HTTP 500/); });
  it('health hits /ready', async () => { const { f, calls } = fakeFetch(() => ({ status: 200 })); expect((await new RakazoClient(rakazoConfig(env)!, f).health()).ok).toBe(true); expect(calls[0].url).toBe('https://rakazo.example/ready'); });
});
describe('runtime switch', () => {
  it('defaults to local and refuses rakazo when not configured', () => { expect(getRuntime(s)).toBe('local'); expect(() => setRuntime(s, 'o', 'rakazo', {})).toThrow(/Rakazo not configured/); expect(setRuntime(s, 'o', 'rakazo', env)).toBe('rakazo'); expect(getRuntime(s)).toBe('rakazo'); });
  it('board tile says Rakazo not configured with no env', async () => { const t = TILES.find((x) => x.id === 'rakazo')!; const r = await t.run({ s, env: {}, fetch, timeoutMs: 100 }); expect(r.status).toBe('not configured'); expect(r.detail).toMatch(/Rakazo not configured/); });
});
describe('rakazo proposals', () => {
  it('closed without a secret, rejects a wrong one', () => { expect(() => checkSecret({}, 'x')).toThrow(/closed/); expect(() => checkSecret({ RAKAZO_PROPOSAL_SECRET: 'a' }, 'b')).toThrow(/Unauthorized/); expect(() => checkSecret({ RAKAZO_PROPOSAL_SECRET: 'a' }, 'a')).not.toThrow(); });
  it('becomes a pending [MUSE plan] dispatch with evidence, never a send', () => {
    const r = proposeFromRakazo(s, { channel: 'email', botId: 'b1', botName: 'Scout', to: 'a@b.co', subject: 'Hi', body: 'Hello' });
    const d = listDispatches(s).find((x: { id: string }) => x.id === r.dispatchId) as { status: string; payload: { body: string } } | undefined;
    expect(d?.status).not.toMatch(/sent|dispatched/); expect(JSON.stringify(d)).toContain('[MUSE plan] [rakazo:b1]');
    expect(s.evidence().map((e) => e.action)).toEqual(expect.arrayContaining(['dispatch.proposed', 'runtime.rakazo.proposal'])); expect(s.verifyAudit()).toBe(true);
  });
  it('rejects channels Rakazo may not use', () => { expect(() => proposeFromRakazo(s, { channel: 'payment-link', botId: 'b', to: 'x', body: 'y' })).toThrow(); });
  it('openapi doc exposes only propose_send', () => { const d = proposalOpenApi('https://m.example'); expect(Object.keys(d.paths)).toEqual(['/api/runtime/rakazo/propose']); expect(JSON.stringify(d)).not.toMatch(/secret"?:\s*"[^"]/); });
});
