import { describe, it, expect, beforeEach } from 'vitest';
import { BusinessStore } from '@/lib/metabos/store';
import { boardStatus, clearBoardCache, TILE_IDS } from '@/lib/metabos/board/registry';
import { getBoard, putBoard } from '@/lib/metabos/board/config';

const SECRET = 'sk-test-SECRET-should-never-appear';
const okFetch = (calls: string[], status = 200) => (async (u: string) => { calls.push(String(u)); return new Response('{"token":"' + SECRET + '"}', { status }); }) as unknown as typeof fetch;
beforeEach(() => clearBoardCache());

describe('board status', () => {
  it('reports not configured with no env and makes no network calls', async () => {
    const calls: string[] = []; const r = await boardStatus(new BusinessStore(':memory:'), { env: {}, fetch: okFetch(calls) });
    expect(calls).toEqual([]); const by = Object.fromEntries(r.map((t) => [t.id, t]));
    for (const id of ['ollama', 'openrouter', 'baseten', 'meta-model', 'meta-graph', 'stripe', 'slack', 'notion']) expect(by[id].status).toBe('not configured');
    expect(by.sqlite.status).toBe('ok'); expect(by.ledger.status).toBe('ok'); expect(by.ledger.detail).toMatch(/empty/);
    expect(by.dispatch.status).toBe('dry run');
    expect(r.map((t) => t.id)).toEqual(TILE_IDS);
  });
  it('pings configured providers, maps HTTP errors to down, never leaks secrets', async () => {
    const calls: string[] = []; const env = { OPENROUTER_API_KEY: SECRET, STRIPE_SECRET_KEY: SECRET, MUZEBOS_OLLAMA_URL: 'http://127.0.0.1:11434/v1' };
    const r = await boardStatus(new BusinessStore(':memory:'), { env, fetch: okFetch(calls, 401) });
    expect(calls).toContain('http://127.0.0.1:11434/api/tags'); const or = r.find((t) => t.id === 'openrouter')!;
    expect(or.status).toBe('down'); expect(or.detail).toBe('HTTP 401.'); expect(typeof or.latencyMs).toBe('number');
    expect(JSON.stringify(r)).not.toContain(SECRET);
  });
  it('Meta Graph is dry run with a token and test mode on, and calls nothing', async () => {
    const calls: string[] = []; const r = await boardStatus(new BusinessStore(':memory:'), { env: { MUZEBOS_META_PAGE_ACCESS_TOKEN: SECRET }, fetch: okFetch(calls) });
    expect(r.find((t) => t.id === 'meta-graph')!.status).toBe('dry run'); expect(calls.some((c) => c.includes('graph.facebook.com'))).toBe(false);
  });
  it('timeouts become down, and results are cached briefly', async () => {
    let n = 0; const hang = ((_u: string, o: RequestInit) => { n++; return new Promise((_, rej) => o.signal?.addEventListener('abort', () => rej(new Error('abort')))); }) as unknown as typeof fetch;
    const s = new BusinessStore(':memory:'); const env = { NOTION_API_KEY: 'x' };
    const a = await boardStatus(s, { env, fetch: hang, timeoutMs: 20, now: 1000 }); expect(a.find((t) => t.id === 'notion')!.status).toBe('down');
    await boardStatus(s, { env, fetch: hang, timeoutMs: 20, now: 2000 }); expect(n).toBe(1);
  });
});

describe('board config', () => {
  it('defaults to every tile, saves order/size/hidden and logs evidence', () => {
    const s = new BusinessStore(':memory:'); expect(getBoard(s).tiles.map((t) => t.id)).toEqual(TILE_IDS);
    const b = putBoard(s, 'owner@example.com', { tiles: [{ id: 'jev', size: 'lg', hidden: false }, { id: 'stripe', size: 'sm', hidden: true }] });
    expect(b.tiles[0]).toEqual({ id: 'jev', size: 'lg', hidden: false }); expect(b.tiles).toHaveLength(TILE_IDS.length);
    expect(getBoard(s).tiles[1]).toEqual({ id: 'stripe', size: 'sm', hidden: true });
    expect(s.evidence().at(-1)!.action).toBe('board.layout'); expect(s.verifyAudit()).toBe(true);
  });
  it('rejects unknown and duplicate tiles', () => {
    const s = new BusinessStore(':memory:');
    expect(() => putBoard(s, 'a', { tiles: [{ id: 'nope', size: 'md', hidden: false }] })).toThrow(/Unknown tile/);
    expect(() => putBoard(s, 'a', { tiles: [{ id: 'jev', size: 'md', hidden: false }, { id: 'jev', size: 'md', hidden: false }] })).toThrow(/Duplicate/);
  });
});
