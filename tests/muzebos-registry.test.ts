import { describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import nextConfig, { MUZEBOS_SHORT_PATHS, MUZEBOS_LEGACY_WORKSPACE } from '../next.config.mjs';
import { MENUS, PINNED_MENUS, SCROLL_MENUS, ALL_FEATURES, FEATURE_STATUSES, resolveMenu, breadcrumbs, pageForSegments, featureByRoute, workspaceDigitViews } from '@/lib/muzebos/registry';
import { registryCommands } from '@/lib/palette';
let mockPath = '/workspace/brain';
vi.mock('next/navigation', () => ({ usePathname: () => mockPath, notFound: () => { throw new Error('NEXT_NOT_FOUND'); }, redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); } }));
import { WorkspaceNavigation } from '@/components/muzebos/WorkspaceNavigation';
import { FeatureStub } from '@/components/muzebos/FeatureStub';
import FeaturePage from '@/app/workspace/[section]/[page]/page';

const EXPECTED = ['Mission Control', 'Orders', 'Money', 'Talk', 'Stock', 'Growth', 'Operations', 'Builder', 'Brain', 'Foundation', 'System', 'Workflows', 'Evidence', 'Settings & Control', 'Upgrade', 'Help & Support', 'API & Webhooks', 'Account'];
const ROUTES = ['/', '/workspace/orders', '/workspace/money', '/workspace/talk', '/workspace/stock', '/workspace/growth', '/workspace/operations', '/workspace/builder', '/workspace/brain', '/workspace/foundation', '/workspace/system', '/workflows', '/workspace/evidence', '/workspace/settings', '/workspace/upgrade', '/workspace/support', '/workspace/developer', '/workspace/account'];
const appRoute = (route: string) => {
  const p = route.split(/[?#]/)[0];
  if (p === '/') return existsSync('app/page.tsx');
  if (existsSync(path.join('app', p, 'page.tsx'))) return true;
  const seg = p.split('/').filter(Boolean);
  if (seg[0] === 'workspace' && seg.length === 2) return existsSync('app/workspace/[section]/page.tsx');
  if (seg[0] === 'workspace' && seg.length === 3) return existsSync('app/workspace/[section]/[page]/page.tsx');
  if (seg[0] === 'social' && seg.length === 2) return true; // app/social/[platform]
  return false;
};

describe('MuzeBOS feature registry', () => {
  it('has exactly 18 main menus in the specified order and routes', () => {
    expect(MENUS.map((m) => m.label)).toEqual(EXPECTED);
    expect(MENUS.map((m) => m.route)).toEqual(ROUTES);
    expect(MENUS.map((m) => m.number)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
  });
  it('pins menus 14–18 below the scrolling navigation', () => {
    expect(PINNED_MENUS.map((m) => m.number)).toEqual([14, 15, 16, 17, 18]);
    expect(SCROLL_MENUS).toHaveLength(13);
  });
  it('gives every page a unique canonical route and id', () => {
    const routes = ALL_FEATURES.map((f) => f.route);
    expect(new Set(routes).size).toBe(routes.length);
    expect(new Set(ALL_FEATURES.map((f) => f.id)).size).toBe(ALL_FEATURES.length);
    const menuRoutes = MENUS.map((m) => m.route).filter((r) => r !== '/' && r !== '/workflows');
    for (const r of routes) expect(menuRoutes).not.toContain(r);
  });
  it('covers all 200 category pillars exactly once', () => {
    const pillars = ALL_FEATURES.map((f) => f.pillar).filter(Boolean);
    expect(pillars.sort((a, b) => a! - b!)).toEqual(Array.from({ length: 200 }, (_, i) => i + 1));
  });
  it('every page and menu route resolves to a route file and back to its menu', () => {
    for (const m of MENUS) { expect(appRoute(m.route), m.route).toBe(true); expect(resolveMenu(m.route)?.id).toBe(m.id); }
    for (const f of ALL_FEATURES) {
      expect(appRoute(f.route), f.route).toBe(true);
      expect(resolveMenu(f.route)?.id, f.route).toBe(f.menuId);
      if (f.target) expect(appRoute(f.target), f.target).toBe(true);
    }
  });
  it('is honest: working pages have no dependencies, planned/blocked pages list theirs and have no target', () => {
    for (const f of ALL_FEATURES) {
      expect(FEATURE_STATUSES).toContain(f.status);
      if (f.status === 'planned' || f.status === 'blocked') { expect(f.dependencies.length, f.id).toBeGreaterThan(0); expect(f.target, f.id).toBeUndefined(); }
      else { expect(f.dependencies).toEqual([]); expect(f.target ?? (appRoute(f.route) ? f.route : undefined), f.id).toBeTruthy(); }
    }
    expect(featureByRoute('/workspace/talk/whatsapp-hub')?.status).toBe('blocked');
    expect(featureByRoute('/workspace/stock/barcode-and-qr-generator')?.status).toBe('planned');
  });
  it('maps legacy routes onto their menus', () => {
    expect(resolveMenu('/funnel')?.id).toBe('orders');
    expect(resolveMenu('/setup')?.id).toBe('settings');
    expect(resolveMenu('/business?view=invoices')?.id).toBe('orders');
    expect(resolveMenu('/wizard')?.id).toBe('brain');
    expect(resolveMenu('/unknown')).toBeUndefined();
  });
  it('builds breadcrumbs from the registry', () => {
    expect(breadcrumbs('/')).toEqual([{ label: 'Mission Control' }]);
    expect(breadcrumbs('/workspace/money').map((c) => c.label)).toEqual(['Mission Control', 'Money']);
    expect(breadcrumbs('/workspace/brain/employees').map((c) => c.label)).toEqual(['Mission Control', 'Brain', 'Assistants & employees', 'Prompt Library']);
  });
  it('digit shortcuts open the first nine menus; palette lists every page with its status', () => {
    expect(workspaceDigitViews()).toEqual(ROUTES.slice(0, 9));
    const cmds = registryCommands();
    expect(new Set(cmds.map((c) => c.id)).size).toBe(cmds.length);
    expect(cmds.filter((c) => c.hint === 'menu')).toHaveLength(18);
    expect(cmds.find((c) => c.href === '/workspace/talk/whatsapp-hub')?.hint).toBe('blocked');
  });
  it('short-path redirects point at canonical menu routes', async () => {
    const rules = await nextConfig.redirects!();
    for (const id of MUZEBOS_SHORT_PATHS) {
      expect(MENUS.some((m) => m.route === `/workspace/${id}`)).toBe(true);
      expect(existsSync(path.join('app', id))).toBe(false);
      expect(rules).toContainEqual({ source: `/${id}`, destination: `/workspace/${id}`, permanent: false });
    }
    for (const [from, to] of MUZEBOS_LEGACY_WORKSPACE) {
      expect(featureByRoute(to), to).toBeDefined();
      expect(MENUS.some((m) => m.route === from)).toBe(false);
      expect(rules).toContainEqual({ source: from, destination: to, permanent: false });
    }
  });
});

describe('Registry-driven shell', () => {
  it('renders an 18-item rail and opens the Brain panel with every cluster expanded', () => {
    mockPath = '/workspace/brain';
    const html = renderToStaticMarkup(createElement(WorkspaceNavigation));
    expect(html.match(/data-workspace-entry=/g)).toHaveLength(18);
    expect(html).toContain('aria-label="Brain pages"');
    expect(html.match(/<details[^>]*open/g)).toHaveLength(4);
  });
  it('canonical page routes redirect working pages and stub the rest without controls', () => {
    expect(() => FeaturePage({ params: { section: 'money', page: 'invoice-maker' } })).toThrow('REDIRECT /business?view=invoices');
    expect(() => FeaturePage({ params: { section: 'money', page: 'nope' } })).toThrow('NEXT_NOT_FOUND');
    const planned = pageForSegments('stock', 'barcode-and-qr-generator')!;
    const html = renderToStaticMarkup(createElement(FeatureStub, { feature: planned }));
    expect(html).toContain('Planned');
    expect(html).toContain('Dependencies');
    expect(html).not.toMatch(/<(button|input|form|select)/);
  });
});
