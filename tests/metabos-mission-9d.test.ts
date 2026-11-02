import { afterAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
const dir = vi.hoisted(() => { const d = require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'mb9d-')); process.env.MUZEBOS_DB = d + '/b.db'; return d; });
vi.mock('next/navigation', () => ({ usePathname: () => '/', notFound: () => { throw new Error('NEXT_NOT_FOUND'); }, redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); } }));
import { BusinessStore } from '@/lib/metabos/store';
import { missionSnapshot } from '@/lib/metabos/mission';
import { DEFAULT_LAYOUT, getLayout, resetLayout, saveLayout, validLayout } from '@/lib/metabos/mission-layout';
import { ALL_FEATURES } from '@/lib/metabos/registry';
import FeaturePage from '@/app/workspace/[section]/[page]/page';
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
const mem = () => new BusinessStore(':memory:');

describe('slice 9d Mission Control layouts', () => {
  it('saves, reorders, removes, adds and restores the default layout in the DB with evidence', () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mb9dl-')), 'l.db'); let s = new BusinessStore(f);
    expect(getLayout(s)).toEqual({ widgets: DEFAULT_LAYOUT, isDefault: true });
    saveLayout(s, ['graph', 'stats']);
    saveLayout(s, ['stats', 'graph', 'activity']);
    s.close(); s = new BusinessStore(f); // survives restart
    expect(getLayout(s)).toEqual({ widgets: ['stats', 'graph', 'activity'], isDefault: false });
    expect(resetLayout(s)).toEqual({ widgets: DEFAULT_LAYOUT, isDefault: true });
    const actions = (s.db.prepare("SELECT action FROM mb_audit WHERE action LIKE 'mission.layout.%'").all() as { action: string }[]).map((r) => r.action);
    expect(actions).toEqual(['mission.layout.save', 'mission.layout.save', 'mission.layout.reset']); s.close();
  });
  it('rejects empty, unknown and repeated widgets server-side', () => {
    for (const bad of [[], ['nope'], ['stats', 'stats'], 'stats', null]) expect(() => validLayout(bad)).toThrow();
    const s = mem(); expect(() => saveLayout(s, ['x'])).toThrow(); expect(getLayout(s).isDefault).toBe(true); s.close();
  });
  it('every widget and the connected business graph read live store data', () => {
    const s = mem(); const empty = missionSnapshot(s, [], []);
    expect(empty.graph.nodes).toHaveLength(0); expect(empty.counters.customers).toBe(0);
    const c = s.customer({ name: 'Live Co' }); const p = s.product({ name: 'Tea', sku: 'LIVE1', price: 1500, taxBps: 0, stock: 2 });
    s.product({ name: 'Low', sku: 'LOW1', price: 1, taxBps: 0, stock: 1 });
    s.reminder({ title: 'Call Live Co' });
    const o = s.draft({ customerId: c.id, lines: [{ productId: p.id, quantity: 1 }] }); s.issue(o.id, o.hash);
    s.draft({ customerId: c.id, lines: [{ productId: p.id, quantity: 1 }] });
    s.product({ name: 'Gone', sku: 'OUT1', price: 1, taxBps: 0, stock: 0 });
    const m = missionSnapshot(s, [], [{ id: 'gh', name: 'GitHub', state: 'connected', detail: '' } as never]);
    expect(m.mode).toBe('real');
    // stats + attention
    expect(m.counters).toMatchObject({ customers: 1, products: 3, issuedInvoices: 1, paymentPending: 1, outOfStock: 1, lowStock: 2, awaitingApproval: 1 });
    expect(m.approvals).toHaveLength(1); expect(m.stockouts.map((x) => x.sku)).toContain('OUT1');
    // graph: nodes and edges come from the records just written
    expect(m.graph.nodes.map((n) => n.label)).toEqual(expect.arrayContaining(['Live Co', 'LIVE1']));
    expect(m.graph.edges.some((e) => e.from === c.id)).toBe(true);
    // todo, connections, activity
    expect(m.todo.map((t) => t.title)).toContain('Call Live Co');
    expect(m.connections).toHaveLength(1);
    expect(m.feed.length).toBeGreaterThan(0); expect(m.auditValid).toBe(true);
    s.close();
  });
});

describe('slice 9d no registry route renders FeatureStub', () => {
  it(`all ${ALL_FEATURES.length} registry pages render a workspace or redirect, never .mb-stub`, async () => {
    expect(ALL_FEATURES.length).toBe(234);
    const stubs: string[] = [];
    for (const f of ALL_FEATURES) {
      const dedicated = f.route === '/' ? 'app/page.tsx' : `app${f.route}/page.tsx`;
      if (fs.existsSync(dedicated)) { if (fs.readFileSync(dedicated, 'utf8').includes('FeatureStub')) stubs.push(`${f.route}: dedicated page uses FeatureStub`); continue; }
      const [section, page] = f.route.replace(/^\/workspace\//, '').split('/');
      try { const html = renderToStaticMarkup(await FeaturePage({ params: Promise.resolve({ section, page }) }) as never); if (html.includes('mb-stub')) stubs.push(f.route); }
      catch (e) { if (!String((e as Error).message).startsWith('REDIRECT ')) stubs.push(`${f.route}: ${(e as Error).message}`); }
    }
    expect(stubs).toEqual([]);
  });
});
