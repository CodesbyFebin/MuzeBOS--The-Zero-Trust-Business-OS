/**
 * Sales pipeline with win probability and a weighted forecast. Clean-room design based on the
 * observed behaviour of coreBOS (potentials with sales stages) and boombignose-erp-harness-ai
 * (AGPL-3.0; behaviour only, no code or text used). Money is integer minor units (paise).
 * Built during the Meta Global AI Developer Hackathon.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { BusinessError, type BusinessStore } from '../store';
import { InferenceStore } from '../inference/store';
import { routes, fingerprint } from '../inference/routing';
import { runtimeEnv } from '@/lib/creds';

type Env = Record<string, string | undefined>;
export const STAGES = ['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost'] as const;
export type Stage = typeof STAGES[number];
/** Default win probability per stage (percent). A deal can override it while open. */
export const STAGE_PROBABILITY: Record<Stage, number> = { lead: 10, qualified: 25, proposal: 50, negotiation: 75, won: 100, lost: 0 };
const OPEN: Stage[] = ['lead', 'qualified', 'proposal', 'negotiation'];
export type Deal = { id: string; title: string; customerId: string | null; amount: number; stage: Stage; probability: number | null; expectedClose: string | null; createdAt: string; updatedAt: string };
export type DealEvent = { id: string; dealId: string; fromStage: string | null; toStage: string; note: string; createdAt: string };

const money = z.number().int().min(0).max(100_000_000_000);
const DealInput = z.object({ title: z.string().trim().min(2).max(200), customerId: z.string().max(64).nullable().default(null), amount: money, stage: z.enum(OPEN as [Stage, ...Stage[]]).default('lead'), probability: z.number().int().min(0).max(100).nullable().default(null), expectedClose: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null) }).strict();

function ensure(s: BusinessStore) {
  s.db.exec(`CREATE TABLE IF NOT EXISTS mb_deals (id TEXT PRIMARY KEY, title TEXT NOT NULL, customerId TEXT, amount INTEGER NOT NULL CHECK(amount >= 0), stage TEXT NOT NULL, probability INTEGER, expectedClose TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mb_deal_events (id TEXT PRIMARY KEY, dealId TEXT NOT NULL, fromStage TEXT, toStage TEXT NOT NULL, note TEXT NOT NULL, createdAt TEXT NOT NULL);`);
}
export const winProbability = (d: Pick<Deal, 'stage' | 'probability'>) => (OPEN.includes(d.stage) && d.probability !== null ? d.probability : STAGE_PROBABILITY[d.stage]);
export const weighted = (d: Deal) => Math.round((d.amount * winProbability(d)) / 100);

export function createDeal(s: BusinessStore, raw: unknown): Deal {
  ensure(s); const d = DealInput.parse(raw);
  if (d.customerId && !s.customers().some((c) => c.id === d.customerId)) throw new BusinessError('Unknown customer', 404);
  const t = new Date().toISOString(); const deal: Deal = { id: randomUUID(), ...d, createdAt: t, updatedAt: t };
  s.transact(() => { s.db.prepare('INSERT INTO mb_deals VALUES (?,?,?,?,?,?,?,?,?)').run(deal.id, deal.title, deal.customerId, deal.amount, deal.stage, deal.probability, deal.expectedClose, t, t); s.db.prepare('INSERT INTO mb_deal_events VALUES (?,?,?,?,?,?)').run(randomUUID(), deal.id, null, deal.stage, 'created', t); s.appendEvidence('deal.created', deal.id, `${deal.title} ${deal.amount}`); });
  return deal;
}
export function getDeal(s: BusinessStore, id: string): Deal { ensure(s); const d = s.db.prepare('SELECT * FROM mb_deals WHERE id=?').get(id) as Deal | undefined; if (!d) throw new BusinessError('Deal not found', 404); return d; }
export function dealEvents(s: BusinessStore, id: string): DealEvent[] { ensure(s); return s.db.prepare('SELECT * FROM mb_deal_events WHERE dealId=? ORDER BY createdAt, rowid').all(id) as DealEvent[]; }
export function listDeals(s: BusinessStore): Deal[] { ensure(s); return s.db.prepare('SELECT * FROM mb_deals ORDER BY updatedAt DESC, rowid DESC').all() as Deal[]; }

/** Moves an open deal. Won and lost are terminal; reopening needs a new deal so history is never rewritten. */
export function moveDeal(s: BusinessStore, id: string, raw: unknown): Deal {
  const c = z.object({ stage: z.enum(STAGES), note: z.string().trim().max(500).default(''), probability: z.number().int().min(0).max(100).nullable().optional() }).strict().parse(raw);
  const d = getDeal(s, id);
  if (!OPEN.includes(d.stage)) throw new BusinessError(`Deal is ${d.stage}; closed deals cannot move`, 409);
  if (c.stage === 'lost' && !c.note) throw new BusinessError('Say why the deal was lost', 400);
  const t = new Date().toISOString(); const prob = OPEN.includes(c.stage) ? (c.probability === undefined ? d.probability : c.probability) : null;
  s.transact(() => { s.db.prepare('UPDATE mb_deals SET stage=?, probability=?, updatedAt=? WHERE id=?').run(c.stage, prob, t, id); s.db.prepare('INSERT INTO mb_deal_events VALUES (?,?,?,?,?,?)').run(randomUUID(), id, d.stage, c.stage, c.note, t); s.appendEvidence('deal.moved', id, `${d.stage} -> ${c.stage}`); });
  return getDeal(s, id);
}

export type PipelineSummary = { open: number; openAmount: number; weightedAmount: number; byStage: Record<Stage, { count: number; amount: number; weighted: number }>; winRate: number | null; won: number; lost: number };
export function pipelineSummary(s: BusinessStore): PipelineSummary {
  const deals = listDeals(s); const byStage = Object.fromEntries(STAGES.map((st) => [st, { count: 0, amount: 0, weighted: 0 }])) as PipelineSummary['byStage'];
  for (const d of deals) { const b = byStage[d.stage]; b.count++; b.amount += d.amount; b.weighted += weighted(d); }
  const open = deals.filter((d) => OPEN.includes(d.stage)); const won = byStage.won.count; const lost = byStage.lost.count;
  return { open: open.length, openAmount: open.reduce((a, d) => a + d.amount, 0), weightedAmount: open.reduce((a, d) => a + weighted(d), 0), byStage, winRate: won + lost ? Math.round((won / (won + lost)) * 100) : null, won, lost };
}

/** Muse Spark next-step coach: files a gated inference draft with the deal's facts and its history. */
export function requestNextStep(s: BusinessStore, dealId: string, opts: { env?: Env; lane?: 'meta' | 'baseten'; paidConsent?: boolean } = {}) {
  const d = getDeal(s, dealId); const facts = JSON.stringify({ title: d.title, amountMinor: d.amount, stage: d.stage, winProbabilityPct: winProbability(d), expectedClose: d.expectedClose, history: dealEvents(s, d.id).map((e) => ({ to: e.toStage, note: e.note })) });
  return new InferenceStore(s, () => routes(opts.env ?? runtimeEnv())).create({ title: `Deal next step: ${d.title.slice(0, 120)}`, prompt: `You coach a small-business founder on one sales deal. Using only these facts, suggest the single next step and a realistic win probability. Return exactly {"nextStep":"...","probability":0-100}, no markdown. Facts: ${facts}`, kind: 'draft', lane: opts.lane ?? 'meta', maxTokens: 256, paidConsent: !!opts.paidConsent });
}
const NextStep = z.object({ nextStep: z.string().trim().min(3).max(400), probability: z.number().int().min(0).max(100) }).strict();
/** Reads an approved, completed coach draft. Advice only: it never changes the deal. */
export function readNextStep(s: BusinessStore, taskId: string, opts: { env?: Env } = {}) {
  const t = new InferenceStore(s, () => routes(opts.env ?? runtimeEnv())).task(taskId);
  if (t.state !== 'completed' || t.approvedHash !== t.hash || fingerprint(t.payload) !== t.hash || !t.output || fingerprint(t.output) !== t.outputHash) throw new BusinessError('An approved, completed draft with intact evidence is required', 409);
  try { return { ...NextStep.parse(JSON.parse(t.output)), source: t.payload.model, applied: false as const }; } catch { throw new BusinessError('Draft was not exactly the expected JSON; nothing changed', 422); }
}
