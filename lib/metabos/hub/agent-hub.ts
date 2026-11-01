/**
 * Agent Hub (built during the event): a chat-style command center over real records.
 * Layout idea from the owner's "Meta Command Center" prototype (/workspace/designs/agent-command-center*), no
 * prototype data or code kept. Mapping: workspace = Claw swarm, channel = sub-cluster (+ #approvals, #runs,
 * owner-created channels), message = a real agent draft (Yao / claw-local) or composer draft with its Jev state,
 * member = agent card. The composer never posts: each message becomes a draft plus ONE pending Jev item.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { BusinessStore } from '../store';
import { BusinessError } from '../store';
import { propose } from '../ai/jev';
import { WorkflowEngine } from '../workflows';
import { assertSafeOutput } from '../b3/safe-outputs';
import { checkCard, importSwarms, swarmNames, swarmTree, type AgentCard } from '../b3/swarms';
import { listDrafts } from '../b3/agent-run';

export const HUB_PLATFORMS = ['facebook', 'instagram', 'threads', 'whatsapp', 'messenger', 'none'] as const;
export type HubPlatform = typeof HUB_PLATFORMS[number];
export const SYSTEM_CHANNELS = ['approvals', 'runs'] as const;

function ensure(s: BusinessStore) {
  s.db.exec(`CREATE TABLE IF NOT EXISTS mb_hub_channels(id TEXT PRIMARY KEY, swarm TEXT NOT NULL, name TEXT NOT NULL, topic TEXT NOT NULL, createdBy TEXT NOT NULL, createdAt TEXT NOT NULL, UNIQUE(swarm, name));
  CREATE TABLE IF NOT EXISTS mb_hub_posts(id TEXT PRIMARY KEY, swarm TEXT NOT NULL, channel TEXT NOT NULL, platform TEXT NOT NULL, body TEXT NOT NULL, jevRunId TEXT NOT NULL, createdBy TEXT NOT NULL, createdAt TEXT NOT NULL);`);
}
const slug = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const jevLabel = (st: string | null) => st == null ? 'not sent to Jev' : st === 'awaiting_approval' ? 'pending' : st === 'cancelled' || st === 'failed' || st === 'timed_out' ? 'rejected' : 'approved';

function cards(s: BusinessStore, swarm: string): AgentCard[] {
  return swarmTree(s, { swarm }).swarms.flatMap((w) => w.subclusters.flatMap((c) => c.agents)) as AgentCard[];
}
function requireSwarm(s: BusinessStore, swarm: string) { if (!swarmNames(s).includes(swarm)) throw new BusinessError('Unknown swarm', 404); }

export type HubMessage = { id: string; kind: 'agent_draft' | 'composer_draft'; author: string; cardId: string | null; source: string; text: string; guard: string | null; jev: string; jevRunId: string | null; platform: string | null; createdAt: string };

export function hubView(s: BusinessStore, swarm?: string, channel?: string) {
  ensure(s);
  const names = swarmNames(s);
  const e = new WorkflowEngine(s);
  const drafts = listDrafts(s, 500) as unknown as { id: string; cardId: string; agent: string; source: string; text: string; guard: string; jevRunId: string | null; jevStatus: string | null; createdAt: string }[];
  const posts = s.db.prepare('SELECT * FROM mb_hub_posts ORDER BY createdAt').all() as { id: string; swarm: string; channel: string; platform: string; body: string; jevRunId: string; createdBy: string; createdAt: string }[];
  const prefix = (sw: string) => cards(s, sw)[0]?.id.slice(0, 3) ?? '';
  const servers = names.map((n) => {
    const p = prefix(n); const ds = drafts.filter((d) => d.cardId.startsWith(p));
    const pending = ds.filter((d) => d.jevStatus === 'awaiting_approval').length + posts.filter((x) => x.swarm === n && e.run(x.jevRunId).status === 'awaiting_approval').length;
    return { name: n, agents: cards(s, n).length, runs: ds.length, pending };
  });
  const sw = swarm && names.includes(swarm) ? swarm : names[0];
  if (!sw) return { servers, swarm: null, channels: [], channel: null, messages: [], members: [] };
  const all = cards(s, sw);
  const subs = [...new Set(all.map((c) => c.subcluster ?? 'Swarm lead'))];
  const custom = s.db.prepare('SELECT * FROM mb_hub_channels WHERE swarm=? ORDER BY createdAt').all(sw) as { id: string; name: string; topic: string }[];
  const channels = [
    ...SYSTEM_CHANNELS.map((c) => ({ id: c, name: c, group: 'Review', topic: c === 'approvals' ? 'Drafts waiting for a Jev decision' : 'Every agent run in this swarm' })),
    ...subs.map((sc) => ({ id: `sc:${slug(sc)}`, name: slug(sc), group: 'Sub-clusters', topic: `${all.filter((c) => (c.subcluster ?? 'Swarm lead') === sc).length} agent cards`, subcluster: sc })),
    ...custom.map((c) => ({ id: `c:${c.name}`, name: c.name, group: 'Owner channels', topic: c.topic })),
  ];
  const ch = channels.find((c) => c.id === channel) ?? channels[0];
  const ids = new Set(all.map((c) => c.id));
  const scCards = 'subcluster' in ch ? new Set(all.filter((c) => (c.subcluster ?? 'Swarm lead') === (ch as { subcluster: string }).subcluster).map((c) => c.id)) : ids;
  const dm: HubMessage[] = drafts.filter((d) => scCards.has(d.cardId)).map((d) => ({ id: d.id, kind: 'agent_draft', author: d.agent, cardId: d.cardId, source: d.source, text: d.text, guard: d.guard, jev: jevLabel(d.jevStatus), jevRunId: d.jevRunId, platform: null, createdAt: d.createdAt }));
  const pm: HubMessage[] = posts.filter((p) => p.swarm === sw).map((p) => ({ id: p.id, kind: 'composer_draft', author: p.createdBy, cardId: null, source: 'composer', text: p.body, guard: null, jev: jevLabel(e.run(p.jevRunId).status), jevRunId: p.jevRunId, platform: p.platform, createdAt: p.createdAt, channel: p.channel } as HubMessage & { channel: string }));
  let messages: HubMessage[];
  if (ch.id === 'runs') messages = dm;
  else if (ch.id === 'approvals') messages = [...dm, ...pm].filter((m) => m.jev === 'pending');
  else messages = [...dm, ...pm.filter((m) => (m as HubMessage & { channel: string }).channel === ch.id)];
  messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const ran = new Map<string, string>(); for (const d of drafts) if (ids.has(d.cardId)) ran.set(d.cardId, d.jevStatus === 'awaiting_approval' ? 'awaiting review' : ran.get(d.cardId) ?? 'has drafts');
  const members = [...scCards].map((id) => all.find((c) => c.id === id)!).map((c) => ({ id: c.id, name: c.name, role: c.role, tier: c.tier, risk: c.risk_class, jev: c.jev_required, tools: c.tools, status: ran.get(c.id) ?? 'definition' }));
  return { servers, swarm: sw, channels, channel: ch, messages: messages.slice(-200), members };
}

export const ChannelInput = z.object({ swarm: z.string().max(80), name: z.string().trim().min(2).max(40), topic: z.string().trim().max(200).default('') }).strict();
export function createChannel(s: BusinessStore, actor: string, raw: unknown) {
  ensure(s); const c = ChannelInput.parse(raw); requireSwarm(s, c.swarm);
  const name = slug(c.name); if (name.length < 2 || (SYSTEM_CHANNELS as readonly string[]).includes(name)) throw new BusinessError('Choose another channel name', 400);
  if (s.db.prepare('SELECT 1 FROM mb_hub_channels WHERE swarm=? AND name=?').get(c.swarm, name)) throw new BusinessError('That channel already exists', 409);
  const id = `hc_${randomUUID().slice(0, 12)}`;
  s.transact(() => { s.db.prepare('INSERT INTO mb_hub_channels VALUES(?,?,?,?,?,?)').run(id, c.swarm, name, c.topic, actor, new Date().toISOString()); s.appendEvidence('hub.channel.created', id, `${c.swarm} #${name}`); });
  return { id: `c:${name}`, name };
}

export const AgentInput = z.object({ swarm: z.string().max(80), subcluster: z.string().max(80).nullable(), name: z.string().trim().min(2).max(80), role: z.string().trim().min(2).max(80), responsibility: z.string().trim().min(10).max(600), tools: z.array(z.string().max(60)).max(12), risk: z.enum(['low', 'medium', 'high']), tier: z.enum(['pm', 'worker']).default('worker') }).strict();
/** Build agent: writes a new agent DEFINITION card. Tools are limited to tools already used in that swarm; any external-effect tool or high risk forces Jev. */
export function buildAgent(s: BusinessStore, actor: string, raw: unknown) {
  const a = AgentInput.parse(raw); requireSwarm(s, a.swarm);
  const all = cards(s, a.swarm); const allowed = new Set(all.flatMap((c) => c.tools));
  const bad = a.tools.filter((t) => !allowed.has(t)); if (bad.length) throw new BusinessError(`Tool not available in this swarm: ${bad.join(', ')}`, 400);
  if (a.subcluster && !all.some((c) => c.subcluster === a.subcluster)) throw new BusinessError('Unknown sub-cluster', 400);
  const prefix = all[0].id.slice(0, 3); const n = all.filter((c) => c.id.startsWith(`${prefix}U`)).length + 1;
  const card: AgentCard = { id: `${prefix}U${String(n).padStart(3, '0')}`, swarm: a.swarm, subcluster: a.subcluster, tier: a.tier, name: a.name, role: a.role, responsibility: a.responsibility, inputs: [], outputs: ['brain_draft'], skills: [], tools: a.tools, preferred_model_tier: 'small', jev_required: a.risk === 'high' || a.tools.some((t) => /^(dispatch|connector|planned):/.test(t)), risk_class: a.risk, status: 'definition' };
  checkCard(card); importSwarms(s, [card]);
  s.transact(() => s.appendEvidence('hub.agent.built', card.id, `${a.swarm}/${a.subcluster ?? 'lead'} by ${actor}; jev ${card.jev_required}`));
  return card;
}

export const PostInput = z.object({ swarm: z.string().max(80), channel: z.string().max(60), platform: z.enum(HUB_PLATFORMS).default('none'), body: z.string().trim().min(1).max(3000) }).strict();
/** Composer: draft + one pending Jev item. Never publishes; platform is a label until a verified adapter exists. */
export function postDraft(s: BusinessStore, actor: string, raw: unknown) {
  ensure(s); const p = PostInput.parse(raw); requireSwarm(s, p.swarm);
  assertSafeOutput(s, 'writer', 'social_post', 'hub');
  const id = `hp_${randomUUID().slice(0, 12)}`;
  const run = propose(s, { taskId: `hub-${id}`, role: 'writer', tool: 'reminders.create', args: { title: `Review ${p.platform === 'none' ? '' : `${p.platform} `}draft ${id} in ${p.swarm}: ${p.body.slice(0, 80)}`.slice(0, 180) }, rationale: 'Agent Hub composer draft; nothing is posted without Jev + /api/dispatch', source: 'rule', model: null });
  s.transact(() => { s.db.prepare('INSERT INTO mb_hub_posts VALUES(?,?,?,?,?,?,?,?)').run(id, p.swarm, p.channel, p.platform, p.body, run.id, actor, new Date().toISOString()); s.appendEvidence('hub.draft.pending_jev', id, `Jev ${run.id}; not posted`); });
  return { id, jevRunId: run.id, status: 'pending_jev' as const, posted: false as const };
}
