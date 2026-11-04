/**
 * Board service/integration registry and health checks (Homarr-style tiles; idea only, no Homarr code).
 * Every tile runs a real check. A value we cannot read is null. Responses never carry secrets, URLs with
 * credentials, or upstream error bodies: only a status, an HTTP code, a latency and a fixed sentence.
 */
import type { BusinessStore } from '../store';
import { metaDryRun, GRAPH_VERSION } from '../meta/graph';
import { listDispatches } from '../dispatch/service';
import { queue } from '../ai/jev';
import { loadCatalog, connectionLabel } from '../muse-catalog';
import { rakazoConfig } from '../runtime/rakazo';

export type TileStatus = 'ok' | 'down' | 'not configured' | 'dry run';
export type TileResult = { id: string; status: TileStatus; latencyMs: number | null; detail: string; metrics: { label: string; value: number | string }[]; checkedAt: string };
export type Env = Record<string, string | undefined>;
export type Fetch = typeof fetch;
export type Ctx = { s: BusinessStore; env: Env; fetch: Fetch; timeoutMs: number };
export type TileDef = { id: string; group: 'Core' | 'AI' | 'Meta' | 'MCP' | 'Queues' | 'Connectors'; name: string; checks: string; run: (c: Ctx) => Promise<Omit<TileResult, 'id' | 'checkedAt'>> | Omit<TileResult, 'id' | 'checkedAt'> };

const has = (env: Env, k: string) => !!env[k]?.trim();
const nc = (detail: string) => ({ status: 'not configured' as const, latencyMs: null, detail, metrics: [] });

/** One GET with a timeout. Returns only status code and latency; the body is discarded. */
export async function ping(c: Ctx, url: string, headers: Record<string, string> = {}): Promise<{ ok: boolean; code: number | null; ms: number }> {
  const t0 = Date.now(); const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), c.timeoutMs);
  try { const r = await c.fetch(url, { headers, signal: ac.signal, cache: 'no-store' } as RequestInit); try { await r.body?.cancel(); } catch { /* ignore */ } return { ok: r.ok, code: r.status, ms: Date.now() - t0 }; }
  catch { return { ok: false, code: null, ms: Date.now() - t0 }; } finally { clearTimeout(tm); }
}
const pinged = (p: { ok: boolean; code: number | null; ms: number }, okText: string) => ({ status: p.ok ? 'ok' as const : 'down' as const, latencyMs: p.ms, detail: p.ok ? okText : p.code === null ? 'No response (timeout or network error).' : `HTTP ${p.code}.`, metrics: [] });
const count = (s: BusinessStore, sql: string) => Number((s.db.prepare(sql).get() as { n: number }).n);

export const TILES: TileDef[] = [
  { id: 'sqlite', group: 'Core', name: 'SQLite', checks: 'Runs SELECT 1 and PRAGMA quick_check on the business database.', run: ({ s }) => {
    const t0 = Date.now(); try { s.db.prepare('SELECT 1').get(); const q = (s.db.prepare('PRAGMA quick_check').get() as Record<string, string>); const v = Object.values(q)[0];
      return { status: v === 'ok' ? 'ok' : 'down', latencyMs: Date.now() - t0, detail: v === 'ok' ? 'Database answered; quick_check ok.' : 'quick_check reported a problem.', metrics: [] }; }
    catch { return { status: 'down', latencyMs: Date.now() - t0, detail: 'Database query failed.', metrics: [] }; } } },
  { id: 'ledger', group: 'Core', name: 'Evidence ledger', checks: 'Re-verifies the SHA-256 hash chain of every evidence row.', run: ({ s }) => {
    const t0 = Date.now(); const rows = s.evidence(); const valid = s.verifyAudit();
    const by = new Map<string, number>(); for (const e of rows) { const k = e.action.split('.')[0] || 'other'; by.set(k, (by.get(k) ?? 0) + 1); }
    return { status: valid ? 'ok' : 'down', latencyMs: Date.now() - t0, detail: rows.length === 0 ? 'Chain is empty (nothing recorded yet).' : valid ? 'Hash chain verified.' : 'Hash chain BROKEN.', metrics: [{ label: 'Rows', value: rows.length }, ...[...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => ({ label: `${k}.*`, value: n }))] }; } },
  { id: 'ollama', group: 'AI', name: 'Ollama', checks: 'MUZEBOS_OLLAMA_URL present, then GET /api/tags.', run: async (c) => {
    const u = c.env.MUZEBOS_OLLAMA_URL?.trim(); if (!u) return nc('Set MUZEBOS_OLLAMA_URL.'); let base: string; try { base = new URL(u).origin; } catch { return nc('MUZEBOS_OLLAMA_URL is not a valid URL.'); }
    return pinged(await ping(c, `${base}/api/tags`), 'Ollama answered.'); } },
  { id: 'openrouter', group: 'AI', name: 'OpenRouter', checks: 'OPENROUTER_API_KEY present, then GET /api/v1/key (authenticated, no tokens spent).', run: async (c) => {
    if (!has(c.env, 'OPENROUTER_API_KEY')) return nc('Set OPENROUTER_API_KEY.'); return pinged(await ping(c, 'https://openrouter.ai/api/v1/key', { authorization: `Bearer ${c.env.OPENROUTER_API_KEY!.trim()}` }), 'Key accepted.'); } },
  { id: 'baseten', group: 'AI', name: 'Baseten', checks: 'BASETEN_API_KEY present, then GET /v1/models.', run: async (c) => {
    if (!has(c.env, 'BASETEN_API_KEY')) return nc('Set BASETEN_API_KEY.'); return pinged(await ping(c, 'https://inference.baseten.co/v1/models', { authorization: `Api-Key ${c.env.BASETEN_API_KEY!.trim()}` }), 'Key accepted.'); } },
  { id: 'meta-model', group: 'AI', name: 'Meta model (Muse)', checks: 'META_MODEL_API_KEY present, then GET api.meta.ai/v1/models.', run: async (c) => {
    if (!has(c.env, 'META_MODEL_API_KEY')) return nc('Set META_MODEL_API_KEY.'); return pinged(await ping(c, 'https://api.meta.ai/v1/models', { authorization: `Bearer ${c.env.META_MODEL_API_KEY!.trim()}` }), 'Key accepted.'); } },
  { id: 'meta-graph', group: 'Meta', name: 'Meta Graph', checks: `Page/WhatsApp/Instagram token present. With test mode on, no call is made. With it off, GET ${'graph.facebook.com'}/${'{version}'}/me.`, run: async (c) => {
    const tok = c.env.MUZEBOS_META_PAGE_ACCESS_TOKEN?.trim() || c.env.MUZEBOS_WHATSAPP_CLOUD_ACCESS_TOKEN?.trim() || c.env.MUZEBOS_INSTAGRAM_ACCESS_TOKEN?.trim();
    if (!tok) return nc('No Meta access token set.'); if (metaDryRun(c.env)) return { status: 'dry run', latencyMs: null, detail: 'Test mode on (MUZEBOS_META_DRY_RUN). Sends are not delivered; no Graph call made.', metrics: [{ label: 'Graph', value: GRAPH_VERSION }] };
    return { ...pinged(await ping(c, `https://graph.facebook.com/${GRAPH_VERSION}/me?fields=id`, { authorization: `Bearer ${tok}` }), 'Token accepted.'), metrics: [{ label: 'Graph', value: GRAPH_VERSION }] }; } },
  { id: 'rakazo', group: 'AI', name: 'Rakazo runtime', checks: 'RAKAZO_URL and RAKAZO_API_KEY present, then GET <RAKAZO_URL>/ready (database and degraded check). No bot data is read here.', run: async (c) => {
    const cfg = rakazoConfig(c.env); if (!cfg) return nc('Rakazo not configured — add RAKAZO_URL and RAKAZO_API_KEY.');
    return pinged(await ping(c, `${cfg.url}/ready`), 'Rakazo /ready answered OK.'); } },
  { id: 'mcp', group: 'MCP', name: 'MCP servers', checks: 'Reads the MCP directory and each entry\'s connection state from env.', run: (c) => {
    const cat = loadCatalog().entries.filter((e) => e.kind === 'mcp'); const labels = cat.map((e) => connectionLabel(e, c.env));
    const built = labels.filter((l) => l.startsWith('Built in')).length; const blocked = labels.filter((l) => l.startsWith('Blocked')).length;
    return { status: cat.length === 0 ? 'not configured' : built ? 'ok' : 'not configured', latencyMs: null, detail: cat.length === 0 ? 'Directory is empty.' : `${built} built in; the rest need an operator to start and register them.`, metrics: [{ label: 'In directory', value: cat.length }, { label: 'Built in', value: built }, { label: 'Blocked', value: blocked }] }; } },
  { id: 'dispatch', group: 'Queues', name: 'Dispatch', checks: 'Counts /api/dispatch records by status.', run: ({ s, env }) => {
    const ds = listDispatches(s); const by = (st: string) => ds.filter((d) => d.status === st).length;
    return { status: metaDryRun(env) ? 'dry run' : 'ok', latencyMs: null, detail: metaDryRun(env) ? 'Test mode on: approved sends are recorded, not delivered.' : 'Live mode: approved sends are delivered.', metrics: [{ label: 'Pending', value: by('pending') }, { label: 'Approved', value: by('approved') }, { label: 'Sent', value: by('sent') }, { label: 'Failed', value: by('failed') }] }; } },
  { id: 'jev', group: 'Queues', name: 'Jev queue', checks: 'Counts Jev approval runs by status.', run: ({ s }) => {
    const q = queue(s); const waiting = q.filter((r) => r.status === 'awaiting_approval').length;
    return { status: 'ok', latencyMs: null, detail: waiting ? `${waiting} waiting for a decision.` : 'Nothing waiting.', metrics: [{ label: 'Waiting', value: waiting }, { label: 'All runs', value: q.length }] }; } },
  { id: 'webhooks', group: 'Queues', name: 'Webhooks', checks: 'Counts stored webhook deliveries and the newest receipt time.', run: ({ s, env }) => {
    const n = count(s, 'SELECT COUNT(*) n FROM mb_webhook_deliveries'); const last = (s.db.prepare('SELECT MAX(receivedAt) t FROM mb_webhook_deliveries').get() as { t: string | null }).t;
    return { status: has(env, 'META_APP_SECRET') ? 'ok' : 'not configured', latencyMs: null, detail: has(env, 'META_APP_SECRET') ? 'Signature secret set.' : 'Set META_APP_SECRET to accept signed Meta webhooks.', metrics: [{ label: 'Deliveries', value: n }, { label: 'Last', value: last ?? '—' }] }; } },
  { id: 'stripe', group: 'Connectors', name: 'Stripe', checks: 'STRIPE_SECRET_KEY present, then GET /v1/balance (read-only).', run: async (c) => {
    if (!has(c.env, 'STRIPE_SECRET_KEY')) return nc('Set STRIPE_SECRET_KEY.'); return pinged(await ping(c, 'https://api.stripe.com/v1/balance', { authorization: `Bearer ${c.env.STRIPE_SECRET_KEY!.trim()}` }), 'Key accepted.'); } },
  { id: 'slack', group: 'Connectors', name: 'Slack', checks: 'SLACK_BOT_TOKEN present, then GET auth.test.', run: async (c) => {
    if (!has(c.env, 'SLACK_BOT_TOKEN')) return nc('Set SLACK_BOT_TOKEN.'); const p = await ping(c, 'https://slack.com/api/auth.test', { authorization: `Bearer ${c.env.SLACK_BOT_TOKEN!.trim()}` });
    return { ...pinged(p, 'Slack answered (HTTP 200; token validity is in the body, which is not read).') }; } },
  { id: 'notion', group: 'Connectors', name: 'Notion', checks: 'NOTION_API_KEY present, then GET /v1/users/me.', run: async (c) => {
    if (!has(c.env, 'NOTION_API_KEY')) return nc('Set NOTION_API_KEY.'); return pinged(await ping(c, 'https://api.notion.com/v1/users/me', { authorization: `Bearer ${c.env.NOTION_API_KEY!.trim()}`, 'notion-version': '2022-06-28' }), 'Key accepted.'); } },
];
export const TILE_IDS = TILES.map((t) => t.id);

let caches = new WeakMap<BusinessStore, Map<string, { at: number; r: TileResult }>>();
export const CACHE_MS = 15_000;
export function clearBoardCache() { caches = new WeakMap(); }

/** Run every check (in parallel), each cached briefly so polling never hammers upstreams. */
export async function boardStatus(s: BusinessStore, opts: { env?: Env; fetch?: Fetch; timeoutMs?: number; now?: number } = {}): Promise<TileResult[]> {
  const c: Ctx = { s, env: opts.env ?? process.env, fetch: opts.fetch ?? fetch, timeoutMs: opts.timeoutMs ?? 2500 }; const now = opts.now ?? Date.now();
  let cache = caches.get(s); if (!cache) { cache = new Map(); caches.set(s, cache); }
  const scopedCache = cache;
  return Promise.all(TILES.map(async (t) => {
    const hit = scopedCache.get(t.id); if (hit && now - hit.at < CACHE_MS) return hit.r;
    let r: TileResult; try { r = { id: t.id, ...(await t.run(c)), checkedAt: new Date(now).toISOString() }; }
    catch { r = { id: t.id, status: 'down', latencyMs: null, detail: 'Check failed.', metrics: [], checkedAt: new Date(now).toISOString() }; }
    scopedCache.set(t.id, { at: now, r }); return r;
  }));
}
