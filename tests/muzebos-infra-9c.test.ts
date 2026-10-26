import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BusinessStore } from '@/lib/muzebos/store';
import { infraReport, INFRA_IDS } from '@/lib/muzebos/infra';
import { INFRA_PAGES } from '@/lib/muzebos/infra-pages';
import { ALL_FEATURES } from '@/lib/muzebos/registry';

const stores: BusinessStore[] = [];
afterEach(() => { while (stores.length) stores.pop()!.close(); });
const fileStore = () => { const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mb9c-')), 'b.db'); const s = new BusinessStore(f); stores.push(s); return { s, f }; };
const metric = (r: ReturnType<typeof infraReport>, label: string) => r!.metrics.find((m) => m.label === label)!.value;

describe('slice 9c infra pages', () => {
  it('all 20 infra pages are registry pages, measured and available', () => {
    expect(Object.keys(INFRA_PAGES)).toHaveLength(20);
    expect(INFRA_IDS.sort()).toEqual(Object.values(INFRA_PAGES).sort());
    const { s } = fileStore();
    for (const [pillar, id] of Object.entries(INFRA_PAGES)) {
      const f = ALL_FEATURES.find((x) => x.id === id);
      expect(f?.pillar, id).toBe(Number(pillar));
      expect(f!.status).toBe('available');
      const r = infraReport(s, id)!;
      expect(r.metrics.length, id).toBeGreaterThan(0);
      expect(r.limits.length, id).toBeGreaterThan(0);
    }
    expect(infraReport(s, 'nope')).toBeNull();
  });
  it('reflects real DB state: evidence, migrations, failed runs, db size', () => {
    const { s, f } = fileStore();
    const before = Number(metric(infraReport(s, 'operations.access-log'), 'Evidence entries'));
    s.customer({ name: 'A', email: '' });
    const after = infraReport(s, 'operations.access-log')!;
    expect(Number(metric(after, 'Evidence entries'))).toBe(before + 1);
    expect(after.tables[0].rows[0][1]).toBeTruthy();
    const mig = infraReport(s, 'system.database-migration-ledger')!;
    expect(Number(metric(mig, 'Applied migrations'))).toBe(mig.tables[0].rows.length);
    expect(metric(infraReport(s, 'brain.run-summary-and-evidence'), 'Evidence chain')).toBe('valid');
    expect(metric(infraReport(s, 'system.connection-pool-optimizer'), 'journal_mode')).toBe('wal');
    expect(metric(infraReport(s, 'foundation.data-residency-controls', { dbFile: f }), 'Database file')).toBe(f);
    expect(metric(infraReport(s, 'foundation.encryption-configuration'), 'Database at rest')).toMatch(/not encrypted/);
    expect(metric(infraReport(s, 'system.api-gateway-and-rate-limiter'), 'Rate limiter')).toBe('none in this process');
  });
  it('reads the filesystem it is pointed at', () => {
    const { s } = fileStore();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mb9c-root-'));
    fs.mkdirSync(path.join(root, 'public')); fs.writeFileSync(path.join(root, 'public', 'a.png'), Buffer.alloc(2048));
    const r = infraReport(s, 'system.static-asset-pipeline', { root })!;
    expect(metric(r, 'Public files')).toBe('1');
    expect(r.tables[0].rows[0]).toEqual(['public/a.png', '2.0 KB']);
    expect(metric(infraReport(s, 'builder.static-build-pipeline', { root }), 'Build id')).toBe('no build found');
  });
});
