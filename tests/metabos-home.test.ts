import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import path from 'node:path';
import { BusinessStore } from '@/lib/metabos/store';
import { home } from '@/lib/metabos/home';
describe('MuZe home read model', () => {
  it('reports real empty counts on a fresh store and no invented values', () => {
    const s = new BusinessStore(path.join(mkdtempSync(path.join(tmpdir(), 'home-')), 't.db'));
    const h = home(s, {});
    expect(h.jev.waiting).toBe(0); expect(h.dispatch.total).toBe(0); expect(h.canvas.total).toBe(0);
    expect(h.office.rakazoConfigured).toBe(false); expect(h.trust.map((t) => t.id)).toEqual(['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6']);
    expect(h.trust[0].state).toBe('not_attested'); expect(h.meta.byStatus.unknown).toBe(h.meta.total);
    expect(h.evidence.chainValid).toBe(true);
  });
});
