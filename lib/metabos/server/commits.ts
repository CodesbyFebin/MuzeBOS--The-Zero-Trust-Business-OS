/** "Git for agents": a read model over records that already exist. Each commit is one Jev run,
 *  agent draft, hub/social/ad draft or dispatch, with author, a diff of what it would change, its
 *  approval state and the evidence rows that reference it. No parallel store: everything is derived
 *  from WorkflowEngine runs, the draft tables, mb_dispatches and the hash-chained evidence ledger. */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { BusinessStore, Audit } from '../store';
import { propose, queue } from '../ai/jev';
import { assertSafeOutput } from '../b3/safe-outputs';
import { listDispatches } from '../dispatch/service';
import { missingEnv } from '../dispatch/adapters';
import { KIND_SERVER } from './servers';

export type CommitStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed' | 'sent' | 'held';
export type Commit = { sha: string; id: string; kind: string; server: string; author: string; title: string; diff: string[]; status: CommitStatus; jevRunId: string | null; dispatchId: string | null; dispatch: string; createdAt: string; evidence: { seq: number; action: string; hash: string }[] };

const jevState = (st: string | undefined): CommitStatus => !st ? 'held' : st === 'awaiting_approval' ? 'pending' : st === 'succeeded' ? 'executed' : st === 'cancelled' || st === 'compensated' ? 'rejected' : st === 'failed' || st === 'timed_out' ? 'failed' : 'approved';
const plus = (text: string) => String(text).split('\n').slice(0, 40).map((l) => `+ ${l}`);
const tableExists = (s: BusinessStore, t: string) => !!s.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);

export const ensureAds = (s: BusinessStore) => s.db.exec('CREATE TABLE IF NOT EXISTS mb_ad_drafts(id TEXT PRIMARY KEY, name TEXT NOT NULL, objective TEXT NOT NULL, dailyBudgetMinor INTEGER NOT NULL, currency TEXT NOT NULL, audience TEXT NOT NULL, creative TEXT NOT NULL, jevRunId TEXT NOT NULL, createdBy TEXT NOT NULL, createdAt TEXT NOT NULL)');
export const AdDraftInput = z.object({
  name: z.string().trim().min(1).max(120),
  objective: z.enum(['awareness', 'traffic', 'engagement', 'leads', 'sales']),
  dailyBudgetMinor: z.number().int().min(100).max(10_000_000),
  currency: z.literal('INR').default('INR'),
  audience: z.string().trim().min(1).max(500),
  creative: z.string().trim().min(1).max(2000),
}).strict();
/** Save an ad draft and queue it for Jev. There is no Marketing API adapter, so nothing is created on Meta. */
export function adDraft(s: BusinessStore, actor: string, raw: unknown) {
  const a = AdDraftInput.parse(raw); ensureAds(s);
  assertSafeOutput(s, 'writer', 'social_post', 'server.ads');
  const id = `ad_${randomUUID().slice(0, 8)}`;
  const run = propose(s, { taskId: `ad-${id}`, role: 'writer', tool: 'reminders.create', args: { title: `Review ad draft ${id}: ${a.name}`.slice(0, 180) }, rationale: 'Ads Manager draft in MeTa Server; no Marketing API adapter, nothing is created on Meta', source: 'rule', model: null });
  s.transact(() => { s.db.prepare('INSERT INTO mb_ad_drafts VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, a.name, a.objective, a.dailyBudgetMinor, a.currency, a.audience, a.creative, run.id, actor, new Date().toISOString()); s.appendEvidence('server.ad.draft.pending_jev', id, `Jev ${run.id}; not sent to Meta`); });
  return { id, jevRunId: run.id, status: 'pending_jev' as const };
}

export const SUITE_PRODUCTS = ['facebook', 'instagram', 'messenger', 'whatsapp', 'threads', 'meta-ai'] as const;
const ensureSuite = (s: BusinessStore) => s.db.exec('CREATE TABLE IF NOT EXISTS mb_suite_drafts(id TEXT PRIMARY KEY, product TEXT NOT NULL, mode TEXT NOT NULL, body TEXT NOT NULL, jevRunId TEXT NOT NULL, createdBy TEXT NOT NULL, createdAt TEXT NOT NULL)');
export const SuiteDraftInput = z.object({ product: z.enum(SUITE_PRODUCTS), mode: z.enum(['personal', 'business']), body: z.string().trim().min(1).max(3000) }).strict();
/** Meta Suite composer: one draft + one Jev item. Never sends; sends go through /api/dispatch after approval where an adapter exists. */
export function suiteDraft(s: BusinessStore, actor: string, raw: unknown) {
  const d = SuiteDraftInput.parse(raw); ensureSuite(s); assertSafeOutput(s, 'writer', 'social_post', 'server.suite');
  const id = `ms_${randomUUID().slice(0, 8)}`;
  const run = propose(s, { taskId: `suite-${id}`, role: 'writer', tool: 'reminders.create', args: { title: `Review ${d.mode} ${d.product} draft ${id}: ${d.body.slice(0, 80)}`.slice(0, 180) }, rationale: 'Meta Suite draft; nothing is sent without Jev + /api/dispatch', source: 'rule', model: null });
  s.transact(() => { s.db.prepare('INSERT INTO mb_suite_drafts VALUES(?,?,?,?,?,?,?)').run(id, d.product, d.mode, d.body, run.id, actor, new Date().toISOString()); s.appendEvidence('server.suite.draft.pending_jev', id, `${d.product} (${d.mode}); Jev ${run.id}; not sent`); });
  return { id, jevRunId: run.id, status: 'pending_jev' as const };
}
/** Env names from the owner's suite transcript. Setup notes only: no adapter reads them yet. */
export const SUITE_SETUP_ENV = ['META_APP_ID', 'META_APP_SECRET', 'META_VERIFY_TOKEN'];

/** Meta connector status from the adapters that exist. Missing adapters say so. */
export function metaConnections(env: Record<string, string | undefined> = process.env) {
  const st = (c: 'whatsapp' | 'instagram') => { const m = missingEnv(c, env); return m.length ? `Not connected — add ${m.join(', ')}` : 'Configured (env vars present; not a delivery claim)'; };
  return [
    { id: 'whatsapp', label: 'WhatsApp Cloud API', adapter: true, status: st('whatsapp') },
    { id: 'instagram', label: 'Instagram messaging', adapter: true, status: st('instagram') },
    { id: 'messenger', label: 'Messenger', adapter: false, status: 'Not connected — no Messenger adapter yet; drafts only' },
    { id: 'meta-ai', label: 'Meta AI (Llama completion)', adapter: true, status: missingEnv('completion', env).length ? `Not connected — add ${missingEnv('completion', env).join(', ')}` : 'Configured (env vars present; not a delivery claim)' },
    { id: 'facebook', label: 'Facebook Page posts', adapter: false, status: 'Not connected — no publishing adapter yet; drafts only' },
    { id: 'threads', label: 'Threads posts', adapter: false, status: 'Not connected — no publishing adapter yet; drafts only' },
    { id: 'ads', label: 'Meta Ads Manager', adapter: false, status: 'Not connected — no Marketing API adapter; ad drafts only' },
  ];
}

export function commitLog(s: BusinessStore, limit = 200): Commit[] {
  const ev = s.evidence() as Audit[];
  const refs = (keys: (string | null)[]) => { const k = keys.filter(Boolean) as string[]; return ev.filter((a) => k.some((x) => a.target === x || a.detail.includes(x))).slice(-6).map((a) => ({ seq: a.seq, action: a.action, hash: a.hash.slice(0, 12) })); };
  const runs = new Map(queue(s).map((r) => [r.id, r]));
  const used = new Set<string>(); const out: Commit[] = [];
  const add = (c: Omit<Commit, 'sha' | 'evidence' | 'status' | 'dispatch'> & { status?: CommitStatus; dispatch?: string }) => {
    const r = c.jevRunId ? runs.get(c.jevRunId) : undefined; if (c.jevRunId) used.add(c.jevRunId);
    out.push({ ...c, sha: (r?.payloadHash ?? c.id).replace(/[^a-f0-9]/gi, '').slice(0, 12) || c.id.slice(0, 12), status: c.status ?? jevState(r?.status), dispatch: c.dispatch ?? 'Not dispatched — sends go through /api/dispatch after approval', evidence: refs([c.id, c.jevRunId, c.dispatchId]) });
  };
  if (tableExists(s, 'mb_agent_drafts')) for (const d of s.db.prepare('SELECT id, agent, source, task, text, guard, jevRunId, createdAt FROM mb_agent_drafts ORDER BY createdAt DESC LIMIT ?').all(limit) as Record<string, string>[])
    add({ id: d.id, kind: 'agent', server: 'brain', author: `${d.agent} (${d.source})`, title: d.task.slice(0, 120), diff: plus(d.text), jevRunId: d.jevRunId || null, dispatchId: null, createdAt: d.createdAt, ...(d.jevRunId ? {} : { status: 'held' as const }) });
  if (tableExists(s, 'mb_hub_posts')) for (const p of s.db.prepare('SELECT * FROM mb_hub_posts ORDER BY createdAt DESC LIMIT ?').all(limit) as Record<string, string>[])
    add({ id: p.id, kind: 'hub', server: `swarm:${p.swarm}`, author: p.createdBy, title: `#${p.channel}${p.platform !== 'none' ? ` → ${p.platform}` : ''}`, diff: plus(p.body), jevRunId: p.jevRunId, dispatchId: null, createdAt: p.createdAt });
  if (tableExists(s, 'mb_social_posts')) for (const p of s.db.prepare('SELECT * FROM mb_social_posts ORDER BY createdAt DESC LIMIT ?').all(limit) as Record<string, string>[])
    add({ id: p.id, kind: 'social', server: KIND_SERVER.social, author: p.createdBy, title: `${p.channel} post for ${p.scheduledFor}`, diff: plus(p.body), jevRunId: p.jevRunId, dispatchId: null, createdAt: p.createdAt });
  if (tableExists(s, 'mb_ad_drafts')) for (const a of s.db.prepare('SELECT * FROM mb_ad_drafts ORDER BY createdAt DESC LIMIT ?').all(limit) as Record<string, string | number>[])
    add({ id: String(a.id), kind: 'ad', server: KIND_SERVER.ad, author: String(a.createdBy), title: `Ad draft: ${a.name}`, diff: [`+ objective: ${a.objective}`, `+ dailyBudgetMinor: ${a.dailyBudgetMinor} ${a.currency}`, `+ audience: ${a.audience}`, ...plus(String(a.creative))], jevRunId: String(a.jevRunId), dispatchId: null, createdAt: String(a.createdAt), dispatch: 'Not connected — no Marketing API adapter' });
  if (tableExists(s, 'mb_suite_drafts')) for (const a of s.db.prepare('SELECT * FROM mb_suite_drafts ORDER BY createdAt DESC LIMIT ?').all(limit) as Record<string, string>[])
    add({ id: a.id, kind: `suite.${a.product}`, server: 'suite', author: a.createdBy, title: `${a.product} draft (${a.mode})`, diff: plus(a.body), jevRunId: a.jevRunId, dispatchId: null, createdAt: a.createdAt });
  for (const d of listDispatches(s)) {
    const st: CommitStatus = d.status === 'pending' ? 'pending' : d.status;
    add({ id: d.id, kind: `dispatch.${d.channel}`, server: KIND_SERVER[`dispatch.${d.channel}`] ?? 'hq', author: d.proposedBy, title: `${d.channel} dispatch`, diff: JSON.stringify(d.payload, null, 1).split('\n').slice(0, 30).map((l) => `+ ${l}`), jevRunId: null, dispatchId: d.id, createdAt: d.createdAt, status: st, dispatch: `/api/dispatch: ${d.status}${d.approvedBy ? `, approved by ${d.approvedBy}` : ''}${d.providerStatus != null ? `, provider ${d.providerStatus}` : ''}` });
  }
  for (const r of runs.values()) if (!used.has(r.id)) {
    const inp = r.input as { role?: string; args?: { title?: string }; rationale?: string; source?: string };
    add({ id: r.id, kind: 'jev', server: KIND_SERVER.jev, author: `${inp.role ?? 'agent'} (${inp.source ?? 'rule'})`, title: inp.args?.title ?? 'Agent proposal', diff: [`+ reminders.create: ${inp.args?.title ?? ''}`, ...(inp.rationale ? [`  # ${inp.rationale}`] : [])], jevRunId: r.id, dispatchId: null, createdAt: r.createdAt });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}
