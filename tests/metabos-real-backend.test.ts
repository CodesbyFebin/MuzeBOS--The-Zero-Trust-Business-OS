import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BusinessStore } from '@/lib/metabos/store';
import { InferenceStore } from '@/lib/metabos/inference/store';
import { routes } from '@/lib/metabos/inference/routing';
import { testConnection } from '@/lib/metabos/providers';
import { ALL_FEATURES, EXISTING_BACKING, statusCounts } from '@/lib/metabos/registry';

describe('stored inference limits', () => {
  it('defaults to 50/65536, persists owner changes with evidence, and rejects invalid values', () => {
    const b = new BusinessStore(':memory:'); const s = new InferenceStore(b, () => routes({}), () => Date.parse('2026-10-28T06:00:00Z'));
    expect(s.limits()).toMatchObject({ maxAttempts: 50, maxTokens: 65536 });
    s.setLimits(10, 4096, 'owner-1');
    expect(new InferenceStore(b, () => routes({}), () => 0).snapshot().budget.limits).toMatchObject({ maxAttempts: 10, maxTokens: 4096, updatedBy: 'owner-1' });
    expect(b.evidence().some((e) => e.action === 'inference.limits')).toBe(true);
    expect(() => s.setLimits(-1, 10, 'x')).toThrow();
    b.close();
  });
  it('the widget reads limits from the API instead of hardcoding them', () => {
    const src = readFileSync('components/metabos/StudioPorts.tsx', 'utf8');
    expect(src).not.toMatch(/\/ 50 attempts|65,536/);
    expect(src).toContain('budget.limits.maxAttempts');
  });
  it('the setLimits route action is owner-only', () => {
    const src = readFileSync('app/api/inference/route.ts', 'utf8');
    expect(src).toMatch(/setLimits[\s\S]*role !== 'owner'[\s\S]*403|role !== 'owner'[\s\S]*setLimits/);
  });
});

describe('provider connection tests', () => {
  it('reports "Not connected — add VAR" with no network call when env is missing', async () => {
    const b = new BusinessStore(':memory:'); let called = 0;
    const r = await testConnection(b, 'money.payment-link-generator', { env: {}, fetch: async () => { called++; return { status: 200, ok: true }; } });
    expect(r.status).toBe('not-configured');
    expect(r.message).toBe('Not connected — add MUZEBOS_RAZORPAY_KEY_ID, MUZEBOS_RAZORPAY_KEY_SECRET');
    expect(called).toBe(0); b.close();
  });
  it('reports the real HTTP status and never a fake success', async () => {
    const b = new BusinessStore(':memory:'); const urls: string[] = [];
    const r = await testConnection(b, 'talk.whatsapp-hub', { env: { MUZEBOS_WHATSAPP_CLOUD_ACCESS_TOKEN: 't' }, fetch: async (u) => { urls.push(u); return { status: 401, ok: false }; } });
    expect(r.status).toBe('failed'); expect(r.message).toContain('credentials rejected');
    expect(urls[0]).toContain('graph.facebook.com/v25.0/'); b.close();
  });
});

describe('registry review', () => {
  it('every existing screen states its backing', () => {
    const existing = ALL_FEATURES.filter((f) => f.status === 'existing');
    expect(existing.length).toBe(Object.keys(EXISTING_BACKING).length);
    for (const f of existing) expect(f.backing?.length).toBeGreaterThan(0);
    expect(statusCounts()['needs-credentials']).toBe(43);
  });
});
