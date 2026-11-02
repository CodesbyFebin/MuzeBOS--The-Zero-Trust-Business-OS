import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BusinessStore } from '@/lib/metabos/store';
import { queue } from '@/lib/metabos/ai/jev';
import { conversationFor } from '@/lib/metabos/talk/core';
import { bestTimes, buildOrder, catalog, graphFetch, isThrottle, leads, oauthStart, openToken, pixelChecklist, proposeLeadReply, sealToken, updateLead, weeklyReport } from '@/lib/metabos/meta/integration';

describe('Meta integration (honest status, real records only)', () => {
  it('build order is Not configured on an empty env and ads stay blocked on App Review', () => {
    const s = new BusinessStore(':memory:'); const b = buildOrder(s, {});
    expect(b).toHaveLength(7); expect(b.filter((x) => x.state === 'done')).toEqual([]);
    expect(b.find((x) => x.n === 5)?.state).toBe('blocked'); expect(b.find((x) => x.n === 5)?.detail).toMatch(/App Review/);
    expect(catalog(s, {}).status).toMatch(/^Not configured/); expect(pixelChecklist(s, {}).every((p) => !p.ok)).toBe(true);
    expect(() => oauthStart(s, 'owner', {}, ['pages_show_list'])).toThrow();
  });
  it('tokens are sealed with AES-256-GCM and refused without a key', () => {
    const env = { MUZEBOS_TOKEN_KEY: randomBytes(32).toString('base64') };
    const sealed = sealToken('test-token', env); expect(sealed).not.toContain('test-token'); expect(openToken(sealed, env)).toBe('test-token');
    expect(() => sealToken('t', {})).toThrow();
  });
  it('Graph backoff retries throttles then succeeds, and does not retry other errors', async () => {
    expect(isThrottle(429)).toBe(true); expect(isThrottle(400, 17)).toBe(true); expect(isThrottle(400, 190)).toBe(false);
    let n = 0; const waits: number[] = [];
    const f = (async () => { n++; return n < 3 ? new Response(JSON.stringify({ error: { code: 17 } }), { status: 400 }) : new Response(JSON.stringify({ id: '1' }), { status: 200 }); }) as typeof fetch;
    expect(await graphFetch('https://graph.facebook.com/x', {}, f, { baseMs: 1, sleep: async (ms) => { waits.push(ms); } })).toEqual({ id: '1' }); expect(waits).toHaveLength(2);
    let m = 0; const g = (async () => { m++; return new Response(JSON.stringify({ error: { code: 190 } }), { status: 400 }); }) as typeof fetch;
    await expect(graphFetch('u', {}, g, { sleep: async () => {} })).rejects.toThrow(/190/); expect(m).toBe(1);
  });
  it('lead pipeline uses real threads; follow-up goes to Jev; reply is only a proposal', () => {
    const s = new BusinessStore(':memory:'); expect(leads(s)).toEqual([]);
    const c = conversationFor(s, 'whatsapp', '+910000000000', 'Lead');
    expect(leads(s)[0].stage).toBe('new');
    const q = queue(s).length; updateLead(s, 'owner', { conversationId: c.id, stage: 'qualified', followUpAt: '2026-11-05T10:00:00.000Z' });
    expect(leads(s)[0].stage).toBe('qualified'); expect(queue(s).length).toBe(q + 1);
    const r = proposeLeadReply(s, 'owner', c.id, 'Hello'); expect(r.status).not.toBe('sent');
    expect(weeklyReport(s).leadStageChanges).toBe(1); expect(weeklyReport(s).chainValid).toBe(true);
  });
  it('best times are empty without real Insights rows', () => {
    expect(bestTimes(new BusinessStore(':memory:'))).toEqual([]);
  });
  it('acquisition memo states no Meta relationship and avoids banned wording', () => {
    const m = readFileSync('docs/ACQUISITION.md', 'utf8'); expect(m).toMatch(/no relationship with Meta/i); expect(m).not.toMatch(/autonomous/i);
    expect(readFileSync('components/metabos/meta/MetaIntegration.tsx', 'utf8')).not.toMatch(/autonomous|#5865F2|#7289DA/i);
  });
});
