/**
 * Meta Model API spend cap and per-call ledger (SQLite, same business DB).
 * - Cap: integer minor units (USD cents) in mb_provider_spend_caps; default 5000 = USD 50.00 total. Owner-only edits (checked in the route).
 * - Prices: mb_model_prices, integer micro-USD per 1M tokens (so $0.002 = 2000). Rows checked against dev.meta.ai/docs/pricing-rate-limits on
 *   28 Oct 2026 are marked verified. A model with no verified row is costed at a conservative rate (the highest known
 *   rate) and flagged unverified everywhere it is shown.
 * - Costs are integer pico-USD (1e-12 USD): tokens x cents-per-1M is exact, so no float money.
 * - Before a call: reserve the worst case (every input char counted as one token + the full output budget, which per Meta
 *   docs includes reasoning tokens). The call is refused if spent + open reservations + this estimate > cap.
 * - After a call: settle with the real usage (uncached input, cached input, output incl. reasoning).
 */
import { randomUUID } from 'node:crypto';
import { BusinessError, type BusinessStore } from '@/lib/metabos/store';

export type Price = { model: string; cachedMicroUsdPerM: number; inputMicroUsdPerM: number; outputMicroUsdPerM: number; verified: boolean; source: string; checkedAt: string };
export const PRICE_SOURCE = 'https://dev.meta.ai/docs/pricing-rate-limits';
/** Verified from Meta docs per 1M tokens on 28 Oct 2026. Contributor mode: input $0.10, cached $0.002, output $0.20.
 *  Standard: Spark 1.3 input $1.25 / cached $0.15 / output $4.25; Wonder $4.00 / $0.20 / $20.00. */
const v = (model: string, cached: number, input: number, output: number) => ({ model, cachedMicroUsdPerM: cached, inputMicroUsdPerM: input, outputMicroUsdPerM: output, verified: true, source: PRICE_SOURCE });
export const VERIFIED_PRICES: Omit<Price, 'checkedAt'>[] = [
  v('muse-spark-1.3-contributor', 2_000, 100_000, 200_000),
  v('muse-spark-1.2-contributor', 2_000, 100_000, 200_000),
  v('muse-spark-1.3', 150_000, 1_250_000, 4_250_000),
  v('muse-wonder-1.0', 200_000, 4_000_000, 20_000_000),
];
/** Unknown model: price as the most expensive known text model, never cheaper. */
export const CONSERVATIVE: Omit<Price, 'model' | 'checkedAt'> = { cachedMicroUsdPerM: 4_000_000, inputMicroUsdPerM: 4_000_000, outputMicroUsdPerM: 20_000_000, verified: false, source: 'conservative estimate: no verified Meta price for this model' };
export const DEFAULT_CAP_MINOR = 5000;
/** pico-USD per cent. */
export const PER_CENT = 10_000_000_000;

export type MetaUsage = { promptTokens: number; cachedTokens: number; completionTokens: number; reasoningTokens: number };
export type CallRow = { id: string; model: string; taskClass: string; effort: string | null; api: string; state: 'reserved' | 'settled' | 'failed' | 'refused'; estimatePico: number; costPico: number; promptTokens: number | null; cachedTokens: number | null; completionTokens: number | null; reasoningTokens: number | null; priceVerified: number; note: string | null; createdAt: string; settledAt: string | null };

export function ensureMetaBudget(s: BusinessStore) {
  s.db.exec(`
    CREATE TABLE IF NOT EXISTS mb_provider_spend_caps(provider TEXT PRIMARY KEY, capMinor INTEGER NOT NULL CHECK(capMinor>=0), currency TEXT NOT NULL DEFAULT 'USD', updatedBy TEXT, updatedAt TEXT NOT NULL);
    INSERT OR IGNORE INTO mb_provider_spend_caps VALUES('meta', ${DEFAULT_CAP_MINOR}, 'USD', NULL, '1970-01-01T00:00:00.000Z');
    CREATE TABLE IF NOT EXISTS mb_model_prices(provider TEXT NOT NULL, model TEXT NOT NULL, cachedMicroUsdPerM INTEGER NOT NULL, inputMicroUsdPerM INTEGER NOT NULL, outputMicroUsdPerM INTEGER NOT NULL, verified INTEGER NOT NULL, source TEXT NOT NULL, checkedAt TEXT NOT NULL, PRIMARY KEY(provider, model));
    CREATE TABLE IF NOT EXISTS mb_model_calls(id TEXT PRIMARY KEY, provider TEXT NOT NULL, model TEXT NOT NULL, taskClass TEXT NOT NULL, effort TEXT, api TEXT NOT NULL, state TEXT NOT NULL, estimatePico INTEGER NOT NULL, costPico INTEGER NOT NULL DEFAULT 0, promptTokens INTEGER, cachedTokens INTEGER, completionTokens INTEGER, reasoningTokens INTEGER, priceVerified INTEGER NOT NULL, note TEXT, createdAt TEXT NOT NULL, settledAt TEXT);
    CREATE INDEX IF NOT EXISTS mb_model_calls_provider ON mb_model_calls(provider, state);
  `);
  const ins = s.db.prepare("INSERT OR IGNORE INTO mb_model_prices VALUES('meta',?,?,?,?,?,?,?)");
  for (const p of VERIFIED_PRICES) ins.run(p.model, p.cachedMicroUsdPerM, p.inputMicroUsdPerM, p.outputMicroUsdPerM, p.verified ? 1 : 0, p.source, '2026-10-28');
}

export function priceFor(s: BusinessStore, model: string): Price {
  ensureMetaBudget(s);
  const r = s.db.prepare("SELECT * FROM mb_model_prices WHERE provider='meta' AND model=?").get(model) as any;
  return r ? { model, cachedMicroUsdPerM: r.cachedMicroUsdPerM, inputMicroUsdPerM: r.inputMicroUsdPerM, outputMicroUsdPerM: r.outputMicroUsdPerM, verified: !!r.verified, source: r.source, checkedAt: r.checkedAt } : { model, ...CONSERVATIVE, checkedAt: '' };
}
export const estimatePico = (p: Price, inputChars: number, maxOutputTokens: number) => Math.ceil(inputChars) * p.inputMicroUsdPerM + maxOutputTokens * p.outputMicroUsdPerM;
export function costPico(p: Price, u: MetaUsage) {
  const cached = Math.min(u.cachedTokens, u.promptTokens);
  const output = Math.max(u.completionTokens, u.reasoningTokens); // Meta docs: reasoning tokens are billed as output and included in completion_tokens.
  return (u.promptTokens - cached) * p.inputMicroUsdPerM + cached * p.cachedMicroUsdPerM + output * p.outputMicroUsdPerM;
}

export function capMinor(s: BusinessStore) { ensureMetaBudget(s); return (s.db.prepare("SELECT capMinor FROM mb_provider_spend_caps WHERE provider='meta'").get() as { capMinor: number }).capMinor; }
export function setMetaCap(s: BusinessStore, actor: { id: string; role: string }, cap: number) {
  if (actor.role !== 'owner') throw new BusinessError('Only the owner can change the Meta spend cap', 403);
  if (!Number.isSafeInteger(cap) || cap < 0 || cap > 1_000_000) throw new BusinessError('Cap must be whole cents between 0 and 1000000', 422);
  ensureMetaBudget(s);
  s.transact(() => {
    s.db.prepare("UPDATE mb_provider_spend_caps SET capMinor=?, updatedBy=?, updatedAt=? WHERE provider='meta'").run(cap, actor.id, new Date().toISOString());
    s.appendEvidence('meta.cap.set', actor.id, `Meta Model API spend cap set to USD ${(cap / 100).toFixed(2)} (${cap} cents)`);
  });
  return metaBudget(s);
}

/** Committed = settled cost + open reservations + failed calls kept at their estimate (may have been billed). */
function committed(s: BusinessStore) {
  return (s.db.prepare("SELECT COALESCE(SUM(CASE WHEN state='reserved' THEN estimatePico ELSE costPico END),0) AS n FROM mb_model_calls WHERE provider='meta' AND state IN ('reserved','settled','failed')").get() as { n: number }).n;
}

export function reserveMetaCall(s: BusinessStore, o: { model: string; inputChars: number; maxOutputTokens: number; taskClass: string; effort: string | null; api: string }) {
  ensureMetaBudget(s);
  const price = priceFor(s, o.model);
  const est = estimatePico(price, o.inputChars, o.maxOutputTokens);
  const r = s.db.transaction(() => {
    const cap = capMinor(s) * PER_CENT; const used = committed(s);
    if (used + est > cap) {
      // Logged in the same transaction (not thrown) so the refusal row is kept.
      s.db.prepare("INSERT INTO mb_model_calls(id,provider,model,taskClass,effort,api,state,estimatePico,priceVerified,note,createdAt) VALUES(?,'meta',?,?,?,?,'refused',?,?,?,?)")
        .run(randomUUID(), o.model, o.taskClass, o.effort, o.api, est, price.verified ? 1 : 0, 'refused: would exceed cap; no request sent', new Date().toISOString());
      return { refused: `Meta spend cap reached: USD ${fmt(used)} committed of USD ${fmt(cap)}; this call could cost up to USD ${fmt(est)}. No request sent.` };
    }
    const id = randomUUID();
    s.db.prepare("INSERT INTO mb_model_calls(id,provider,model,taskClass,effort,api,state,estimatePico,priceVerified,createdAt) VALUES(?,'meta',?,?,?,?,'reserved',?,?,?)")
      .run(id, o.model, o.taskClass, o.effort, o.api, est, price.verified ? 1 : 0, new Date().toISOString());
    return { id, estimate: est, price };
  }).immediate();
  if ('refused' in r) throw new BusinessError(r.refused!, 402);
  return r;
}
export function settleMetaCall(s: BusinessStore, id: string, model: string, u: MetaUsage | null, note?: string) {
  const p = priceFor(s, model);
  const row = s.db.prepare('SELECT estimatePico FROM mb_model_calls WHERE id=?').get(id) as { estimatePico: number } | undefined;
  if (!row) return;
  // No usage reported on a 200: keep the reserved estimate as the cost (conservative).
  const cost = u ? costPico(p, u) : row.estimatePico;
  s.db.prepare("UPDATE mb_model_calls SET state='settled', costPico=?, promptTokens=?, cachedTokens=?, completionTokens=?, reasoningTokens=?, note=?, settledAt=? WHERE id=?")
    .run(cost, u?.promptTokens ?? null, u?.cachedTokens ?? null, u?.completionTokens ?? null, u?.reasoningTokens ?? null, note ?? (u ? null : 'no usage reported; estimate kept'), new Date().toISOString(), id);
}
/** billed=false for an HTTP refusal (no tokens served); true when the request may have run (timeout, dropped connection). */
export function failMetaCall(s: BusinessStore, id: string, billed: boolean, note: string) {
  s.db.prepare("UPDATE mb_model_calls SET state='failed', costPico=CASE WHEN ? THEN estimatePico ELSE 0 END, note=?, settledAt=? WHERE id=?").run(billed ? 1 : 0, note.slice(0, 200), new Date().toISOString(), id);
}

const fmt = (pico: number) => (pico / PER_CENT / 100).toFixed(pico < 100 * PER_CENT ? 6 : 2);
export function metaBudget(s: BusinessStore, limit = 20) {
  ensureMetaBudget(s);
  const cap = capMinor(s);
  const spent = (s.db.prepare("SELECT COALESCE(SUM(costPico),0) AS n FROM mb_model_calls WHERE provider='meta' AND state IN ('settled','failed')").get() as { n: number }).n;
  const reserved = (s.db.prepare("SELECT COALESCE(SUM(estimatePico),0) AS n FROM mb_model_calls WHERE provider='meta' AND state='reserved'").get() as { n: number }).n;
  const calls = s.db.prepare("SELECT * FROM mb_model_calls WHERE provider='meta' ORDER BY createdAt DESC LIMIT ?").all(limit) as CallRow[];
  const prices = (s.db.prepare("SELECT * FROM mb_model_prices WHERE provider='meta' ORDER BY model").all() as any[]).map((r) => ({ ...r, verified: !!r.verified }));
  return { currency: 'USD', capMinor: cap, spentPico: spent, reservedPico: reserved, spentUsd: fmt(spent), capUsd: (cap / 100).toFixed(2), calls, prices, conservative: CONSERVATIVE };
}
