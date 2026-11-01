/** AgentVerse OS V3: a read and draft layer over records MeTaBos already has.
 *  - Workspaces exist only when the owner creates them. Nothing is seeded.
 *  - The Unified Inbox reads mb_conversations / mb_messages. A reply is a dispatch proposal and
 *    is sent only after Jev approval through /api/dispatch.
 *  - The ads wizard writes a draft and a Jev item. It makes no Marketing API call. ROAS appears
 *    only when real insights rows exist, and auto-rules can only propose a pause as a Jev item.
 *  - The Git console is built on commitLog and the evidence chain. Revert and cherry-pick are new Jev items. */
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import { clawStatus, yaoStatus } from '../b3/agent-run';
import { localStatus } from '../ai/local-llm';
import { z } from 'zod';
import { BusinessError, type BusinessStore } from '../store';
import { propose as jevPropose, queue } from '../ai/jev';
import { adDraft, commitLog, ensureAds, metaConnections, type Commit } from '../server/commits';
import { propose as proposeDispatch } from '../dispatch/service';
import { ensureTalk } from '../talk/core';
import { missingEnv } from '../dispatch/adapters';
import type { Env } from '../dispatch/adapters';

/** Names the owner asked for. These are suggestions for the create form only and are never inserted automatically. */
export const SUGGESTED_WORKSPACES = ['Codes By Febin', 'Ewaste Kochi', 'XFree.app', 'Spider Kids'] as const;
/** Channel groups follow the owner's commit-console reference. The earlier group names
 *  (Unified Inbox, Content Studio, Business Suite, AgentVerse, Meta AI Lab) become the channels inside these groups. */
export const CHANNEL_GROUPS = [
  { id: 'git', label: 'Git for agents', channels: ['commit-log', 'branches', 'pending-approvals', 'knowledge-graph'] },
  { id: 'suite', label: 'Meta Suite', channels: ['unified-inbox', 'facebook', 'instagram', 'whatsapp', 'messenger', 'threads', 'meta-ai'] },
  { id: 'ads', label: 'Ads command center', channels: ['campaigns', 'creatives-lab', 'audiences', 'roas-dashboard'], business: true },
  { id: 'swarm', label: 'Agent swarm', channels: ['agents-online', 'fleet-console', 'sparring-pit', 'blame', 'onboarding', 'roles'] },
] as const;
/** SHIPPED means a Jev approval and a dispatch receipt (provider accepted). Nothing else counts as shipped. */
export const commitTag = (c: Pick<Commit, 'status' | 'dispatchId'>) => c.status === 'sent' && c.dispatchId ? 'SHIPPED' : c.status === 'pending' ? 'PENDING' : c.status.toUpperCase();
/** Admin, Agent and Viewer map onto the existing member roles, so no new auth path is added. */
export const AV_ROLES = { owner: 'Admin', manager: 'Agent', member: 'Viewer' } as const;
export const FOOTNOTE = 'Built by codesbyfebin — Kochi';

const now = () => new Date().toISOString();
function ensure(s: BusinessStore) {
  s.db.exec(`CREATE TABLE IF NOT EXISTS mb_av_workspaces(id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, createdBy TEXT NOT NULL, createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mb_av_ads(adId TEXT PRIMARY KEY, workspaceId TEXT, placements TEXT NOT NULL, createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mb_av_insights(adId TEXT NOT NULL, day TEXT NOT NULL, spendMinor INTEGER NOT NULL, revenueMinor INTEGER NOT NULL, source TEXT NOT NULL, PRIMARY KEY(adId, day));
    CREATE TABLE IF NOT EXISTS mb_av_rules(id TEXT PRIMARY KEY, adId TEXT NOT NULL, roasBelowX100 INTEGER NOT NULL, createdBy TEXT NOT NULL, createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mb_av_ops(id TEXT PRIMARY KEY, op TEXT NOT NULL, commitId TEXT NOT NULL, target TEXT, jevRunId TEXT NOT NULL, createdBy TEXT NOT NULL, createdAt TEXT NOT NULL);`);
}
const jev = (s: BusinessStore, taskId: string, title: string, rationale: string) =>
  jevPropose(s, { taskId, role: 'writer', tool: 'reminders.create', args: { title: title.slice(0, 180) }, rationale, source: 'rule', model: null });

// Workspaces
export const WorkspaceInput = z.object({ name: z.string().trim().min(1).max(80) }).strict();
export function listWorkspaces(s: BusinessStore) { ensure(s); return s.db.prepare('SELECT * FROM mb_av_workspaces ORDER BY createdAt').all() as { id: string; name: string; createdBy: string; createdAt: string }[]; }
export function createWorkspace(s: BusinessStore, actor: string, raw: unknown) {
  const { name } = WorkspaceInput.parse(raw); ensure(s);
  if (s.db.prepare('SELECT 1 FROM mb_av_workspaces WHERE name=?').get(name)) throw new BusinessError('A workspace with that name exists', 409);
  const id = `ws_${randomUUID().slice(0, 8)}`;
  s.transact(() => { s.db.prepare('INSERT INTO mb_av_workspaces VALUES(?,?,?,?)').run(id, name, actor, now()); s.appendEvidence('agentverse.workspace.created', id, `${name} by ${actor}`); });
  return { id, name };
}

// Unified Inbox
export const INBOX_SOURCES = ['whatsapp', 'instagram', 'messenger', 'facebook', 'threads', 'email'] as const;
export function inboxStatus(env: Env) {
  return INBOX_SOURCES.map((id) => {
    if (id === 'whatsapp' || id === 'instagram') { const m = missingEnv(id, env); return { id, adapter: true, status: m.length ? `Not connected — add ${m.join(', ')}` : 'Configured (env vars present; not a delivery claim)' }; }
    return { id, adapter: false, status: 'Not connected' };
  });
}
export function inbox(s: BusinessStore) {
  ensureTalk(s);
  const convs = s.db.prepare("SELECT * FROM mb_conversations WHERE channel IN ('whatsapp','instagram') ORDER BY COALESCE(lastInboundAt, updatedAt) DESC LIMIT 100").all() as { id: string; channel: string; address: string; name: string | null; status: string; lastInboundAt: string | null }[];
  return convs.map((c) => ({ ...c, messages: s.db.prepare('SELECT id, direction, author, body, at, dispatchId FROM mb_messages WHERE conversationId=? ORDER BY at DESC LIMIT 20').all(c.id).reverse() as { id: string; direction: string; author: string; body: string; at: string; dispatchId: string | null }[] }));
}
export const ReplyInput = z.object({ conversationId: z.string().min(1).max(80), body: z.string().trim().min(1).max(4096) }).strict();
/** "Approve" on a drafted reply. This only proposes a dispatch. The send still needs a Jev decide with the payload hash and a POST to /api/dispatch. */
export function approveReply(s: BusinessStore, actor: string, raw: unknown) {
  const r = ReplyInput.parse(raw); ensureTalk(s);
  const c = s.db.prepare('SELECT channel, address FROM mb_conversations WHERE id=?').get(r.conversationId) as { channel: string; address: string } | undefined;
  if (!c) throw new BusinessError('Conversation not found', 404);
  if (c.channel !== 'whatsapp' && c.channel !== 'instagram') throw new BusinessError('Not connected', 424);
  const d = proposeDispatch(s, actor, c.channel, { to: c.address, body: r.body });
  s.transact(() => s.appendEvidence('agentverse.inbox.reply.proposed', d.id, `conversation ${r.conversationId}; awaiting Jev + /api/dispatch`));
  return { dispatchId: d.id, payloadHash: d.payloadHash, status: d.status };
}

// Ads wizard
export const PLACEMENTS = ['facebook_feed', 'instagram_feed', 'instagram_stories', 'reels', 'messenger'] as const;
export const AdWizardInput = z.object({
  workspaceId: z.string().max(40).nullable().default(null),
  objective: z.enum(['awareness', 'traffic', 'engagement', 'leads', 'sales']),
  audience: z.string().trim().min(1).max(500),
  placements: z.array(z.enum(PLACEMENTS)).min(1).max(PLACEMENTS.length),
  creative: z.object({ name: z.string().trim().min(1).max(120), text: z.string().trim().min(1).max(2000) }).strict(),
  dailyBudgetMinor: z.number().int().min(100).max(10_000_000),
}).strict();
export function adWizard(s: BusinessStore, actor: string, raw: unknown) {
  const w = AdWizardInput.parse(raw); ensure(s);
  if (w.workspaceId && !s.db.prepare('SELECT 1 FROM mb_av_workspaces WHERE id=?').get(w.workspaceId)) throw new BusinessError('Workspace not found', 404);
  const r = adDraft(s, actor, { name: w.creative.name, objective: w.objective, dailyBudgetMinor: w.dailyBudgetMinor, currency: 'INR', audience: w.audience, creative: w.creative.text });
  s.db.prepare('INSERT INTO mb_av_ads VALUES(?,?,?,?)').run(r.id, w.workspaceId, JSON.stringify(w.placements), now());
  return r;
}
/** ROAS = revenue / spend, reported only from real insights rows. This returns null when there are none. */
export function roas(s: BusinessStore, adId: string): number | null {
  ensure(s); const t = s.db.prepare('SELECT SUM(spendMinor) sp, SUM(revenueMinor) rv FROM mb_av_insights WHERE adId=?').get(adId) as { sp: number | null; rv: number | null };
  return t.sp ? Math.round((Number(t.rv) / t.sp) * 100) / 100 : null;
}
export const RuleInput = z.object({ adId: z.string().min(1).max(40), roasBelow: z.number().min(0.1).max(100) }).strict();
export function addRule(s: BusinessStore, actor: string, raw: unknown) {
  const r = RuleInput.parse(raw); ensure(s); const id = `rule_${randomUUID().slice(0, 8)}`;
  s.transact(() => { s.db.prepare('INSERT INTO mb_av_rules VALUES(?,?,?,?,?)').run(id, r.adId, Math.round(r.roasBelow * 100), actor, now()); s.appendEvidence('agentverse.ads.rule.created', id, `propose pause of ${r.adId} if ROAS < ${r.roasBelow}`); });
  return { id };
}
/** Checks rules against real insights. A breach only proposes a pause as a Jev item and never pauses anything. */
export function evaluateRules(s: BusinessStore) {
  ensure(s); const out: { ruleId: string; adId: string; roas: number; jevRunId: string }[] = [];
  for (const r of s.db.prepare('SELECT * FROM mb_av_rules').all() as { id: string; adId: string; roasBelowX100: number }[]) {
    const v = roas(s, r.adId); if (v === null || v * 100 >= r.roasBelowX100) continue;
    const run = jev(s, `rule-${r.id}-${Date.now()}`, `Proposed pause of ad ${r.adId}: ROAS ${v} < ${r.roasBelowX100 / 100}`, 'Auto-rule proposal only; no Marketing API adapter, nothing is paused');
    s.transact(() => s.appendEvidence('agentverse.ads.rule.proposed_pause', r.adId, `Jev ${run.id}`)); out.push({ ruleId: r.id, adId: r.adId, roas: v, jevRunId: run.id });
  }
  return out;
}
export function adsView(s: BusinessStore) {
  ensure(s); ensureAds(s);
  const ads = s.db.prepare('SELECT a.*, m.placements, m.workspaceId FROM mb_ad_drafts a LEFT JOIN mb_av_ads m ON m.adId=a.id ORDER BY a.createdAt DESC').all() as Record<string, string | number | null>[];
  type AdRow = { id: string; name: string; objective: string; dailyBudgetMinor: number; currency: string; audience: string; creative: string; workspaceId: string | null };
  return ads.map((a) => ({ ...(a as unknown as AdRow), placements: a.placements ? JSON.parse(String(a.placements)) : [], roas: roas(s, String(a.id)), rules: s.db.prepare('SELECT id, roasBelowX100 FROM mb_av_rules WHERE adId=?').all(a.id) as { id: string; roasBelowX100: number }[] }));
}

// Git console
export function blame(commits: Commit[]) {
  const m = new Map<string, { author: string; commits: number; lines: number; kinds: Set<string> }>();
  for (const c of commits) { const e = m.get(c.author) ?? { author: c.author, commits: 0, lines: 0, kinds: new Set() }; e.commits++; e.lines += c.diff.length; e.kinds.add(c.kind); m.set(c.author, e); }
  return [...m.values()].map((e) => ({ ...e, kinds: [...e.kinds] })).sort((a, b) => b.lines - a.lines);
}
export const GitOpInput = z.object({ op: z.enum(['revert', 'cherry-pick']), commitId: z.string().min(1).max(80), target: z.string().max(40).optional() }).strict();
export function gitOp(s: BusinessStore, actor: string, raw: unknown) {
  const g = GitOpInput.parse(raw); ensure(s);
  const c = commitLog(s).find((x) => x.id === g.commitId); if (!c) throw new BusinessError('Commit not found', 404);
  if (g.op === 'cherry-pick' && !g.target) throw new BusinessError('Pick a target workspace', 422);
  const inverse = g.op === 'revert' ? c.diff.map((l) => l.replace(/^\+ /, '- ')) : c.diff;
  const id = `op_${randomUUID().slice(0, 8)}`;
  const run = jev(s, `${g.op}-${id}`, `${g.op === 'revert' ? 'Revert' : `Cherry-pick to ${g.target}`} ${c.sha}: ${c.title}`, `${g.op} of ${c.kind} ${c.id}; nothing changes until approved in Jev. Diff: ${inverse.slice(0, 5).join(' | ')}`.slice(0, 900));
  s.transact(() => { s.db.prepare('INSERT INTO mb_av_ops VALUES(?,?,?,?,?,?,?)').run(id, g.op, c.id, g.target ?? null, run.id, actor, now()); s.appendEvidence(`agentverse.git.${g.op}.pending_jev`, c.id, `op ${id}; Jev ${run.id}`); });
  return { id, jevRunId: run.id, diff: inverse };
}

// Onboarding (presence only; values are never returned)
export const ONBOARDING = [
  { env: 'META_APP_ID', step: 'Create a Meta app at developers.facebook.com and copy its App ID.' },
  { env: 'META_APP_SECRET', step: 'App settings → Basic → App secret. Server-side only; it signs appsecret_proof.' },
  { env: 'META_VERIFY_TOKEN', step: 'Choose a random string and use it as the webhook verify token.' },
  { env: 'MUZEBOS_WHATSAPP_CLOUD_ACCESS_TOKEN', step: 'WhatsApp → API setup → system user token. Server-side only.' },
  { env: 'MUZEBOS_WHATSAPP_PHONE_NUMBER_ID', step: 'WhatsApp → API setup → phone number ID.' },
  { env: 'MUZEBOS_INSTAGRAM_ACCESS_TOKEN', step: 'Instagram API with Instagram Login → generate a token. Server-side only.' },
  { env: 'MODEL_API_KEY', step: 'Meta Llama API key, set at runtime from META_LLAMA_API_KEY. Never committed.' },
] as const;
export const onboarding = (env: Env) => ONBOARDING.map((o) => ({ ...o, present: !!env[o.env]?.trim() }));

// Search and graph
export function search(s: BusinessStore, q: string, agents: string[]) {
  const t = q.trim().toLowerCase(); if (!t) return [];
  const hit = (x: string) => x.toLowerCase().includes(t);
  const out: { type: 'commit' | 'inbox' | 'ad' | 'agent'; id: string; label: string }[] = [];
  for (const c of commitLog(s)) if (hit(`${c.sha} ${c.title} ${c.author} ${c.diff.join(' ')}`)) out.push({ type: 'commit', id: c.id, label: `${c.sha} ${c.title}` });
  for (const c of inbox(s)) if (hit(`${c.name ?? ''} ${c.address} ${c.messages.map((m) => m.body).join(' ')}`)) out.push({ type: 'inbox', id: c.id, label: `${c.channel}: ${c.name ?? c.address}` });
  for (const a of adsView(s)) if (hit(`${a.name} ${a.audience} ${a.creative}`)) out.push({ type: 'ad', id: String(a.id), label: `Ad draft: ${a.name}` });
  for (const a of agents) if (hit(a)) out.push({ type: 'agent', id: a, label: a });
  return out.slice(0, 50);
}
export function graph(s: BusinessStore) {
  const nodes = new Map<string, { id: string; type: string; label: string }>(); const edges: { from: string; to: string; rel: string }[] = [];
  const n = (id: string, type: string, label: string) => { nodes.set(id, { id, type, label }); return id; };
  for (const w of listWorkspaces(s)) n(`ws:${w.id}`, 'workspace', w.name);
  for (const c of commitLog(s, 100)) { const a = n(`author:${c.author}`, 'author', c.author); const k = n(`commit:${c.id}`, 'commit', c.sha); edges.push({ from: a, to: k, rel: 'wrote' }); }
  for (const a of adsView(s)) { const id = n(`commit:${a.id}`, 'commit', `ad ${a.name}`); if (a.workspaceId) edges.push({ from: `ws:${a.workspaceId}`, to: id, rel: 'owns' }); }
  for (const c of inbox(s)) { const id = n(`conv:${c.id}`, 'conversation', c.name ?? c.address); for (const m of c.messages) if (m.dispatchId && nodes.has(`commit:${m.dispatchId}`)) edges.push({ from: id, to: `commit:${m.dispatchId}`, rel: 'reply' }); }
  return { nodes: [...nodes.values()], edges };
}
export function overview(s: BusinessStore, env: Env, swarms: { name: string; agents: number; pending: number }[] = []) {
  const commits = commitLog(s);
  return { workspaces: listWorkspaces(s), suggested: SUGGESTED_WORKSPACES, groups: CHANNEL_GROUPS, inbox: inbox(s), inboxStatus: inboxStatus(env), ads: adsView(s), adsConnection: metaConnections(env).find((m) => m.id === 'ads')!.status, commits, blame: blame(commits), onboarding: onboarding(env), graph: graph(s), swarms, footnote: FOOTNOTE };
}

// Home Server overview (HUD). Live Activity comes only from the evidence chain and Jev. Queue Status probes only real infrastructure.
const ACTIVITY: [RegExp, string][] = [[/lead/i, 'Lead captured'], [/inbound|webhook|talk\.message\.in/i, 'DM received'], [/escalat|handoff/i, 'Escalated to human'], [/schedul/i, 'Post scheduled'], [/jev|draft|propos/i, 'Agent drafted'], [/dispatch.*sent|sent/i, 'Sent via /api/dispatch']];
export function liveActivity(s: BusinessStore, limit = 25) {
  const ev = s.evidence().slice(-limit).reverse();
  return ev.map((e) => ({ seq: e.seq, kind: ACTIVITY.find(([r]) => r.test(e.action))?.[1] ?? 'Recorded', action: e.action, target: e.target, detail: String(e.detail ?? '').slice(0, 160), at: e.createdAt, hash: e.hash }));
}
type Probe = { id: string; label: string; state: 'ready' | 'not_connected' | 'not_configured'; detail: string };
const tcp = (url: string, port: number) => new Promise<boolean>((res) => { try { const u = new URL(url.includes('://') ? url : `tcp://${url}`); const sock = net.connect({ host: u.hostname, port: Number(u.port) || port, timeout: 1000 }); sock.once('connect', () => { sock.destroy(); res(true); }); sock.once('error', () => res(false)); sock.once('timeout', () => { sock.destroy(); res(false); }); } catch { res(false); } });
export async function queueStatus(s: BusinessStore, env: Env, f: typeof fetch = fetch): Promise<Probe[]> {
  const claw = clawStatus(env), yao = yaoStatus(env), llm = await localStatus(env, f);
  const jevWaiting = queue(s).length;
  const out: Probe[] = [
    { id: 'jev', label: 'Jev approval queue', state: 'ready', detail: `${jevWaiting} waiting (mb_jev_runs)` },
    { id: 'claw', label: 'claw-local queue', state: claw.connected ? 'ready' : 'not_configured', detail: claw.label },
    { id: 'yao', label: 'Yao', state: yao.connected ? 'ready' : 'not_configured', detail: yao.connected ? 'Configured (env present; not a health check)' : yao.label },
    { id: 'llm', label: 'Local LLM (llama-server)', state: llm.state, detail: llm.model ? `${llm.label}: ${llm.model}` : llm.label },
  ];
  const ollama = env.MUZEBOS_OLLAMA_URL?.trim();
  out.push(ollama ? { id: 'ollama', label: 'Ollama', state: (await tcp(ollama, 11434)) ? 'ready' : 'not_connected', detail: ollama.replace(/\/\/[^@/]*@/, '//') } : { id: 'ollama', label: 'Ollama', state: 'not_configured', detail: 'Not configured — set MUZEBOS_OLLAMA_URL' });
  for (const [id, label, key, port] of [['kafka', 'Kafka', 'KAFKA_BROKERS', 9092], ['redis', 'Redis', 'REDIS_URL', 6379], ['qdrant', 'Qdrant', 'QDRANT_URL', 6333]] as const) {
    const v = env[key]?.trim().split(',')[0];
    out.push(!v ? { id, label, state: 'not_configured', detail: 'Not configured' } : (await tcp(v, port)) ? { id, label, state: 'ready', detail: 'Reachable (port open; no lag or key metrics read)' } : { id, label, state: 'not_connected', detail: 'Not connected (configured but not reachable)' });
  }
  return out;
}
export async function home(s: BusinessStore, env: Env) {
  const commits = commitLog(s);
  const campaigns = adsView(s).map((a) => { const c = commits.find((x) => x.id === a.id); return { id: a.id, name: a.name, objective: a.objective, dailyBudgetMinor: a.dailyBudgetMinor, status: c ? commitTag(c) : 'DRAFT', roas: a.roas }; });
  return { activity: liveActivity(s), campaigns, queues: await queueStatus(s, env), jevWaiting: queue(s).length };
}
