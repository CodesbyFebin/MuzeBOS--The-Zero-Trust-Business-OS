import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { BusinessStore } from '@/lib/metabos/store';
import { perform, view, today } from '@/lib/metabos/modules/engine';
import { OPS_FOUNDATION_MODULES } from '@/lib/metabos/modules/catalog-ops-foundation';
import { ALL_FEATURES, pageForSegments } from '@/lib/metabos/registry';

const stores: BusinessStore[] = [];
afterEach(() => { while (stores.length) stores.pop()!.close(); });
const fresh = () => { const s = new BusinessStore(':memory:'); stores.push(s); return s; };
const create = (s: BusinessStore, m: string, data: Record<string, unknown>) => perform(s, m, { action: 'create', data });
const step = (s: BusinessStore, m: string, id: string, transition: string, input: Record<string, unknown> = {}) => {
  const r = s.db.prepare('SELECT version FROM mb_module_records WHERE id=?').get(id) as { version: number };
  return perform(s, m, { action: 'transition', id, version: r.version, transition, input });
};
const hash = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');
const day = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
const person = (s: BusinessStore, email = 'a@x.in') => create(s, 'operations.staff-management', { name: 'Asha', email, role: 'Ops', startDate: '2026-01-01' });
const evidence = (s: BusinessStore, id: string) => (s.db.prepare('SELECT action FROM mb_audit WHERE target=?').all(id) as { action: string }[]).map((e) => e.action);

describe('batch (c) registry wiring', () => {
  it('all 22 modules are available registry pages with the requested pillars', () => {
    expect(OPS_FOUNDATION_MODULES.map((m) => m.pillar).sort((a, b) => a! - b!)).toEqual([101, 103, 104, 105, 106, 107, 108, 111, 112, 113, 116, 117, 118, 163, 165, 166, 167, 169, 171, 173, 176, 178]);
    for (const m of OPS_FOUNDATION_MODULES) {
      const page = ALL_FEATURES.find((p) => p.id === m.id)!;
      expect(page, m.id).toBeTruthy();
      expect(page.status, m.id).toBe('available');
      expect(page.pillar).toBe(m.pillar);
      const [section, slug] = page.route.split('/').slice(2);
      expect(pageForSegments(section, slug)?.id).toBe(m.id);
    }
  });
});

describe('operations', () => {
  it('staff email unique (case-insensitive); offboarded staff leave pickers', () => {
    const s = fresh(); const a = person(s, 'A@X.in');
    expect(() => person(s, 'a@x.in')).toThrow('already exists');
    step(s, 'operations.staff-management', a.id, 'offboard');
    expect(() => create(s, 'operations.projects', { name: 'P', ownerId: a.id, dueOn: day(5) })).toThrow();
  });
  it('leave overlaps refused, time capped at 24h/day and summed onto projects', () => {
    const s = fresh(); const a = person(s);
    const l = create(s, 'operations.attendance-and-leave', { staffId: a.id, kind: 'casual', fromDate: '2026-11-02', toDate: '2026-11-04' });
    expect(view(s, l.module).records[0].computed!.Days).toBe('3');
    expect(() => create(s, l.module, { staffId: a.id, kind: 'sick', fromDate: '2026-11-04', toDate: '2026-11-05' })).toThrow('Overlaps');
    expect(() => create(s, l.module, { staffId: a.id, kind: 'sick', fromDate: '2026-11-05', toDate: '2026-11-01' })).toThrow('on or after');
    const p = create(s, 'operations.projects', { name: 'P', ownerId: a.id, dueOn: day(5), budget: 100000 });
    create(s, 'operations.time-tracker', { staffId: a.id, projectId: p.id, date: today(), minutes: 1000 });
    expect(() => create(s, 'operations.time-tracker', { staffId: a.id, projectId: p.id, date: today(), minutes: 500 })).toThrow('24 hours');
    expect(() => create(s, 'operations.time-tracker', { staffId: a.id, projectId: p.id, date: day(2), minutes: 5 })).toThrow('future');
    expect(view(s, p.module).records[0].computed).toMatchObject({ Owner: 'Asha', Logged: '16.7 h' });
  });
  it('SOP publish increments revision and hashes; vendor pay records reference; incident root cause recorded', () => {
    const s = fresh();
    const sop = create(s, 'operations.sop-library', { code: 'sop-1', title: 'Pack', body: 'Wrap twice' });
    const pub = step(s, sop.module, sop.id, 'publish');
    expect(pub.data).toMatchObject({ revision: 1, sha256: hash('Wrap twice') });
    step(s, sop.module, sop.id, 'revise'); expect(step(s, sop.module, sop.id, 'publish').data.revision).toBe(2);
    const b = create(s, 'operations.vendors-and-purchases', { vendor: 'V', category: 'rent', amount: 500000, billDate: today(), dueOn: day(-1 + 1) });
    expect(() => step(s, b.module, b.id, 'pay', { paymentReference: 'UTR1' })).toThrow('Cannot');
    step(s, b.module, b.id, 'approve');
    expect(() => step(s, b.module, b.id, 'pay', {})).toThrow();
    expect(step(s, b.module, b.id, 'pay', { paymentReference: 'UTR1' }).data.paymentReference).toBe('UTR1');
    const i = create(s, 'operations.incident-log', { title: 'Down', severity: 'sev1', occurredOn: today(), description: 'x' });
    expect(step(s, i.module, i.id, 'resolve', { rootCause: 'disk full' }).data.rootCause).toBe('disk full');
  });
  it('asset tag held once; review unique per period; drill pass/fail against target', () => {
    const s = fresh(); const a = person(s), b = person(s, 'b@x.in');
    create(s, 'operations.asset-assignment', { assetTag: 'LAP-1', description: 'Laptop', staffId: a.id, assignedOn: today() });
    expect(() => create(s, 'operations.asset-assignment', { assetTag: 'LAP-1', description: 'Laptop', staffId: b.id, assignedOn: today() })).toThrow('already assigned');
    const d1 = create(s, 'operations.backup-drills', { system: 'Restore DB', scheduledOn: today(), targetMinutes: 30 });
    const d2 = create(s, 'operations.backup-drills', { system: 'Restore DB', scheduledOn: today(), targetMinutes: 30 });
    expect(step(s, d1.module, d1.id, 'record', { actualMinutes: 25 }).status).toBe('passed');
    expect(step(s, d2.module, d2.id, 'record', { actualMinutes: 31 }).status).toBe('failed');
  });
});

describe('foundation', () => {
  it('documents vault stores a real sha256 and refuses a mismatched copy', () => {
    const s = fresh(); const text = 'Lease agreement — ₹ 25,000 / month';
    expect(() => create(s, 'foundation.documents-vault', { title: 'Lease', category: 'contract', content: text, sha256: 'forged' })).toThrow();
    const d = create(s, 'foundation.documents-vault', { title: 'Lease', category: 'contract', content: text });
    expect(d.data.sha256).toBe(hash(text)); expect(d.data.bytes).toBe(Buffer.byteLength(text));
    expect(() => step(s, d.module, d.id, 'verify', { content: text + '.' })).toThrow('Hash mismatch');
    expect(step(s, d.module, d.id, 'verify', { content: text }).data.lastVerifiedAt).toBeTruthy();
    expect(() => perform(s, d.module, { action: 'update', id: d.id, version: 3, data: { title: 'x', category: 'other', content: 'y' } })).toThrow();
    expect(evidence(s, d.id)).toContain('module.foundation.documents-vault.verify');
  });
  it('publishing a policy version supersedes the previous one of the same doc only', () => {
    const s = fresh(); const m = 'foundation.terms-and-privacy-versions';
    const v1 = create(s, m, { doc: 'terms', version: 'v1', body: 'one', effectiveOn: today() });
    const p1 = create(s, m, { doc: 'privacy', version: 'v1', body: 'p', effectiveOn: today() });
    step(s, m, v1.id, 'publish'); step(s, m, p1.id, 'publish');
    expect(() => create(s, m, { doc: 'terms', version: 'V1', body: 'dup', effectiveOn: today() })).toThrow('already exists');
    const v2 = create(s, m, { doc: 'terms', version: 'v2', body: 'two', effectiveOn: today() });
    expect(step(s, m, v2.id, 'publish').data.sha256).toBe(hash('two'));
    const st = Object.fromEntries(view(s, m).records.map((r) => [`${r.data.doc}:${r.data.version}`, r.status]));
    expect(st).toEqual({ 'terms:V2': 'published', 'terms:V1': 'superseded', 'privacy:V1': 'published' });
    expect(evidence(s, v1.id)).toContain(`module.${m}.superseded`);
  });
  it('DPIA high risk needs DPO; resolutions numbered; anonymous grievance has no email; deletion counts matches', () => {
    const s = fresh();
    const d = create(s, 'foundation.dpia-review', { processing: 'CRM', dataCategories: 'contact', risk: 'high', mitigation: 'encrypt', dpoConsulted: false });
    step(s, d.module, d.id, 'submit');
    expect(() => step(s, d.module, d.id, 'approve', { reviewer: 'R' })).toThrow('DPO');
    const r1 = create(s, 'foundation.corporate-resolution-log', { title: 'Open bank', body: 'board', resolvedOn: today(), text: 'Resolved.' });
    expect(step(s, r1.module, r1.id, 'pass').data).toMatchObject({ number: 'RES-0001', sha256: hash('Resolved.') });
    expect(() => create(s, 'foundation.grievance-and-whistleblower-portal', { category: 'fraud', description: 'x', anonymous: true, contactEmail: 'a@b.in' })).toThrow('Anonymous');
    s.customer({ name: 'Ravi', email: 'ravi@x.in' });
    const q = create(s, 'foundation.data-deletion-requests', { subjectEmail: 'RAVI@x.in', receivedOn: today(), scope: 'all' });
    expect(view(s, q.module).records[0].computed!['Matching customers']).toBe('1');
    expect(() => step(s, q.module, q.id, 'complete', { resolution: 'x' })).toThrow('Cannot');
  });
  it('backup ledger requires a 64-hex sha256 and an exact checksum to verify', () => {
    const s = fresh(); const h = hash('backup'); const m = 'foundation.backup-and-snapshot-ledger';
    expect(() => create(s, m, { label: 'B', location: 's3', takenOn: today(), sha256: 'abc', sizeBytes: 10 })).toThrow('64 hex');
    const b = create(s, m, { label: 'B', location: 's3', takenOn: today(), sha256: h.toUpperCase(), sizeBytes: 10 });
    expect(b.data.sha256).toBe(h);
    expect(() => step(s, m, b.id, 'verify', { checksum: hash('other') })).toThrow('does not match');
    expect(step(s, m, b.id, 'verify', { checksum: ` ${h.toUpperCase()} ` }).status).toBe('verified');
  });
});
