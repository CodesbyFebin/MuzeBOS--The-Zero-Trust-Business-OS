/** MeTa Server: every registry route is a channel; commit log is derived from Jev/drafts/dispatch/evidence; ads are drafts only. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BusinessStore } from '@/lib/metabos/store';
import { ALL_FEATURES } from '@/lib/metabos/registry';
import { allServerRoutes, businessServers } from '@/lib/metabos/server/servers';
import { adDraft, commitLog, metaConnections, suiteDraft } from '@/lib/metabos/server/commits';
import { postDraft } from '@/lib/metabos/hub/agent-hub';
import { swarmNames } from '@/lib/metabos/b3/swarms';
import { propose as proposeDispatch } from '@/lib/metabos/dispatch/service';
import { queue } from '@/lib/metabos/ai/jev';

describe('meta server map', () => {
  it('covers all registry routes exactly once across business servers', () => {
    const r = allServerRoutes(); expect(new Set(r).size).toBe(r.length);
    expect([...r].sort()).toEqual(ALL_FEATURES.map((f) => f.route).sort()); expect(r.length).toBe(ALL_FEATURES.length);
    expect(businessServers().map((s) => s.id)).toEqual(['hq', 'sales', 'finance', 'marketing', 'support', 'privacy', 'knowledge', 'brain', 'dev']);
  });
});
describe('commit log (git for agents)', () => {
  it('is empty on a fresh store', () => { expect(commitLog(new BusinessStore(':memory:'))).toEqual([]); });
  it('turns a hub draft into one pending commit with diff, author, Jev run and evidence', () => {
    const s = new BusinessStore(':memory:'); const sw = swarmNames(s)[0];
    const p = postDraft(s, 'owner', { swarm: sw, channel: 'runs', platform: 'instagram', body: 'Diwali boxes\nback in stock' });
    const [c] = commitLog(s); expect(c.kind).toBe('hub'); expect(c.server).toBe(`swarm:${sw}`); expect(c.author).toBe('owner');
    expect(c.diff).toEqual(['+ Diwali boxes', '+ back in stock']); expect(c.status).toBe('pending'); expect(c.jevRunId).toBe(p.jevRunId);
    expect(c.sha).toMatch(/^[a-f0-9]{12}$/); expect(c.evidence.some((e) => e.action === 'hub.draft.pending_jev')).toBe(true);
    expect(commitLog(s).filter((x) => x.jevRunId === p.jevRunId)).toHaveLength(1);
  });
  it('ad drafts queue for Jev, store minor units, and never claim a Meta connection', () => {
    const s = new BusinessStore(':memory:');
    const a = adDraft(s, 'owner', { name: 'Diwali', objective: 'sales', dailyBudgetMinor: 50000, audience: 'Kochi 25-45', creative: 'Gift boxes' });
    expect(a.status).toBe('pending_jev'); expect(queue(s).some((r) => r.id === a.jevRunId)).toBe(true);
    const c = commitLog(s).find((x) => x.kind === 'ad')!; expect(c.server).toBe('marketing'); expect(c.diff).toContain('+ dailyBudgetMinor: 50000 INR'); expect(c.dispatch).toMatch(/Not connected/);
    expect(() => adDraft(s, 'owner', { name: 'x', objective: 'sales', dailyBudgetMinor: 12.5, audience: 'a', creative: 'b' })).toThrow();
    expect(metaConnections({}).find((m) => m.id === 'ads')!.status).toMatch(/^Not connected/);
    expect(metaConnections({}).every((m) => m.status.startsWith('Not connected'))).toBe(true);
  });
  it('meta suite drafts go to Jev per product and mode; statuses honest', () => {
    const s = new BusinessStore(':memory:'); const r = suiteDraft(s, 'owner', { product: 'threads', mode: 'personal', body: 'Hello' });
    expect(queue(s).some((q) => q.id === r.jevRunId)).toBe(true); const c = commitLog(s).find((x) => x.kind === 'suite.threads')!; expect(c.server).toBe('suite'); expect(c.status).toBe('pending');
    expect(() => suiteDraft(s, 'owner', { product: 'tiktok', mode: 'business', body: 'x' })).toThrow();
    const m = metaConnections({}); for (const id of ['facebook', 'instagram', 'messenger', 'whatsapp', 'threads', 'meta-ai']) expect(m.find((x) => x.id === id)!.status).toMatch(/^Not connected/);
  });
  it('lists dispatches with their /api/dispatch state', () => {
    const s = new BusinessStore(':memory:'); proposeDispatch(s, 'owner', 'whatsapp', { to: '+919999999999', body: 'Hi' });
    const c = commitLog(s).find((x) => x.kind === 'dispatch.whatsapp')!; expect(c.status).toBe('pending'); expect(c.server).toBe('support'); expect(c.dispatch).toMatch(/^\/api\/dispatch: pending/);
  });
  it('UI has no CDN, no mock data and mobile toggles', () => {
    const src = readFileSync('components/metabos/server/MetaServer.tsx', 'utf8');
    expect(src).not.toMatch(/https?:\/\/(cdn|fonts|unpkg|graph\.facebook)/); expect(src).toMatch(/aria-controls="mb-srv-rail"/); expect(src).toMatch(/No records yet/);
  });
});
