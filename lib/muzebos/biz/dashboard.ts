/**
 * Founder dashboard computed only from records in this workspace: issued invoices, manually
 * reconciled payments, approved expenses, the open pipeline and an owner-entered cash balance.
 * Nothing is estimated from outside data. Clean-room design based on the observed behaviour of
 * boombignose-erp-harness-ai's dashboard (AGPL-3.0; behaviour only, no code).
 * Built during the Meta Global AI Developer Hackathon.
 */
import { z } from 'zod';
import { BusinessError, type BusinessStore } from '../store';
import { InferenceStore } from '../inference/store';
import { routes, fingerprint } from '../inference/routing';
import { runtimeEnv } from '@/lib/creds';
import { listExpenses } from './expenses';
import { pipelineSummary } from './pipeline';
import { member } from './members';

type Env = Record<string, string | undefined>;
const month = (iso: string) => iso.slice(0, 7);
const lastMonths = (now: Date, n: number) => Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1 - i), 1)); return d.toISOString().slice(0, 7); });

export function setCash(s: BusinessStore, actorId: string, raw: unknown) {
  if (member(s, actorId).role !== 'owner') throw new BusinessError('Only an owner can set the cash balance', 403);
  const c = z.object({ amount: z.number().int().min(-100_000_000_000).max(100_000_000_000), asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().parse(raw);
  s.transact(() => { s.db.prepare("INSERT INTO mb_settings(key,value) VALUES('finance.cash',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(c)); s.appendEvidence('finance.cash.set', 'finance.cash', `${c.amount} as of ${c.asOf} by ${actorId}`); });
  return c;
}
export function cash(s: BusinessStore): { amount: number; asOf: string } | null { const r = s.db.prepare("SELECT value FROM mb_settings WHERE key='finance.cash'").get() as { value: string } | undefined; return r ? JSON.parse(r.value) : null; }

export type Dashboard = {
  months: { month: string; invoiced: number; collected: number; expenses: number }[];
  cash: { amount: number; asOf: string } | null;
  avgInvoiced: number; avgCollected: number; avgExpenses: number; netBurn: number;
  runwayMonths: number | null; runwayNote: string;
  recurringRevenue: number; recurringCustomers: number; recurringNote: string;
  receivables: number; pendingExpenses: number;
  pipeline: { open: number; openAmount: number; weightedAmount: number; winRate: number | null };
};

export function founderDashboard(s: BusinessStore, now = new Date()): Dashboard {
  const ms = lastMonths(now, 6); const rows = Object.fromEntries(ms.map((m) => [m, { month: m, invoiced: 0, collected: 0, expenses: 0 }]));
  const invoices = s.invoices();
  for (const i of invoices) { const r = rows[month(i.createdAt)]; if (!r) continue; r.invoiced += i.payload.total; if (i.payment === 'manually_reconciled') r.collected += i.payload.total; }
  const exps = listExpenses(s);
  for (const e of exps) { const r = rows[month(e.spentOn)]; if (r && e.status === 'approved') r.expenses += e.amount; }
  const months = ms.map((m) => rows[m]); const last3 = months.slice(-4, -1); // last three complete months
  const avg = (k: 'invoiced' | 'collected' | 'expenses') => Math.round(last3.reduce((a, r) => a + r[k], 0) / 3);
  const avgInvoiced = avg('invoiced'), avgCollected = avg('collected'), avgExpenses = avg('expenses'); const netBurn = avgExpenses - avgCollected;
  const c = cash(s);
  const runwayMonths = c && netBurn > 0 ? Math.max(0, Math.round((c.amount / netBurn) * 10) / 10) : null;
  const runwayNote = !c ? 'Enter your cash balance to see runway.' : netBurn <= 0 ? 'Collected revenue covers approved expenses over the last three complete months.' : `${runwayMonths} months at the current net burn.`;
  // Recurring revenue: customers invoiced in at least 2 of the last 3 complete months; their average monthly invoiced total.
  const per = new Map<string, Record<string, number>>(); const set3 = new Set(last3.map((r) => r.month));
  for (const i of invoices) { const m = month(i.createdAt); if (!set3.has(m)) continue; const k = i.payload.customer.id; const o = per.get(k) ?? {}; o[m] = (o[m] ?? 0) + i.payload.total; per.set(k, o); }
  let recurringRevenue = 0, recurringCustomers = 0; for (const o of per.values()) if (Object.keys(o).length >= 2) { recurringCustomers++; recurringRevenue += Math.round(Object.values(o).reduce((a, b) => a + b, 0) / 3); }
  const p = pipelineSummary(s);
  return { months, cash: c, avgInvoiced, avgCollected, avgExpenses, netBurn, runwayMonths, runwayNote, recurringRevenue, recurringCustomers,
    recurringNote: 'Repeat-customer revenue: customers invoiced in at least 2 of the last 3 complete months, averaged per month. MuzeBOS has no subscriptions, so this is an MRR proxy, not contracted MRR.',
    receivables: invoices.filter((i) => i.payment === 'pending').reduce((a, i) => a + i.payload.total, 0), pendingExpenses: exps.filter((e) => e.status === 'submitted').reduce((a, e) => a + e.amount, 0),
    pipeline: { open: p.open, openAmount: p.openAmount, weightedAmount: p.weightedAmount, winRate: p.winRate } };
}

/** Muse Wonder founder brief: a gated inference draft over the dashboard numbers only. */
export function requestFounderBrief(s: BusinessStore, opts: { env?: Env; lane?: 'meta' | 'baseten'; paidConsent?: boolean; now?: Date } = {}) {
  const d = founderDashboard(s, opts.now);
  return new InferenceStore(s, () => routes(opts.env ?? runtimeEnv())).create({ title: 'Founder brief from dashboard numbers', prompt: `You advise a solo founder. Amounts are integer paise. Using only these numbers (do not invent any), write a 2-3 sentence summary and up to 3 concrete risks. Return exactly {"summary":"...","risks":["..."]}, no markdown. Numbers: ${JSON.stringify(d)}`, kind: 'draft', lane: opts.lane ?? 'meta', maxTokens: 512, paidConsent: !!opts.paidConsent });
}
const BriefSchema = z.object({ summary: z.string().trim().min(10).max(1200), risks: z.array(z.string().trim().min(3).max(300)).max(3) }).strict();
export function readFounderBrief(s: BusinessStore, taskId: string, opts: { env?: Env } = {}) {
  const t = new InferenceStore(s, () => routes(opts.env ?? runtimeEnv())).task(taskId);
  if (t.state !== 'completed' || t.approvedHash !== t.hash || fingerprint(t.payload) !== t.hash || !t.output || fingerprint(t.output) !== t.outputHash) throw new BusinessError('An approved, completed draft with intact evidence is required', 409);
  try { return { ...BriefSchema.parse(JSON.parse(t.output)), source: t.payload.model }; } catch { throw new BusinessError('Draft was not exactly the expected JSON', 422); }
}
