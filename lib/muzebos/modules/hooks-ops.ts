import { createHash } from 'node:crypto';
import { BusinessError, type BusinessStore } from '../store';
import { formatMoney, type ModuleRecord } from './types';
import { records, today } from './engine';
import type { Hooks } from './hooks';

const n = (v: unknown) => Number(v ?? 0);
const s = (v: unknown) => String(v ?? '');
const count = (recs: ModuleRecord[], st: string) => String(recs.filter((r) => r.status === st).length);
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const addDays = (d: string, k: number) => new Date(Date.parse(`${d}T00:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10);
export const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const until = (d: string) => { const k = days(today(), d); return k < 0 ? `overdue by ${-k} day(s)` : k === 0 ? 'today' : `in ${k} day(s)`; };
const notFuture = (d: unknown, label: string) => { if (s(d) > today()) throw new BusinessError(`${label} cannot be in the future`, 422); };
const label = (store: BusinessStore, moduleId: string, id: unknown, field: string) => { const r = records(store, moduleId).find((x) => x.id === id); return r ? s(r.data[field]) : 'missing'; };
const STAFF = 'operations.staff-management';
const seq = (store: BusinessStore, moduleId: string, prefix: string) => `${prefix}-${String(records(store, moduleId).filter((x) => x.data.number).length + 1).padStart(4, '0')}`;

export const OPS_HOOKS: Record<string, Hooks> = {
  'operations.staff-management': { unique: ['email'], validate: (_s, d) => ({ email: s(d.email).toLowerCase() }), stats: (_s, recs) => [{ label: 'Active', value: count(recs, 'active') }] },
  'operations.projects': {
    compute: (store, r): Record<string, string> => {
      const mins = records(store, 'operations.time-tracker').filter((t) => t.data.projectId === r.id && t.status !== 'voided').reduce((a, t) => a + n(t.data.minutes), 0);
      return { Owner: label(store, STAFF, r.data.ownerId, 'name'), Logged: `${(mins / 60).toFixed(1)} h`, ...(r.status === 'active' ? { Due: until(s(r.data.dueOn)) } : {}) };
    },
    stats: (_s, recs) => [{ label: 'Active', value: count(recs, 'active') }, { label: 'Active budget', value: formatMoney(recs.filter((r) => r.status === 'active').reduce((a, r) => a + n(r.data.budget), 0)) }],
  },
  'operations.attendance-and-leave': {
    validate: (store, d, existing) => {
      if (s(d.toDate) < s(d.fromDate)) throw new BusinessError('To must be on or after From', 422);
      const clash = records(store, 'operations.attendance-and-leave').find((r) => r.id !== existing?.id && r.data.staffId === d.staffId && ['requested', 'approved'].includes(r.status) && s(r.data.fromDate) <= s(d.toDate) && s(d.fromDate) <= s(r.data.toDate));
      if (clash) throw new BusinessError(`Overlaps an existing ${clash.status} request (${s(clash.data.fromDate)} to ${s(clash.data.toDate)})`, 409);
    },
    compute: (_s, r) => ({ Days: String(days(s(r.data.fromDate), s(r.data.toDate)) + 1) }),
    stats: (_s, recs) => [{ label: 'Pending', value: count(recs, 'requested') }, { label: 'Approved days', value: String(recs.filter((r) => r.status === 'approved').reduce((a, r) => a + days(s(r.data.fromDate), s(r.data.toDate)) + 1, 0)) }],
  },
  'operations.time-tracker': {
    validate: (store, d, existing) => {
      notFuture(d.date, 'Date');
      const same = records(store, 'operations.time-tracker').filter((r) => r.id !== existing?.id && r.status !== 'voided' && r.data.staffId === d.staffId && r.data.date === d.date).reduce((a, r) => a + n(r.data.minutes), 0);
      if (same + n(d.minutes) > 1440) throw new BusinessError(`That would exceed 24 hours on ${s(d.date)} (${same} minutes already logged)`, 422);
    },
    stats: (_s, recs) => [{ label: 'Hours logged', value: (recs.filter((r) => r.status !== 'voided').reduce((a, r) => a + n(r.data.minutes), 0) / 60).toFixed(1) }],
  },
  'operations.meeting-notes': { transition: (_s, r, t) => (t === 'finalise' ? { data: { sha256: sha256(`${s(r.data.notes)}\n${s(r.data.decisions)}`) } } : undefined) },
  'operations.sop-library': {
    unique: ['code'],
    transition: (_s, r, t) => (t === 'publish' ? { data: { revision: n(r.data.revision) + 1, sha256: sha256(s(r.data.body)) } } : undefined),
    stats: (_s, recs) => [{ label: 'Published', value: count(recs, 'published') }, { label: 'Drafts', value: count(recs, 'draft') }],
  },
  'operations.vendors-and-purchases': {
    validate: (_s, d) => { if (s(d.dueOn) < s(d.billDate)) throw new BusinessError('Due on must be on or after the bill date', 422); },
    compute: (_s, r): Record<string, string> => (['recorded', 'approved'].includes(r.status) ? { Due: until(s(r.data.dueOn)) } : {}),
    stats: (_s, recs) => { const open = recs.filter((r) => ['recorded', 'approved'].includes(r.status)); return [{ label: 'Outstanding', value: formatMoney(open.reduce((a, r) => a + n(r.data.amount), 0)) }, { label: 'Overdue', value: formatMoney(open.filter((r) => s(r.data.dueOn) < today()).reduce((a, r) => a + n(r.data.amount), 0)) }]; },
  },
  'operations.incident-log': {
    validate: (_s, d) => notFuture(d.occurredOn, 'Occurred on'),
    compute: (_s, r): Record<string, string> => (r.status !== 'resolved' ? { 'Open for': `${days(s(r.data.occurredOn), today())} day(s)` } : {}),
    stats: (_s, recs) => [{ label: 'Open', value: String(recs.filter((r) => r.status !== 'resolved').length) }, { label: 'Open sev1/sev2', value: String(recs.filter((r) => r.status !== 'resolved' && ['sev1', 'sev2'].includes(s(r.data.severity))).length) }],
  },
  'operations.onboarding-checklist': {
    compute: (store, r): Record<string, string> => {
      const mine = records(store, r.module).filter((x) => x.data.staffId === r.data.staffId);
      return { Progress: `${mine.filter((x) => x.status !== 'pending').length}/${mine.length} for ${label(store, STAFF, r.data.staffId, 'name')}`, ...(r.status === 'pending' ? { Due: until(s(r.data.dueOn)) } : {}) };
    },
  },
  'operations.asset-assignment': {
    validate: (store, d, existing) => {
      notFuture(d.assignedOn, 'Assigned on');
      const held = records(store, 'operations.asset-assignment').find((r) => r.id !== existing?.id && r.status === 'assigned' && r.data.assetTag === d.assetTag);
      if (held) throw new BusinessError(`Asset ${s(d.assetTag)} is already assigned to ${label(store, STAFF, held.data.staffId, 'name')}`, 409);
    },
    stats: (_s, recs) => [{ label: 'Assigned', value: count(recs, 'assigned') }, { label: 'Lost', value: count(recs, 'lost') }],
  },
  'operations.performance-review': { unique: ['staffId+period'], stats: (_s, recs) => [{ label: 'Submitted', value: String(recs.filter((r) => r.status !== 'draft').length) }] },
  'operations.backup-drills': {
    transition: (_s, r, t, input) => (t === 'record' ? { status: n(input.actualMinutes) <= n(r.data.targetMinutes) ? 'passed' : 'failed', data: { actualMinutes: n(input.actualMinutes) } } : undefined),
    stats: (_s, recs) => [{ label: 'Passed', value: count(recs, 'passed') }, { label: 'Failed', value: count(recs, 'failed') }],
  },
  'operations.compliance-checklist': {
    compute: (_s, r): Record<string, string> => (r.status === 'open' ? { Due: until(s(r.data.dueOn)) } : {}),
    stats: (_s, recs) => [{ label: 'Open', value: count(recs, 'open') }, { label: 'Overdue', value: String(recs.filter((r) => r.status === 'open' && s(r.data.dueOn) < today()).length) }],
  },
  'foundation.documents-vault': {
    validate: (_s, d) => ({ sha256: sha256(s(d.content)), bytes: Buffer.byteLength(s(d.content), 'utf8') }),
    transition: (_s, r, t, input) => {
      if (t !== 'verify') return;
      const got = sha256(s(input.content));
      if (got !== r.data.sha256) throw new BusinessError(`Hash mismatch: the copy hashes to ${got.slice(0, 12)}..., stored ${s(r.data.sha256).slice(0, 12)}...`, 422);
      return { data: { lastVerifiedAt: new Date().toISOString() } };
    },
    compute: (_s, r) => ({ Bytes: String(r.data.bytes), 'Last verified': s(r.data.lastVerifiedAt) || 'never' }),
    stats: (_s, recs) => [{ label: 'Documents', value: count(recs, 'active') }],
  },
  'foundation.terms-and-privacy-versions': {
    unique: ['doc+version'],
    transition: (store, r, t) => {
      if (t !== 'publish') return;
      for (const prev of records(store, r.module).filter((x) => x.id !== r.id && x.status === 'published' && x.data.doc === r.data.doc)) {
        store.db.prepare("UPDATE mb_module_records SET status='superseded', version=version+1, updatedAt=? WHERE id=?").run(new Date().toISOString(), prev.id);
        store.appendEvidence(`module.${r.module}.superseded`, prev.id, `superseded by ${s(r.data.version)}`);
      }
      return { data: { sha256: sha256(s(r.data.body)) } };
    },
  },
  'foundation.trademark-and-ip-tracker': {
    compute: (_s, r): Record<string, string> => (r.status !== 'lapsed' ? { Renewal: until(s(r.data.renewalDue)) } : {}),
    stats: (_s, recs) => [{ label: 'Renewals in 90 days', value: String(recs.filter((r) => r.status !== 'lapsed' && days(today(), s(r.data.renewalDue)) <= 90).length) }],
  },
  'foundation.license-and-permit-registry': {
    compute: (_s, r): Record<string, string> => { const k = days(today(), s(r.data.expiresOn)); return r.status === 'active' ? { Validity: k < 0 ? `expired ${-k} day(s) ago` : k <= 30 ? `expiring in ${k} day(s)` : `valid (${k} days)` } : {}; },
    stats: (_s, recs) => { const a = recs.filter((r) => r.status === 'active'); return [{ label: 'Expired', value: String(a.filter((r) => s(r.data.expiresOn) < today()).length) }, { label: 'Expiring in 30 days', value: String(a.filter((r) => { const k = days(today(), s(r.data.expiresOn)); return k >= 0 && k <= 30; }).length) }]; },
  },
  'foundation.dpia-review': {
    transition: (_s, r, t) => { if (t === 'approve' && r.data.risk === 'high' && !r.data.dpoConsulted) throw new BusinessError('High-risk processing needs DPO consultation before approval', 409); },
  },
  'foundation.corporate-resolution-log': {
    validate: (_s, d) => notFuture(d.resolvedOn, 'Resolved on'),
    transition: (store, r, t) => (t === 'pass' ? { data: { number: seq(store, r.module, 'RES'), sha256: sha256(s(r.data.text)) } } : undefined),
  },
  'foundation.grievance-and-whistleblower-portal': {
    validate: (_s, d) => { if (d.anonymous && d.contactEmail) throw new BusinessError('Anonymous reports cannot carry a contact email', 422); },
    stats: (_s, recs) => [{ label: 'Open', value: String(recs.filter((r) => r.status !== 'closed').length) }],
  },
  'foundation.data-deletion-requests': {
    validate: (_s, d) => { notFuture(d.receivedOn, 'Received on'); return { subjectEmail: s(d.subjectEmail).toLowerCase() }; },
    compute: (store, r): Record<string, string> => ({ 'Matching customers': String(store.customers().filter((c) => (c.email ?? '').toLowerCase() === r.data.subjectEmail).length), ...(['received', 'verified'].includes(r.status) ? { 'Indicative due': `${addDays(s(r.data.receivedOn), 30)} (${until(addDays(s(r.data.receivedOn), 30))})` } : {}) }),
    stats: (_s, recs) => [{ label: 'Open', value: String(recs.filter((r) => ['received', 'verified'].includes(r.status)).length) }],
  },
  'foundation.backup-and-snapshot-ledger': {
    validate: (_s, d) => { notFuture(d.takenOn, 'Taken on'); const h = s(d.sha256).toLowerCase(); if (!/^[0-9a-f]{64}$/.test(h)) throw new BusinessError('SHA-256 must be 64 hex characters', 422); return { sha256: h }; },
    transition: (_s, r, t, input) => {
      if (t !== 'verify') return;
      if (s(input.checksum).trim().toLowerCase() !== r.data.sha256) throw new BusinessError('Checksum does not match the recorded SHA-256', 422);
      return { data: { verifiedOn: today() } };
    },
    stats: (_s, recs) => [{ label: 'Verified', value: count(recs, 'verified') }, { label: 'Unverified', value: count(recs, 'recorded') }],
  },
};
