import { describe, it, expect } from 'vitest';
import { ALL_FEATURES, MENUS, PINNED_MENUS, featureByLegacyRoute, canonicalSlug } from '@/lib/metabos/registry';

describe('registry contract (master prompt §1, §3)', () => {
  it('has exactly 18 main destinations with 14–18 pinned', () => {
    expect(MENUS).toHaveLength(18);
    expect(PINNED_MENUS.map((m) => m.number)).toEqual([14, 15, 16, 17, 18]);
    expect(MENUS.map((m) => m.route).slice(0, 13)).toEqual(['/', '/workspace/orders', '/workspace/money', '/workspace/talk', '/workspace/stock', '/workspace/growth', '/workspace/operations', '/workspace/builder', '/workspace/brain', '/workspace/foundation', '/workspace/system', '/workflows', '/workspace/evidence']);
  });
  it('every feature has the contract fields and a unique canonical route', () => {
    const routes = new Set<string>();
    for (const f of ALL_FEATURES) {
      expect(f.slug && f.title && f.description !== undefined).toBeTruthy();
      expect(f.requiredPermissions?.length).toBeGreaterThan(0);
      expect(routes.has(f.route), f.route).toBe(false);
      routes.add(f.route);
      if (f.status === 'available') expect(f.verificationEvidence?.length).toBeGreaterThan(0);
      else expect(f.verificationEvidence).toEqual([]);
      if (f.status === 'planned' || f.status === 'blocked') expect(f.dependencies.length).toBeGreaterThan(0);
    }
  });
  it('uses the prompt slugs and redirects the old ones', () => {
    expect(canonicalSlug(1)).toBe('pipeline');
    expect(ALL_FEATURES.find((f) => f.route === '/workspace/orders/pipeline')).toBeTruthy();
    expect(featureByLegacyRoute('/workspace/orders/orders-pipeline')?.route).toBe('/workspace/orders/pipeline');
    const legacy = ALL_FEATURES.flatMap((f) => f.legacyRoutes ?? []);
    for (const r of legacy) expect(ALL_FEATURES.some((f) => f.route === r), r).toBe(false);
    expect(legacy.length).toBeGreaterThan(100);
  });
});
