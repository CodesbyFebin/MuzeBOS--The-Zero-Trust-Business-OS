import { describe, expect, it } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { scanApiRoutes } from '@/lib/metabos/api-reference';
import generated from '@/lib/metabos/api-reference.generated.json';
import { ALL_FEATURES, pageForSegments } from '@/lib/metabos/registry';

const files = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? files(p) : n === 'route.ts' ? [p] : []; });

describe('developer API reference', () => {
  const live = scanApiRoutes(process.cwd());
  it('the committed reference matches the route files (regenerate with npx tsx scripts/gen-api-reference.ts)', () => {
    expect(generated).toEqual(JSON.parse(JSON.stringify(live)));
  });
  it('lists every route file exactly once with at least one method', () => {
    expect(live.count).toBe(files(join(process.cwd(), 'app/api')).length);
    expect(new Set(live.routes.map((r) => r.path)).size).toBe(live.count);
    for (const r of live.routes) expect(r.methods.length, r.file).toBeGreaterThan(0);
  });
  it('reports real facts for known routes', () => {
    const m = live.routes.find((r) => r.path === '/api/modules/{module}')!;
    expect(m).toMatchObject({ methods: ['GET', 'POST'], idempotencyKey: true, originCheck: true, schemaValidated: true, access: 'session' });
    expect(live.routes.find((r) => r.path === '/api/auth/login')?.access).toBe('open');
    expect(live.routes.find((r) => r.path === '/api/webhooks/{source}')?.access).toBe('webhook');
    expect(live.routes.find((r) => r.path === '/api/usage/push')?.access).toBe('token');
  });
  it('is an available registry page; summaries only come from source doc comments', () => {
    const p = ALL_FEATURES.find((f) => f.id === 'developer.api-reference')!;
    expect(p.status).toBe('available');
    expect(pageForSegments('developer', 'api-reference')?.id).toBe(p.id);
    expect(JSON.stringify(generated)).not.toMatch(/"(plan|price|tier)"/i);
  });
});
