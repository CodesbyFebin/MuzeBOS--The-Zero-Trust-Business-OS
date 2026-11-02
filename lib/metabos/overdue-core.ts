/**
 * Gate 3 core: find overdue invoices from stored records only, cite the fields used,
 * state what is uncertain, and validate a reminder draft in code. Pure (no network, no engine import).
 */
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { BusinessStore } from './store';

export const DEFAULT_TERMS_DAYS = 30;
export const DAY_MS = 86_400_000;

export type Citation = { record: string; field: string; value: string };
export type OverdueFinding = {
  invoiceId: string; number: string; customerName: string; customerEmail: string;
  total: number; amountText: string; currency: 'INR';
  createdAt: string; dueAt: string; termsDays: number; termsSource: 'configured' | 'assumed_default';
  daysOverdue: number; payment: 'pending'; reference: null;
  citations: Citation[]; uncertainty: string[];
};

export const amountText = (minor: number) => `INR ${(minor / 100).toFixed(2)}`;

export function termsDays(store: BusinessStore): { days: number; source: 'configured' | 'assumed_default' } {
  const row = store.db.prepare("SELECT value FROM mb_settings WHERE key='invoice.termsDays'").get() as { value: string } | undefined;
  const n = row ? Number(row.value) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= 365 ? { days: n, source: 'configured' } : { days: DEFAULT_TERMS_DAYS, source: 'assumed_default' };
}

export function setTermsDays(store: BusinessStore, days: number) {
  const d = z.number().int().min(0).max(365).parse(days);
  return store.transact(() => {
    store.db.prepare("INSERT INTO mb_settings VALUES('invoice.termsDays',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(d));
    store.appendEvidence('invoice.terms.set', 'settings', `Payment terms set to ${d} days`);
    return { days: d };
  });
}

/** Pending invoices with no bank reference whose derived due date has passed. */
export function findOverdue(store: BusinessStore, nowMs = Date.now()): OverdueFinding[] {
  const terms = termsDays(store);
  return store.invoices().flatMap((inv) => {
    if (inv.payment !== 'pending' || inv.reference) return [];
    const created = Date.parse(inv.createdAt);
    if (!Number.isFinite(created)) return [];
    const due = created + terms.days * DAY_MS;
    if (due >= nowMs) return [];
    const r = `invoice ${inv.number}`;
    const uncertainty = [
      'No due date is stored on invoices; the due date is createdAt plus payment terms.',
      terms.source === 'assumed_default' ? `Payment terms are not configured; ${DEFAULT_TERMS_DAYS} days is an assumed default.` : `Payment terms: ${terms.days} days (configured).`,
      'Payment may have been received without a bank reference being recorded here.',
      'Partial payments are not tracked.',
    ];
    if (!inv.payload.customer.email) uncertainty.push('The customer has no email address on record.');
    return [{
      invoiceId: inv.id, number: inv.number, customerName: inv.payload.customer.name, customerEmail: inv.payload.customer.email,
      total: inv.payload.total, amountText: amountText(inv.payload.total), currency: 'INR',
      createdAt: inv.createdAt, dueAt: new Date(due).toISOString(), termsDays: terms.days, termsSource: terms.source,
      daysOverdue: Math.floor((nowMs - due) / DAY_MS), payment: 'pending', reference: null,
      citations: [
        { record: r, field: 'number', value: inv.number },
        { record: r, field: 'createdAt', value: inv.createdAt },
        { record: r, field: 'payment', value: inv.payment },
        { record: r, field: 'reference', value: 'not recorded' },
        { record: r, field: 'payload.total', value: amountText(inv.payload.total) },
        { record: r, field: 'payload.customer.email', value: inv.payload.customer.email || 'missing' },
      ],
      uncertainty,
    } satisfies OverdueFinding];
  }).sort((a, b) => b.daysOverdue - a.daysOverdue);
}

/** What a draft must look like. Model output is untrusted and must pass this exactly. */
export const DraftSchema = z.object({
  subject: z.string().trim().min(5).max(120),
  body: z.string().trim().min(40).max(1200),
}).strict();
export type Draft = z.infer<typeof DraftSchema>;

export function validateDraft(raw: unknown, f: Pick<OverdueFinding, 'number' | 'amountText'>): { ok: true; draft: Draft } | { ok: false; reasons: string[] } {
  const r = DraftSchema.safeParse(raw);
  if (!r.success) return { ok: false, reasons: r.error.issues.map((i) => `${i.path.join('.') || 'draft'}: ${i.message}`) };
  const d = r.data; const text = `${d.subject}\n${d.body}`; const reasons: string[] = [];
  if (!text.includes(f.number)) reasons.push(`must cite invoice number ${f.number}`);
  if (!text.includes(f.amountText)) reasons.push(`must state the stored amount ${f.amountText}`);
  if (/https?:\/\/|www\./i.test(text)) reasons.push('must not contain links');
  if (/\b(has been paid|payment (was )?received|legal action|lawsuit|court)\b/i.test(text)) reasons.push('must not claim payment or threaten legal action');
  if (/\{\{|\}\}|\[(name|amount|date)\]/i.test(text)) reasons.push('must not contain unfilled placeholders');
  return reasons.length ? { ok: false, reasons } : { ok: true, draft: d };
}

/** Deterministic template used in fixture mode (no model call). */
export function fixtureDraft(f: OverdueFinding, merchantName: string): Draft {
  return {
    subject: `Reminder: invoice ${f.number} (${f.amountText})`,
    body: `Hello ${f.customerName},\n\nOur records show invoice ${f.number} for ${f.amountText}, issued ${f.createdAt.slice(0, 10)}, is still marked unpaid and was due ${f.dueAt.slice(0, 10)}. If you have already paid, please reply with the bank reference so we can update our records.\n\nThank you,\n${merchantName || 'Accounts'}`,
  };
}

export const draftHash = (d: Draft) => createHash('sha256').update(JSON.stringify({ subject: d.subject, body: d.body })).digest('hex');

/** Workflow input: the exact draft a person approves. */
export const OverdueReminderInput = z.object({
  invoiceId: z.string().uuid(),
  to: z.string().email().max(254),
  subject: DraftSchema.shape.subject,
  body: DraftSchema.shape.body,
  mode: z.enum(['live', 'fixture']),
  model: z.string().max(120).nullable(),
  draftHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type OverdueReminderInputT = z.infer<typeof OverdueReminderInput>;

/** Plan recomputed from the store at approval and at execution; a paid or changed invoice changes the hash. */
export function overduePlan(store: BusinessStore, input: OverdueReminderInputT) {
  const inv = store.invoices().find((i) => i.id === input.invoiceId);
  if (!inv) return { invoice: null, stillOverdue: false };
  const terms = termsDays(store);
  const dueAt = new Date(Date.parse(inv.createdAt) + terms.days * DAY_MS).toISOString();
  return {
    invoice: { number: inv.number, createdAt: inv.createdAt, dueAt, total: inv.payload.total, payment: inv.payment, reference: inv.reference, customerEmail: inv.payload.customer.email },
    stillOverdue: inv.payment === 'pending' && !inv.reference,
    recipientMatches: inv.payload.customer.email === input.to,
    draftMatches: draftHash({ subject: input.subject, body: input.body }) === input.draftHash,
    send: { to: input.to, subject: input.subject, body: input.body },
  };
}

export function ensureOutbound(store: BusinessStore) {
  store.db.exec(`CREATE TABLE IF NOT EXISTS mb_outbound(id TEXT PRIMARY KEY, runId TEXT NOT NULL UNIQUE, channel TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('queued','handed_off','failed')), detail TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)`);
}
export type Outbound = { id: string; runId: string; channel: string; recipient: string; subject: string; body: string; status: 'queued' | 'handed_off' | 'failed'; detail: string | null; createdAt: string; updatedAt: string };

/** Engine step for messages.send in the overdue workflow (synchronous, inside the step transaction). */
export function performOverdueSend(store: BusinessStore, runId: string, plan: ReturnType<typeof overduePlan>, senderConnected: boolean) {
  if (!plan.invoice || !plan.stillOverdue) throw new Error('Invoice is no longer overdue and unpaid; nothing sent');
  if (!plan.recipientMatches || !plan.draftMatches) throw new Error('Recipient or draft does not match the stored records; nothing sent');
  if (!senderConnected) {
    store.appendEvidence('overdue.reminder.not_sent', plan.invoice.number, 'Approved, but no sending integration is connected; nothing was sent');
    return { sent: false, reason: 'No sending integration is connected' };
  }
  ensureOutbound(store);
  const existing = store.db.prepare('SELECT id FROM mb_outbound WHERE runId=?').get(runId) as { id: string } | undefined;
  if (existing) return { sent: false, queued: true, outboundId: existing.id };
  const id = randomUUID(); const t = new Date().toISOString();
  store.db.prepare('INSERT INTO mb_outbound VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, runId, 'email', plan.send.to, plan.send.subject, plan.send.body, 'queued', null, t, t);
  store.appendEvidence('overdue.reminder.queued', plan.invoice.number, `Queued for the connected email integration (outbound ${id})`);
  return { sent: false, queued: true, outboundId: id };
}

/** A sender counts as connected only when a full inbox config (INBOX_n_HOST/USER/PASS) exists. */
export function senderConnectedFromEnv(env: Record<string, string | undefined> = process.env) {
  for (let i = 1; i <= 4; i++) if (env[`INBOX_${i}_HOST`] && env[`INBOX_${i}_USER`] && env[`INBOX_${i}_PASS`]) return true;
  return false;
}
