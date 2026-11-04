import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import path from 'node:path';
import { BusinessStore } from '@/lib/metabos/store';
import { home } from '@/lib/metabos/home';
import { propose } from '@/lib/metabos/dispatch/service';
import { verifyAuditCached, FULL_MS } from '@/lib/metabos/audit-cache';
const open: BusinessStore[] = [];
const fresh = () => { const s = new BusinessStore(path.join(mkdtempSync(path.join(tmpdir(), 'home-')), 't.db')); open.push(s); return s; };
afterEach(() => { while (open.length) open.pop()!.close(); });
describe('MuZe home read model', () => {
  it('reports real empty counts on a fresh store and no invented values', () => {
    const h = home(fresh(), {});
    expect(h.jev.waiting).toBe(0); expect(h.jev.musePending).toBe(0); expect(h.dispatch.total).toBe(0); expect(h.canvas.total).toBe(0);
    expect(h.office.rakazoConfigured).toBe(false); expect(h.trust.map((t) => t.id)).toEqual(['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6']);
    expect(h.trust[0].state).toBe('not_attested'); expect(h.meta.byStatus.unknown).toBe(h.meta.total);
    expect(h.evidence.chainValid).toBe(true);
  });
  it('counts real rows: dispatches by status, MuZe-tagged pending sends, receipts and evidence', () => {
    const s = fresh();
    propose(s, 'owner', 'whatsapp', { to: '+919999999999', body: 'order ready' }, 'muse');
    propose(s, 'owner', 'email', { to: 'a@b.co', subject: 'Hi', body: 'plain' });
    const h = home(s, {});
    expect(h.dispatch.total).toBe(2); expect(h.dispatch.byStatus.pending).toBe(2); expect(h.jev.musePending).toBe(1); expect(h.receipts).toBe(1);
    expect(h.evidence.rows).toBe(s.evidence().length); expect(h.evidence.rows).toBeGreaterThanOrEqual(2);
    expect(h.evidence.recent[0].action).toBe('dispatch.proposed'); expect(h.evidence.chainValid).toBe(true);
  });
});
describe('cached evidence verification', () => {
  it('verifies new rows incrementally and catches a tampered old row on the next full walk', () => {
    const s = fresh(); const t0 = 1_000_000;
    propose(s, 'owner', 'whatsapp', { to: '+919999999999', body: 'a' });
    expect(verifyAuditCached(s, t0)).toBe(true);
    propose(s, 'owner', 'whatsapp', { to: '+919999999999', body: 'b' });
    expect(verifyAuditCached(s, t0 + 10)).toBe(true);
    s.db.prepare('UPDATE mb_audit SET detail = ? WHERE seq = (SELECT MIN(seq) FROM mb_audit)').run('tampered');
    expect(verifyAuditCached(s, t0 + FULL_MS + 1)).toBe(false); expect(s.verifyAudit()).toBe(false);
  });
  it('a bad appended row fails the incremental check', () => {
    const s = fresh(); const t0 = 5_000_000; propose(s, 'owner', 'whatsapp', { to: '+919999999999', body: 'a' });
    expect(verifyAuditCached(s, t0)).toBe(true);
    propose(s, 'owner', 'whatsapp', { to: '+919999999999', body: 'b' });
    s.db.prepare('UPDATE mb_audit SET detail = ? WHERE seq = (SELECT MAX(seq) FROM mb_audit)').run('tampered');
    expect(verifyAuditCached(s, t0 + 10)).toBe(false);
  });
});
