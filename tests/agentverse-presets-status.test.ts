import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { BusinessStore } from '@/lib/metabos/store';
import { decide, dispatch, propose } from '@/lib/metabos/dispatch/service';
import { activityFeed, CHANNEL_GROUPS } from '@/lib/metabos/agentverse/core';
import { markProduct, metaStatus } from '@/lib/metabos/meta/status';
import { calculateMetaHealth, filterMetaProducts } from '@/lib/metabos/meta/status-pure';
import { channelFor, deployLayout, PRESET_LIBRARY, saveCustomPreset } from '@/lib/metabos/agentverse/presets';
import { filterActivities } from '@/lib/metabos/muze/pure';

const known = CHANNEL_GROUPS.flatMap((g) => g.channels as readonly string[]);
describe('server presets (ported from t88 pureLogic)', () => {
  it('has the four library presets and maps channels onto real ids', () => {
    expect(PRESET_LIBRARY.map((p) => p.name)).toEqual(['Full Meta Growth Suite', 'WhatsApp & Customer Desk', 'Git Agentic DevOps', 'Solo Creator Studio']);
    expect(channelFor('Pending Approvals', known)).toBe('pending-approvals');
    expect(channelFor('nothing-like-this', known)).toBeNull();
    for (const p of PRESET_LIBRARY) for (const g of deployLayout(p, [...known, 'activity-feed', 'meta-status'])) for (const c of g.channels) expect([...known, 'activity-feed', 'meta-status']).toContain(c);
  });
  it('saveCustomPreset appends then updates in place', () => {
    const a = saveCustomPreset([], { ...PRESET_LIBRARY[0], id: 'c1' }); expect(a).toHaveLength(1); expect(a[0].isCustom).toBe(true);
    const b = saveCustomPreset(a, { ...a[0], name: 'Renamed' }); expect(b).toHaveLength(1); expect(b[0].name).toBe('Renamed');
  });
});
describe('meta status', () => {
  it('is Unknown for all 17 without manual marks; health reflects manual marks only', () => {
    const s = new BusinessStore(':memory:'); const m = metaStatus(s);
    expect(m.products).toHaveLength(17); expect(m.products.every((p) => p.status === 'unknown')).toBe(true);
    expect(calculateMetaHealth(m.products)).toEqual({ overall: 'unknown', total: 17, manualIncidents: 0, unknown: 17 });
    markProduct(s, 'owner', { product: 'Graph API', state: 'degraded' });
    expect(calculateMetaHealth(metaStatus(s).products).overall).toBe('degraded');
    markProduct(s, 'owner', { product: 'Facebook Login', state: 'outage' });
    expect(calculateMetaHealth(metaStatus(s).products)).toMatchObject({ overall: 'outage', manualIncidents: 2 });
    expect(filterMetaProducts(metaStatus(s).products, 'developer', 'graph').map((p) => p.name)).toEqual(['Graph API']);
    s.close();
  });
  it('circuit breaker holds an approved WhatsApp dispatch while marked degraded, with evidence', async () => {
    const s = new BusinessStore(':memory:'); let called = 0; const fetch = (async () => { called++; return new Response('{}'); }) as unknown as typeof globalThis.fetch;
    const p = propose(s, 'm1', 'whatsapp', { to: '+919876543210', body: 'hi' }); const d = decide(s, 'owner', p.id, p.payloadHash, true);
    markProduct(s, 'owner', { product: 'WhatsApp Business Platform', state: 'degraded' });
    await expect(dispatch(s, d.id, d.payloadHash, randomUUID(), { env: {}, fetch } as never)).rejects.toThrow(/Held/);
    expect(called).toBe(0); expect(s.evidence().some((e) => e.action === 'dispatch.held.circuit_breaker')).toBe(true);
    s.close();
  });
});
describe('activity feed', () => {
  it('is empty on a fresh store and only holds real approval/dispatch records', () => {
    const s = new BusinessStore(':memory:'); expect(activityFeed(s)).toEqual([]);
    const p = propose(s, 'm1', 'whatsapp', { to: '+919876543210', body: 'hi' }); decide(s, 'owner', p.id, p.payloadHash, true);
    const f = activityFeed(s); expect(f.length).toBeGreaterThan(0);
    for (const a of f) expect(['approval', 'commit', 'reject', 'dispatch']).toContain(a.kind);
    expect(filterActivities(f, 'ALL', 'zzz-none')).toEqual([]);
    s.close();
  });
});
import { loadCatalog, toInteropRegistry } from '@/lib/metabos/muse-catalog';
describe('MUSE interop export', () => {
  it('lists only non-blocked MCP entries as stubs with no invented schemas or endpoints', () => {
    const rows = toInteropRegistry(); const mcp = loadCatalog().entries.filter((e) => e.kind === 'mcp' && e.status !== 'blocked');
    expect(rows).toHaveLength(mcp.length);
    for (const r of rows) { expect(r.verification).toBe('stub'); expect(r.capabilities).toEqual([]); expect(r.server_url).toBe(''); expect(r.name).not.toMatch(/metapen/i); }
  });
});
