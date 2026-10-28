/**
 * Gate 3 service: draft (fixture or bounded live Muse call), hand to Jev approval, dispatch
 * only through a connected integration. Every step leaves an evidence (Activity) record.
 */
import { z } from 'zod';
import { BusinessError, type BusinessStore } from './store';
import { META_MODELS, metaKey } from './ai/meta';
import { metaCall } from './ai/meta-call';
import { WorkflowEngine, OVERDUE_INVOICE_REMINDER } from './workflows';
import { draftHash, ensureOutbound, findOverdue, fixtureDraft, validateDraft, type Draft, type OverdueFinding, type Outbound } from './overdue-core';
export * from './overdue-core';

type Env = Record<string, string | undefined>;

/** Hard caps on any live draft call. Cost is enforced only when a price is configured; otherwise live is refused. */
export const DRAFT_LIMITS = { maxPromptChars: 2000, maxOutputTokens: 350, timeoutMs: 15_000, maxResponseBytes: 64_000, maxCallsPerDay: 20, maxUsdPerCall: 0.02, maxUsdPerDay: 0.25 } as const;

/** Spend limits an owner may lower or raise, stored in mb_settings. Never above these hard ceilings. */
export const SPEND_CEILINGS = { maxCallsPerDay: 200, maxUsdPerCall: 0.1, maxUsdPerDay: 2 } as const;
export const spendLimitsSchema = z.object({ maxCallsPerDay: z.number().int().min(0).max(SPEND_CEILINGS.maxCallsPerDay), maxUsdPerCall: z.number().min(0).max(SPEND_CEILINGS.maxUsdPerCall), maxUsdPerDay: z.number().min(0).max(SPEND_CEILINGS.maxUsdPerDay) }).strict();
export type SpendLimits = z.infer<typeof spendLimitsSchema> & { source: 'configured' | 'default' };
const LIMITS_KEY = 'overdue.limits';
export function spendLimits(store: BusinessStore): SpendLimits {
  const d = { maxCallsPerDay: DRAFT_LIMITS.maxCallsPerDay, maxUsdPerCall: DRAFT_LIMITS.maxUsdPerCall, maxUsdPerDay: DRAFT_LIMITS.maxUsdPerDay };
  const row = store.db.prepare('SELECT value FROM mb_settings WHERE key=?').get(LIMITS_KEY) as { value: string } | undefined;
  if (!row) return { ...d, source: 'default' };
  try { return { ...spendLimitsSchema.parse(JSON.parse(row.value)), source: 'configured' }; } catch { return { maxCallsPerDay: 0, maxUsdPerCall: 0, maxUsdPerDay: 0, source: 'configured' }; } // corrupt row fails closed
}
export function setSpendLimits(store: BusinessStore, actor: string, input: unknown): SpendLimits {
  const v = spendLimitsSchema.parse(input);
  if (v.maxUsdPerCall > v.maxUsdPerDay) throw new BusinessError('Per-call cap cannot exceed the daily cap', 422);
  store.transact(() => {
    store.db.prepare("INSERT INTO mb_settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(LIMITS_KEY, JSON.stringify(v));
    store.appendEvidence('overdue.limits.set', actor, `Live-call limits set: ${v.maxCallsPerDay} calls/day, USD ${v.maxUsdPerCall}/call, USD ${v.maxUsdPerDay}/day`);
  });
  return { ...v, source: 'configured' };
}

export type LiveGate = { available: boolean; reason: string; priceInPerMTok: number | null; priceOutPerMTok: number | null };

const day = (nowMs: number) => new Date(nowMs).toISOString().slice(0, 10);
type Spend = { calls: number; usd: number };
function spend(store: BusinessStore, nowMs: number): Spend {
  const row = store.db.prepare('SELECT value FROM mb_settings WHERE key=?').get(`overdue.spend.${day(nowMs)}`) as { value: string } | undefined;
  try { const v = row ? JSON.parse(row.value) : null; return v && Number.isFinite(v.calls) && Number.isFinite(v.usd) ? v : { calls: 0, usd: 0 }; } catch { return { calls: 0, usd: 0 }; }
}
function recordSpend(store: BusinessStore, nowMs: number, usd: number) {
  store.transact(() => {
    const s = spend(store, nowMs); const next = { calls: s.calls + 1, usd: Math.round((s.usd + usd) * 1e6) / 1e6 };
    store.db.prepare("INSERT INTO mb_settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(`overdue.spend.${day(nowMs)}`, JSON.stringify(next));
  });
}

const price = (v: string | undefined) => { const n = Number(v); return v && Number.isFinite(n) && n >= 0 ? n : null; };
export function liveGate(store: BusinessStore, env: Env = process.env, nowMs = Date.now()): LiveGate {
  const pin = price(env.META_PRICE_IN_PER_MTOK_USD), pout = price(env.META_PRICE_OUT_PER_MTOK_USD);
  const base = { priceInPerMTok: pin, priceOutPerMTok: pout };
  if (!metaKey(env)) return { available: false, reason: 'BLOCKED: no Meta model API key configured', ...base };
  if (pin === null || pout === null) return { available: false, reason: 'BLOCKED: model price not configured, so the cost cap cannot be enforced', ...base };
  const s = spend(store, nowMs); const L = spendLimits(store);
  if (s.calls >= L.maxCallsPerDay) return { available: false, reason: `Daily call cap reached (${L.maxCallsPerDay})`, ...base };
  if (worstCaseUsd(pin, pout) > L.maxUsdPerCall) return { available: false, reason: `Worst-case call cost exceeds the per-call cap (USD ${L.maxUsdPerCall})`, ...base };
  if (s.usd + worstCaseUsd(pin, pout) > L.maxUsdPerDay) return { available: false, reason: `Daily cost cap would be exceeded (USD ${L.maxUsdPerDay})`, ...base };
  return { available: true, reason: 'Live Muse draft allowed within caps', ...base };
}
/** Upper bound: every prompt char counted as one token, plus the full output budget. */
export const worstCaseUsd = (pin: number, pout: number) => (DRAFT_LIMITS.maxPromptChars * pin + DRAFT_LIMITS.maxOutputTokens * pout) / 1e6;

export type DraftResult = { mode: 'live' | 'fixture'; model: string | null; label: string; draft: Draft; draftHash: string; gate: LiveGate; finding: OverdueFinding; fallbackReason?: string };

const responseSchema = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string().min(1).max(8000) }), finish_reason: z.string().nullable().optional() })).min(1).max(4), usage: z.object({ prompt_tokens: z.number().int().min(0).max(100_000), completion_tokens: z.number().int().min(0).max(100_000) }).optional() });

export function findingFor(store: BusinessStore, invoiceId: string, nowMs = Date.now()) {
  const f = findOverdue(store, nowMs).find((x) => x.invoiceId === invoiceId);
  if (!f) throw new BusinessError('Invoice is not overdue and unpaid in the stored records', 409);
  if (!f.customerEmail) throw new BusinessError('Customer has no email address on record', 409);
  return f;
}

export async function draftReminder(store: BusinessStore, invoiceId: string, opts: { env?: Env; fetcher?: typeof fetch; nowMs?: number } = {}): Promise<DraftResult> {
  const env = opts.env ?? process.env, nowMs = opts.nowMs ?? Date.now();
  const finding = findingFor(store, invoiceId, nowMs); const merchant = store.merchant().name;
  const gate = liveGate(store, env, nowMs);
  const fixture = (fallbackReason?: string): DraftResult => { const d = fixtureDraft(finding, merchant); return { mode: 'fixture', model: null, label: 'FIXTURE — deterministic template, not model output', draft: d, draftHash: draftHash(d), gate, finding, fallbackReason }; };
  if (!gate.available) return fixture(gate.reason);
  const prompt = [`Write a short, polite payment reminder email. Return JSON {"subject","body"} only.`, `Invoice number: ${finding.number}`, `Amount (write exactly): ${finding.amountText}`, `Issued: ${finding.createdAt.slice(0, 10)}`, `Due (derived): ${finding.dueAt.slice(0, 10)}`, `Customer name: ${finding.customerName.slice(0, 80)}`, `Sender: ${merchant.slice(0, 80)}`, 'Do not include links, do not claim payment was received, do not threaten legal action. Ask them to reply with a bank reference if already paid.'].join('\n').slice(0, DRAFT_LIMITS.maxPromptChars);
  let usd = (prompt.length * gate.priceInPerMTok! + DRAFT_LIMITS.maxOutputTokens * gate.priceOutPerMTok!) / 1e6;
  try {
    // Static instructions first, invoice data last, so the provider's prompt cache can reuse the prefix.
    const sys = 'You draft business emails only. Output JSON only.\nWrite a short, polite payment reminder email. Return JSON {"subject","body"} only.\nDo not include links, do not claim payment was received, do not threaten legal action. Ask them to reply with a bank reference if already paid.';
    const vars = prompt.split('\n').filter((l) => /^(Invoice number|Amount|Issued|Due|Customer name|Sender):/.test(l)).join('\n');
    const r = await metaCall({ store, key: metaKey(env)!, messages: [{ role: 'system', content: sys }, { role: 'user', content: vars }], task: 'draft', model: META_MODELS.spark, maxOutputTokens: DRAFT_LIMITS.maxOutputTokens, fetch: opts.fetcher ?? fetch, signal: AbortSignal.timeout(DRAFT_LIMITS.timeoutMs), sideEffects: true, skipRules: true, maxRetries: 1 });
    if (r.text.length > DRAFT_LIMITS.maxResponseBytes) throw new Error('response exceeded size cap');
    if (r.usage) usd = (r.usage.promptTokens * gate.priceInPerMTok! + r.usage.completionTokens * gate.priceOutPerMTok!) / 1e6;
    recordSpend(store, nowMs, usd);
    const parsed = { choices: [{ message: { content: r.text } }] };
    const content = parsed.choices[0].message.content.replace(/^```(?:json)?\s*|\s*```$/g, '');
    let raw: unknown; try { raw = JSON.parse(content); } catch { throw new Error('model output was not JSON'); }
    const v = validateDraft(raw, finding);
    if (!v.ok) throw new Error(`model draft rejected: ${v.reasons.join('; ')}`);
    store.appendEvidence('overdue.draft.live', finding.number, `Muse draft validated (model ${META_MODELS.spark}, est. USD ${usd.toFixed(6)})`);
    return { mode: 'live', model: META_MODELS.spark, label: `LIVE — ${META_MODELS.spark}, validated`, draft: v.draft, draftHash: draftHash(v.draft), gate, finding };
  } catch (e) {
    const why = e instanceof Error ? (e.name === 'TimeoutError' ? `timed out after ${DRAFT_LIMITS.timeoutMs} ms` : e.message) : 'live draft failed';
    store.appendEvidence('overdue.draft.fallback', finding.number, `Live draft not used: ${why.slice(0, 200)}`);
    return fixture(`Live draft not used: ${why}`);
  }
}

/** Create the approval run for an exact draft. Edited drafts are re-validated against the stored invoice. */
export function proposeReminder(store: BusinessStore, input: { invoiceId: string; subject: string; body: string; mode: 'live' | 'fixture'; model: string | null }, nowMs = Date.now(), engine = new WorkflowEngine(store)) {
  const f = findingFor(store, input.invoiceId, nowMs);
  const v = validateDraft({ subject: input.subject, body: input.body }, f);
  if (!v.ok) throw new BusinessError(`Draft rejected: ${v.reasons.join('; ')}`, 422);
  const run = engine.start(OVERDUE_INVOICE_REMINDER.id, { invoiceId: f.invoiceId, to: f.customerEmail, subject: v.draft.subject, body: v.draft.body, mode: input.mode, model: input.mode === 'live' ? input.model : null, draftHash: draftHash(v.draft) });
  store.appendEvidence('overdue.reminder.proposed', f.number, `Awaiting approval (run ${run.id.slice(0, 8)}, ${input.mode})`);
  return run;
}

export type Sender = (m: { to: string; subject: string; text: string }) => Promise<{ ok: boolean; error?: string }>;
/** Hand queued messages to the connected integration. Never retries a handed-off message. */
export async function dispatchOutbound(store: BusinessStore, send: Sender) {
  ensureOutbound(store);
  const queued = store.db.prepare("SELECT * FROM mb_outbound WHERE status='queued' ORDER BY createdAt LIMIT 20").all() as Outbound[];
  const results: { id: string; status: Outbound['status']; detail: string | null }[] = [];
  for (const m of queued) {
    let r: { ok: boolean; error?: string };
    try { r = await send({ to: m.recipient, subject: m.subject, text: m.body }); } catch (e) { r = { ok: false, error: e instanceof Error ? e.message : 'send failed' }; }
    const status = r.ok ? 'handed_off' : 'failed'; const detail = r.ok ? 'Handed to the connected email integration' : (r.error ?? 'send failed').slice(0, 300);
    store.transact(() => {
      store.db.prepare('UPDATE mb_outbound SET status=?, detail=?, updatedAt=? WHERE id=? AND status=\'queued\'').run(status, detail, new Date().toISOString(), m.id);
      store.appendEvidence(r.ok ? 'overdue.reminder.handed_off' : 'overdue.reminder.send_failed', m.id, detail);
    });
    results.push({ id: m.id, status, detail });
  }
  return results;
}
export function outbound(store: BusinessStore): Outbound[] { ensureOutbound(store); return store.db.prepare('SELECT * FROM mb_outbound ORDER BY createdAt DESC LIMIT 100').all() as Outbound[]; }
