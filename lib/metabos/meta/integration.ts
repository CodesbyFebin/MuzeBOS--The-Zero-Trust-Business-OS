/** Meta integration layer, following the owner's blueprint build order.
 *  Status is computed from env presence and real records only. Values are never returned.
 *  No Meta App Review has been done, so every scope that needs review says so.
 *  Nothing here sends anything: outbound sends still go through Jev and /api/dispatch. */
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { BusinessError, type BusinessStore } from '../store';
import { propose as proposeDispatch } from '../dispatch/service';
import { ensureTalk } from '../talk/core';
import { propose as jevPropose, queue } from '../ai/jev';
import { missingEnv, type Env } from '../dispatch/adapters';

import { GRAPH_VERSION, metaDryRun } from './graph';
export { GRAPH_VERSION };
const has = (env: Env, k: string) => !!env[k]?.trim();
const now = () => new Date().toISOString();

export function ensureMeta(s: BusinessStore) {
  s.db.exec(`CREATE TABLE IF NOT EXISTS mb_meta_tenants(workspaceId TEXT PRIMARY KEY, businessId TEXT, pageId TEXT, adAccountId TEXT, pixelId TEXT, catalogId TEXT, wabaId TEXT, updatedBy TEXT NOT NULL, updatedAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mb_meta_tokens(id TEXT PRIMARY KEY, subject TEXT NOT NULL, sealed TEXT NOT NULL, scopes TEXT NOT NULL, expiresAt TEXT, createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mb_meta_oauth_states(state TEXT PRIMARY KEY, createdBy TEXT NOT NULL, createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mb_meta_leads(conversationId TEXT PRIMARY KEY, stage TEXT NOT NULL, followUpAt TEXT, note TEXT, updatedBy TEXT NOT NULL, updatedAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mb_meta_post_insights(postId TEXT NOT NULL, platform TEXT NOT NULL, publishedAt TEXT NOT NULL, reach INTEGER NOT NULL, engagement INTEGER NOT NULL, source TEXT NOT NULL, PRIMARY KEY(postId, platform));`);
}

// Scopes. Every advanced permission needs Meta App Review; none has been granted.
export const SCOPES = [
  { scope: 'pages_show_list', use: 'List the Pages you manage', review: true },
  { scope: 'pages_manage_posts', use: 'Publish approved posts to your Page', review: true },
  { scope: 'pages_messaging', use: 'Messenger inbox replies', review: true },
  { scope: 'instagram_basic', use: 'Read your Instagram professional account', review: true },
  { scope: 'instagram_content_publish', use: 'Publish approved Instagram posts', review: true },
  { scope: 'instagram_manage_messages', use: 'Instagram DM inbox', review: true },
  { scope: 'whatsapp_business_messaging', use: 'WhatsApp Cloud API replies', review: true },
  { scope: 'whatsapp_business_management', use: 'Read your WABA and phone numbers', review: true },
  { scope: 'ads_read', use: 'Ads Insights for ROAS and best-time slots', review: true },
  { scope: 'ads_management', use: 'Create campaigns after approval', review: true },
  { scope: 'catalog_management', use: 'Sync products to your Meta catalogue', review: true },
  { scope: 'business_management', use: 'Read your Business Portfolio assets', review: true },
] as const;

export type StepState = 'done' | 'not_configured' | 'partial' | 'blocked';
/** The blueprint's 7-step build order with a real status per step. */
export function buildOrder(s: BusinessStore, env: Env) {
  ensureMeta(s);
  const tenants = (s.db.prepare('SELECT COUNT(*) n FROM mb_meta_tenants').get() as { n: number }).n;
  const tokens = (s.db.prepare('SELECT COUNT(*) n FROM mb_meta_tokens').get() as { n: number }).n;
  const app = has(env, 'META_APP_ID') && has(env, 'META_APP_SECRET');
  const wa = has(env, 'MUZEBOS_WHATSAPP_CLOUD_ACCESS_TOKEN') && has(env, 'MUZEBOS_WHATSAPP_PHONE_NUMBER_ID');
  const st = (ok: boolean, some = false): StepState => ok ? 'done' : some ? 'partial' : 'not_configured';
  return [
    { n: 1, title: 'Business Portfolio, app registration and verification', state: st(false, app), detail: app ? 'Meta app env present. Business verification and App Review are done in Meta, not here: not recorded.' : 'Not configured — set META_APP_ID and META_APP_SECRET. Business verification happens in Meta Business Manager.' },
    { n: 2, title: 'Auth (Login with Facebook) and multi-tenancy', state: st(tokens > 0 && tenants > 0, app || tenants > 0), detail: `${tokens} stored token(s) · ${tenants} brand mapping(s). ${has(env, 'MUZEBOS_TOKEN_KEY') ? '' : 'Token storage needs MUZEBOS_TOKEN_KEY (32-byte base64).'}`.trim() },
    { n: 3, title: 'Publishing and unified inbox', state: st(false, wa || has(env, 'META_VERIFY_TOKEN')), detail: `Webhooks at /api/webhooks/{whatsapp,instagram,messenger} verify X-Hub-Signature-256${has(env, 'META_APP_SECRET') ? '' : ' (returns not_configured until META_APP_SECRET is set)'}. Page publish, IG publish and Messenger replies go through Jev and /api/dispatch${metaDryRun(env) ? ' (DRY_RUN on: nothing is sent)' : ''}.` },
    { n: 4, title: 'Catalogue and Shops', state: st(false, has(env, 'META_CATALOG_ID')), detail: has(env, 'META_CATALOG_ID') ? 'Catalogue ID present; sync is a preview only (no write adapter).' : 'Not configured — set META_CATALOG_ID. Needs catalog_management (App Review).' },
    { n: 5, title: 'Ads: read-only reporting, then writes', state: 'blocked' as StepState, detail: 'Not configured — needs ads_read / ads_management, which require Meta App Review. Ad drafts only.' },
    { n: 6, title: 'WhatsApp and AI assistant', state: st(wa), detail: wa ? 'WhatsApp Cloud env present (not a delivery claim). Replies go through Jev and /api/dispatch.' : 'Not configured — set MUZEBOS_WHATSAPP_CLOUD_ACCESS_TOKEN and MUZEBOS_WHATSAPP_PHONE_NUMBER_ID.' },
    { n: 7, title: 'Billing, roles, partner / multi-agency mode', state: 'partial' as StepState, detail: 'Admin / Agent / Viewer roles exist. Billing and partner mode: not built.' },
  ];
}

// Multi-tenant mapping: brand workspace -> Meta asset IDs typed by the owner. IDs are numeric strings; act_ prefix allowed for ad accounts.
const idv = z.string().trim().regex(/^\d{5,25}$/, 'numeric Meta ID').nullable().default(null);
export const TenantInput = z.object({ workspaceId: z.string().min(1).max(40), businessId: idv, pageId: idv, adAccountId: z.string().trim().regex(/^(act_)?\d{5,25}$/).nullable().default(null), pixelId: idv, catalogId: idv, wabaId: idv }).strict();
export function saveTenant(s: BusinessStore, actor: string, raw: unknown) {
  const t = TenantInput.parse(raw); ensureMeta(s);
  s.db.exec('CREATE TABLE IF NOT EXISTS mb_av_workspaces(id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, createdBy TEXT NOT NULL, createdAt TEXT NOT NULL)');
  if (!s.db.prepare('SELECT 1 FROM mb_av_workspaces WHERE id=?').get(t.workspaceId)) throw new BusinessError('Workspace not found', 404);
  s.transact(() => { s.db.prepare('INSERT OR REPLACE INTO mb_meta_tenants VALUES(?,?,?,?,?,?,?,?,?)').run(t.workspaceId, t.businessId, t.pageId, t.adAccountId, t.pixelId, t.catalogId, t.wabaId, actor, now()); s.appendEvidence('meta.tenant.mapped', t.workspaceId, `by ${actor}`); });
  return { workspaceId: t.workspaceId };
}
export function tenants(s: BusinessStore) {
  ensureMeta(s); s.db.exec('CREATE TABLE IF NOT EXISTS mb_av_workspaces(id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, createdBy TEXT NOT NULL, createdAt TEXT NOT NULL)');
  return s.db.prepare('SELECT w.id workspaceId, w.name, t.businessId, t.pageId, t.adAccountId, t.pixelId, t.catalogId, t.wabaId, t.updatedAt FROM mb_av_workspaces w LEFT JOIN mb_meta_tenants t ON t.workspaceId=w.id ORDER BY w.createdAt').all() as Record<string, string | null>[];
}

// Token storage: AES-256-GCM sealed with MUZEBOS_TOKEN_KEY. Refuses to store without a key.
const key = (env: Env) => { const k = env.MUZEBOS_TOKEN_KEY?.trim(); if (!k) throw new BusinessError('Not configured — set MUZEBOS_TOKEN_KEY', 424); const b = Buffer.from(k, 'base64'); if (b.length !== 32) throw new BusinessError('MUZEBOS_TOKEN_KEY must be 32 bytes base64', 424); return b; };
export function sealToken(token: string, env: Env) { const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', key(env), iv); const ct = Buffer.concat([c.update(token, 'utf8'), c.final()]); return [iv, c.getAuthTag(), ct].map((b) => b.toString('base64')).join('.'); }
export function openToken(sealed: string, env: Env) { const [iv, tag, ct] = sealed.split('.').map((x) => Buffer.from(x, 'base64')); const d = createDecipheriv('aes-256-gcm', key(env), iv); d.setAuthTag(tag); return Buffer.concat([d.update(ct), d.final()]).toString('utf8'); }

export function oauthStart(s: BusinessStore, actor: string, env: Env, scopes: string[]) {
  if (!has(env, 'META_APP_ID') || !has(env, 'META_OAUTH_REDIRECT_URI')) throw new BusinessError('Not configured — set META_APP_ID and META_OAUTH_REDIRECT_URI', 424);
  key(env); ensureMeta(s);
  const allowed = new Set<string>(SCOPES.map((x) => x.scope)); const sc = scopes.filter((x) => allowed.has(x));
  if (!sc.length) throw new BusinessError('Choose at least one scope', 422);
  const state = randomBytes(16).toString('hex');
  s.db.prepare('INSERT INTO mb_meta_oauth_states VALUES(?,?,?)').run(state, actor, now());
  const u = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  u.searchParams.set('client_id', env.META_APP_ID!.trim()); u.searchParams.set('redirect_uri', env.META_OAUTH_REDIRECT_URI!.trim()); u.searchParams.set('state', state); u.searchParams.set('scope', sc.join(','));
  return { url: u.toString() };
}
/** Exchanges the code for a long-lived user token and stores it sealed. The token is never returned or logged. */
export async function oauthCallback(s: BusinessStore, env: Env, code: string, state: string, f: typeof fetch = fetch) {
  ensureMeta(s);
  const row = s.db.prepare('SELECT * FROM mb_meta_oauth_states WHERE state=?').get(state) as { createdBy: string; createdAt: string } | undefined;
  if (!row || Date.now() - Date.parse(row.createdAt) > 10 * 60_000) throw new BusinessError('Invalid or expired state', 400);
  s.db.prepare('DELETE FROM mb_meta_oauth_states WHERE state=?').run(state);
  const q = (p: Record<string, string>) => new URLSearchParams(p).toString();
  const base = `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`;
  const short = await graphFetch(`${base}?${q({ client_id: env.META_APP_ID!, client_secret: env.META_APP_SECRET ?? '', redirect_uri: env.META_OAUTH_REDIRECT_URI!, code })}`, {}, f);
  const long = await graphFetch(`${base}?${q({ grant_type: 'fb_exchange_token', client_id: env.META_APP_ID!, client_secret: env.META_APP_SECRET ?? '', fb_exchange_token: String(short.access_token) })}`, {}, f);
  const id = `mt_${randomUUID().slice(0, 8)}`; const exp = long.expires_in ? new Date(Date.now() + Number(long.expires_in) * 1000).toISOString() : null;
  s.transact(() => { s.db.prepare('INSERT INTO mb_meta_tokens VALUES(?,?,?,?,?,?)').run(id, row.createdBy, sealToken(String(long.access_token), env), '', exp, now()); s.appendEvidence('meta.oauth.token.stored', id, `sealed; expires ${exp ?? 'unknown'}`); });
  return { id, expiresAt: exp };
}

// Graph API rate-limit backoff. Retries on HTTP 429/5xx and Graph throttling codes 4, 17, 32, 613, 80000-80014.
const THROTTLE = new Set([4, 17, 32, 613]);
export const isThrottle = (status: number, code?: number) => status === 429 || status >= 500 || (code !== undefined && (THROTTLE.has(code) || (code >= 80000 && code <= 80014)));
export async function graphFetch(url: string, init: RequestInit = {}, f: typeof fetch = fetch, opts: { tries?: number; baseMs?: number; sleep?: (ms: number) => Promise<void> } = {}) {
  const tries = opts.tries ?? 4, base = opts.baseMs ?? 500, sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  for (let i = 0; ; i++) {
    const r = await f(url, init); const j = await r.json().catch(() => ({})) as Record<string, unknown> & { error?: { code?: number; message?: string } };
    if (r.ok && !j.error) return j;
    if (i + 1 >= tries || !isThrottle(r.status, j.error?.code)) throw new BusinessError(`Graph API error ${r.status}${j.error?.code ? ` code ${j.error.code}` : ''}`, 502);
    await sleep(base * 2 ** i + Math.floor(Math.random() * base));
  }
}

// (1) Click-to-WhatsApp lead pipeline over real inbox threads.
export const STAGES = ['new', 'qualified', 'quoted', 'won', 'lost'] as const;
export function leads(s: BusinessStore) {
  ensureMeta(s); ensureTalk(s);
  return s.db.prepare("SELECT c.id conversationId, c.channel, c.address, c.name, c.lastInboundAt, COALESCE(l.stage,'new') stage, l.followUpAt, l.note FROM mb_conversations c LEFT JOIN mb_meta_leads l ON l.conversationId=c.id WHERE c.channel IN ('whatsapp','instagram','messenger') ORDER BY COALESCE(c.lastInboundAt, c.updatedAt) DESC LIMIT 200").all() as { conversationId: string; channel: string; address: string; name: string | null; lastInboundAt: string | null; stage: string; followUpAt: string | null; note: string | null }[];
}
export const LeadInput = z.object({ conversationId: z.string().min(1).max(80), stage: z.enum(STAGES), followUpAt: z.string().datetime().nullable().default(null), note: z.string().max(500).nullable().default(null) }).strict();
export function updateLead(s: BusinessStore, actor: string, raw: unknown) {
  const l = LeadInput.parse(raw); ensureMeta(s); ensureTalk(s);
  if (!s.db.prepare('SELECT 1 FROM mb_conversations WHERE id=?').get(l.conversationId)) throw new BusinessError('Conversation not found', 404);
  s.transact(() => { s.db.prepare('INSERT OR REPLACE INTO mb_meta_leads VALUES(?,?,?,?,?,?)').run(l.conversationId, l.stage, l.followUpAt, l.note, actor, now()); s.appendEvidence('meta.lead.stage', l.conversationId, `${l.stage}${l.followUpAt ? `; follow-up ${l.followUpAt}` : ''}`); });
  if (l.followUpAt) jevPropose(s, { taskId: `followup-${l.conversationId}-${Date.parse(l.followUpAt)}`, role: 'writer', tool: 'reminders.create', args: { title: `Follow up lead ${l.conversationId} at ${l.followUpAt}` }, rationale: 'Lead follow-up reminder; no message is sent', source: 'rule', model: null });
  return { ok: true };
}
/** A lead reply is only a dispatch proposal; it sends after Jev approval through /api/dispatch. */
export function proposeLeadReply(s: BusinessStore, actor: string, conversationId: string, body: string) {
  ensureTalk(s); const c = s.db.prepare('SELECT channel, address FROM mb_conversations WHERE id=?').get(conversationId) as { channel: string; address: string } | undefined;
  if (!c) throw new BusinessError('Conversation not found', 404);
  if (c.channel !== 'whatsapp' && c.channel !== 'instagram') throw new BusinessError('Not connected', 424);
  const d = proposeDispatch(s, actor, c.channel, { to: c.address, body: z.string().trim().min(1).max(4096).parse(body) });
  return { dispatchId: d.id, status: d.status };
}

// (2) Best-time slots from real Insights rows only. Empty when none.
export function bestTimes(s: BusinessStore) {
  ensureMeta(s);
  const rows = s.db.prepare('SELECT publishedAt, reach, engagement FROM mb_meta_post_insights').all() as { publishedAt: string; reach: number; engagement: number }[];
  const m = new Map<string, { posts: number; rate: number }>();
  for (const r of rows) { const d = new Date(r.publishedAt); const k = `${d.getUTCDay()}-${d.getUTCHours()}`; const e = m.get(k) ?? { posts: 0, rate: 0 }; e.posts++; e.rate += r.reach ? r.engagement / r.reach : 0; m.set(k, e); }
  return [...m.entries()].filter(([, v]) => v.posts >= 2).map(([k, v]) => { const [day, hourUtc] = k.split('-').map(Number); return { day, hourUtc, posts: v.posts, engagementRate: Math.round((v.rate / v.posts) * 10000) / 100 }; }).sort((a, b) => b.engagementRate - a.engagementRate).slice(0, 5);
}
export function calendar(s: BusinessStore) {
  const has = (t: string) => !!s.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
  const drafts = has('mb_suite_drafts') ? s.db.prepare('SELECT id, product, body, createdAt FROM mb_suite_drafts ORDER BY createdAt DESC LIMIT 100').all() as { id: string; product: string; body: string; createdAt: string }[] : [];
  return { drafts, bestTimes: bestTimes(s), insightsRows: (s.db.prepare('SELECT COUNT(*) n FROM mb_meta_post_insights').get() as { n: number }).n };
}

// (3) Catalogue mapping preview from real products.
export function catalog(s: BusinessStore, env: Env) {
  const ready = has(env, 'META_CATALOG_ID') && has(env, 'META_CATALOG_ACCESS_TOKEN');
  return { status: ready ? 'Configured (env present; sync preview only, no write adapter)' : 'Not configured — set META_CATALOG_ID and META_CATALOG_ACCESS_TOKEN (catalog_management needs App Review)',
    items: s.products().map((p) => ({ retailer_id: p.sku || p.id, title: p.name, price: `${(p.price / 100).toFixed(2)} INR`, availability: p.stock > 0 ? 'in stock' : 'out of stock' })) };
}

// (4) Weekly report from real approval and evidence records.
export function weeklyReport(s: BusinessStore, at = Date.now()) {
  const since = at - 7 * 86400_000; const ev = s.evidence().filter((e) => Date.parse(e.createdAt) >= since);
  const runs = queue(s).filter((r) => Date.parse(r.createdAt) >= since);
  const by = (p: RegExp) => ev.filter((e) => p.test(e.action)).length;
  return { from: new Date(since).toISOString(), to: new Date(at).toISOString(), evidenceRows: ev.length, chainValid: s.verifyAudit(),
    jev: { proposed: runs.length, waiting: runs.filter((r) => r.status === 'awaiting_approval').length, approvedOrDone: runs.filter((r) => !['awaiting_approval', 'cancelled', 'compensated', 'failed', 'timed_out'].includes(r.status)).length, rejected: runs.filter((r) => r.status === 'cancelled' || r.status === 'compensated').length },
    inbound: by(/talk\.message\.in|webhook/i), dispatchesSent: by(/dispatch.*sent/i), leadStageChanges: by(/^meta\.lead\.stage$/), adDrafts: by(/ad\.draft/), guardBlocks: by(/guard|blocked|safe.?output/i) };
}

// (5) Pixel / Conversions API checklist. Presence only.
export function pixelChecklist(s: BusinessStore, env: Env) {
  ensureMeta(s); const mapped = (s.db.prepare('SELECT COUNT(*) n FROM mb_meta_tenants WHERE pixelId IS NOT NULL').get() as { n: number }).n;
  return [
    { item: 'Pixel ID mapped to a brand workspace', ok: mapped > 0, detail: `${mapped} workspace(s) with a Pixel ID` },
    { item: 'META_PIXEL_ID set on the server', ok: has(env, 'META_PIXEL_ID'), detail: 'Server env; value never shown' },
    { item: 'Conversions API token (META_CAPI_ACCESS_TOKEN)', ok: has(env, 'META_CAPI_ACCESS_TOKEN'), detail: 'System-user token, server-side only' },
    { item: 'Consent recorded before sending events', ok: false, detail: 'Not built — required before any CAPI send' },
    { item: 'Event deduplication (event_id shared by Pixel and CAPI)', ok: false, detail: 'Not built' },
    { item: 'Test event code verified in Events Manager', ok: false, detail: 'Done in Meta Events Manager; not recorded here' },
  ];
}


/** Per-channel send readiness. Names of missing env vars only; values never leave the server. */
export function liveWiring(env: Env) {
  const ch = [['whatsapp', 'WhatsApp Cloud replies'], ['instagram', 'Instagram DM replies'], ['messenger', 'Messenger (Page) replies'], ['page-post', 'Facebook Page publish'], ['ig-publish', 'Instagram publish']] as const;
  return { dryRun: metaDryRun(env), graphVersion: GRAPH_VERSION, webhookSecret: has(env, 'META_APP_SECRET'), verifyToken: has(env, 'META_VERIFY_TOKEN'),
    channels: ch.map(([channel, label]) => { const missing = missingEnv(channel, env); return { channel, label, state: missing.length ? 'Not configured' : metaDryRun(env) ? 'Configured · dry run' : 'Configured', missing }; }) };
}

function storedToken(s: BusinessStore, env: Env) {
  ensureMeta(s);
  const r = s.db.prepare('SELECT * FROM mb_meta_tokens ORDER BY createdAt DESC LIMIT 1').get() as { id: string; sealed: string } | undefined;
  if (!r) throw new BusinessError('Not configured — connect with Login with Facebook first', 424);
  return { id: r.id, token: openToken(r.sealed, env) };
}
const gget = (path: string, token: string, f: typeof fetch) => graphFetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`, { headers: { authorization: `Bearer ${token}` } }, f);
/** Read-only asset discovery with the stored user token (ported from MeTaPen discovery.ts). IDs and names only; Page tokens are never requested. */
export async function discoverAssets(s: BusinessStore, env: Env, f: typeof fetch = fetch) {
  const { id, token } = storedToken(s, env);
  const pages = await gget('me/accounts?fields=id,name,instagram_business_account{id,username}&limit=50', token, f);
  const biz = await gget('me/businesses?fields=id,name&limit=50', token, f).catch(() => ({ data: [] }));
  const ads = await gget('me/adaccounts?fields=id,name,account_status&limit=50', token, f).catch(() => ({ data: [] }));
  const arr = (x: any) => (Array.isArray(x?.data) ? x.data : []) as any[];
  const out = { pages: arr(pages).map((p) => ({ id: String(p.id), name: String(p.name ?? ''), instagram: p.instagram_business_account ? { id: String(p.instagram_business_account.id), username: String(p.instagram_business_account.username ?? '') } : null })),
    businesses: arr(biz).map((b) => ({ id: String(b.id), name: String(b.name ?? '') })), adAccounts: arr(ads).map((a) => ({ id: String(a.id), name: String(a.name ?? ''), status: Number(a.account_status ?? 0) })) };
  s.transact(() => s.appendEvidence('meta.assets.discovered', id, `${out.pages.length} page(s), ${out.businesses.length} business(es), ${out.adAccounts.length} ad account(s); read-only`));
  return out;
}
/** Token health via /debug_token (app token in the Authorization header, as MeTaPen does). Updates the stored expiry. */
export async function tokenHealth(s: BusinessStore, env: Env, f: typeof fetch = fetch) {
  if (!has(env, 'META_APP_ID') || !has(env, 'META_APP_SECRET')) throw new BusinessError('Not configured — set META_APP_ID and META_APP_SECRET', 424);
  const { id, token } = storedToken(s, env);
  const j = await graphFetch(`https://graph.facebook.com/${GRAPH_VERSION}/debug_token?input_token=${encodeURIComponent(token)}`, { headers: { authorization: `Bearer ${env.META_APP_ID!.trim()}|${env.META_APP_SECRET!.trim()}` } }, f);
  const d: any = (j as any)?.data ?? {}; const exp = Number(d.expires_at) > 0 ? new Date(Number(d.expires_at) * 1000).toISOString() : null;
  const scopes = Array.isArray(d.scopes) ? d.scopes.map(String) : [];
  s.transact(() => { s.db.prepare('UPDATE mb_meta_tokens SET expiresAt=?, scopes=? WHERE id=?').run(exp, scopes.join(','), id); s.appendEvidence('meta.token.checked', id, `valid ${Boolean(d.is_valid)}; expires ${exp ?? 'never/unknown'}; ${scopes.length} scope(s)`); });
  return { valid: Boolean(d.is_valid), expiresAt: exp, scopes, expiresInDays: exp ? Math.floor((Date.parse(exp) - Date.now()) / 86_400_000) : null };
}

export function metaOverview(s: BusinessStore, env: Env) {
  return { live: liveWiring(env), buildOrder: buildOrder(s, env), scopes: SCOPES, appReview: 'Not submitted — Meta App Review is required for every scope above and usually takes weeks.', oauthReady: has(env, 'META_APP_ID') && has(env, 'META_OAUTH_REDIRECT_URI') && has(env, 'MUZEBOS_TOKEN_KEY'),
    tenants: tenants(s), leads: leads(s), calendar: calendar(s), catalog: catalog(s, env), report: weeklyReport(s), pixel: pixelChecklist(s, env) };
}
