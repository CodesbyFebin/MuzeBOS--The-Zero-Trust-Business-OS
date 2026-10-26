import { createHash } from 'node:crypto';
import { BusinessError } from '../store';
import { QUEUED_LABEL } from './types';
import type { Hooks } from './hooks';
import { PROVIDER_MODULES } from './catalog-providers';
const n = (v: unknown) => Number(v ?? 0);
/** Approval binds a sha256 of the user payload; the item stays queued, never sent. */
const outbox: Hooks = {
  transition: (_s, r, t) => {
    if (t !== 'queue') return;
    const payload = Object.fromEntries(Object.entries(r.data).filter(([k]) => !['payloadHash', 'approvedAt'].includes(k)).sort(([a], [b]) => a.localeCompare(b)));
    return { data: { payloadHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'), approvedAt: new Date().toISOString() } };
  },
  compute: (_s, r) => ({ Dispatch: r.status === 'queued' ? QUEUED_LABEL : r.status === 'cancelled' ? 'cancelled, nothing sent' : 'draft, not approved' }),
  stats: (_s, recs) => [{ label: 'Queued (not sent)', value: String(recs.filter((r) => r.status === 'queued').length) }, { label: 'Sent', value: '0' }],
};
const extra: Record<string, Hooks> = {
  'money.payment-link-generator': { validate: (store, d) => { const inv = store.invoices().find((i) => i.id === d.invoiceId); if (!inv) throw new BusinessError('Invoice not found', 422); return { amount: inv.payload.total }; } },
  'talk.web-chat-widget': { unique: ['domain'], validate: (_s, d) => { if (!/^#[0-9a-fA-F]{6}$/.test(String(d.color))) throw new BusinessError('Colour must be #rrggbb', 422); } },
  'money.upi-autopay-mandate': { validate: (_s, d) => { if (!/^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(String(d.vpa))) throw new BusinessError('UPI id must look like name@bank', 422); } },
  'money.splitter-and-escrow': { validate: (_s, d) => { if (n(d.splitBps) < 0 || n(d.splitBps) > 10000) throw new BusinessError('Split must be 0-10000 bps', 422); } },
  'builder.domain-and-dns-manager': { unique: ['type+name+value'] },
  'operations.payroll-and-staff-payments': { unique: ['staffId+month'], validate: (_s, d) => { if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(d.month))) throw new BusinessError('Month must be YYYY-MM', 422); } },
  'foundation.regulatory-reporting-dispatcher': { unique: ['form+period'], validate: (_s, d) => { if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(d.period))) throw new BusinessError('Period must be YYYY-MM', 422); } },
  'operations.shipping-and-delivery': { validate: (_s, d) => { if (!/^\d{6}$/.test(String(d.pincode))) throw new BusinessError('PIN code must be 6 digits', 422); } },
  'brain.model-router': { unique: ['task'] },
};
export const PROVIDER_HOOKS: Record<string, Hooks> = Object.fromEntries(PROVIDER_MODULES.map((m) => [m.id, { ...outbox, ...extra[m.id] }]));
