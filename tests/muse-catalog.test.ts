import { describe, it, expect } from 'vitest';
import { loadCatalog, getEntry, connectionLabel, needsJev, searchCatalog, counts } from '@/lib/metabos/muse-catalog';
import { runAdapter } from '@/lib/metabos/dispatch/adapters';
describe('muse catalog', () => {
  const all = loadCatalog().entries;
  it('loads skills and mcp', () => { const c = counts(); expect(c.skill).toBeGreaterThan(100); expect(c.mcp).toBeGreaterThan(100); });
  it('never marks GPL adoptable', () => { expect(all.filter((e) => /GPL/i.test(e.license) && e.status === 'adoptable')).toEqual([]); });
  it('MCP with env shows Not connected', () => { const e = all.find((x) => x.kind === 'mcp' && x.env.length && x.env.every((v) => !process.env[v])); expect(e).toBeTruthy(); expect(connectionLabel(e!, {})).toMatch(/Not connected/); });
  it('non read-only needs Jev', () => { for (const e of all.slice(0, 500)) expect(needsJev(e)).toBe(e.risk !== 'read-only'); });
  it('search caps limit', () => { expect(searchCatalog({ limit: 500 }).items.length).toBeLessThanOrEqual(100); });
  it('tool-call adapter hands off and never executes', async () => {
    const e = all.find((x) => x.status !== 'blocked' && x.env.length === 0)!; expect(getEntry(e.id)).toBeTruthy();
    const fetch = (() => { throw new Error('must not fetch'); }) as never;
    const r = await runAdapter('tool-call', { catalogId: e.id, action: 'x', input: '' }, 'k1', { env: {}, fetch });
    expect(JSON.stringify(r)).toMatch(/handoff:|not connected|Not connected|424/i);
    const b = all.find((x) => x.status === 'blocked');
    if (b) expect(JSON.stringify(await runAdapter('tool-call', { catalogId: b.id, action: 'x', input: '' }, 'k2', { env: {}, fetch }))).toMatch(/403|blocked/i);
  });
});
