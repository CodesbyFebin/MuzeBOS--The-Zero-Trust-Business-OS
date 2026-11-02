/**
 * Claw swarms (built during the event). Imports the 1000 agent definition cards
 * (lib/metabos/b3/swarms/agents.json, generated 2026-10-28) into SQLite and serves swarm → sub-cluster → agent.
 * These are definitions only, not running agents. Import re-checks every card: any card with an
 * external-effect tool must be jev_required, and no card is ever marked running here.
 */
import type { BusinessStore } from '../store';
import { BusinessError } from '../store';
import data from './swarms/agents.json';

export type Tier = 'lead' | 'pm' | 'worker';
export type Risk = 'low' | 'medium' | 'high';
export type AgentCard = { id: string; swarm: string; subcluster: string | null; tier: Tier; name: string; role: string; responsibility: string; inputs: string[]; outputs: string[]; skills: { name: string; source: string }[]; tools: string[]; preferred_model_tier: 'small' | 'medium' | 'large'; jev_required: boolean; risk_class: Risk; status: 'definition' };
type File = { generated: string; note: string; external_effect_tools: string[]; cards: AgentCard[] };
const FILE = data as unknown as File;

function ensure(s: BusinessStore) {
  s.db.exec(`CREATE TABLE IF NOT EXISTS mb_swarm_agents(id TEXT PRIMARY KEY, swarm TEXT NOT NULL, subcluster TEXT, tier TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, responsibility TEXT NOT NULL, inputs TEXT NOT NULL, outputs TEXT NOT NULL, skills TEXT NOT NULL, tools TEXT NOT NULL, preferred_model_tier TEXT NOT NULL, jev_required INTEGER NOT NULL, risk_class TEXT NOT NULL, status TEXT NOT NULL, importedAt TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS mb_swarm_agents_swarm ON mb_swarm_agents(swarm, subcluster);`);
}

/** Validate one card. Throws on a card that could act without Jev. */
export function checkCard(c: AgentCard, external = new Set(FILE.external_effect_tools)) {
  if (!c.id || !c.swarm || !c.name || !['lead', 'pm', 'worker'].includes(c.tier) || !['low', 'medium', 'high'].includes(c.risk_class)) throw new BusinessError(`Bad card ${c.id}`, 400);
  if (c.tools.some((t) => external.has(t)) && !c.jev_required) throw new BusinessError(`Card ${c.id} has an external-effect tool but no Jev`, 400);
  if (c.status !== 'definition') throw new BusinessError(`Card ${c.id} must be a definition`, 400);
}

/** Idempotent import. Returns the number of cards in the table. */
export function importSwarms(s: BusinessStore, cards: AgentCard[] = FILE.cards) {
  ensure(s);
  const ext = new Set(FILE.external_effect_tools); cards.forEach((c) => checkCard(c, ext));
  const now = new Date().toISOString();
  const ins = s.db.prepare('INSERT OR REPLACE INTO mb_swarm_agents VALUES (@id,@swarm,@subcluster,@tier,@name,@role,@responsibility,@inputs,@outputs,@skills,@tools,@preferred_model_tier,@jev_required,@risk_class,@status,@importedAt)');
  s.db.transaction(() => { for (const c of cards) ins.run({ ...c, inputs: JSON.stringify(c.inputs), outputs: JSON.stringify(c.outputs), skills: JSON.stringify(c.skills), tools: JSON.stringify(c.tools), jev_required: c.jev_required ? 1 : 0, importedAt: now }); })();
  return (s.db.prepare('SELECT COUNT(*) n FROM mb_swarm_agents').get() as { n: number }).n;
}
function ensureImported(s: BusinessStore) { ensure(s); if (!(s.db.prepare('SELECT 1 FROM mb_swarm_agents LIMIT 1').get())) importSwarms(s); }

export type Filters = { tier?: Tier; risk?: Risk; jev?: boolean; swarm?: string; q?: string };
const row = (r: Record<string, unknown>): AgentCard => ({ ...(r as unknown as AgentCard), inputs: JSON.parse(String(r.inputs)), outputs: JSON.parse(String(r.outputs)), skills: JSON.parse(String(r.skills)), tools: JSON.parse(String(r.tools)), jev_required: r.jev_required === 1 });

/** Tree of swarm → sub-cluster → agents, filtered. Leads have no sub-cluster ("Swarm lead"). */
export function swarmTree(s: BusinessStore, f: Filters = {}) {
  ensureImported(s);
  const where: string[] = []; const args: unknown[] = [];
  if (f.tier) { where.push('tier = ?'); args.push(f.tier); }
  if (f.risk) { where.push('risk_class = ?'); args.push(f.risk); }
  if (f.jev !== undefined) { where.push('jev_required = ?'); args.push(f.jev ? 1 : 0); }
  if (f.swarm) { where.push('swarm = ?'); args.push(f.swarm); }
  if (f.q) { where.push('(name LIKE ? OR responsibility LIKE ?)'); args.push(`%${f.q}%`, `%${f.q}%`); }
  const rows = (s.db.prepare(`SELECT * FROM mb_swarm_agents ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY swarm, subcluster, CASE tier WHEN 'lead' THEN 0 WHEN 'pm' THEN 1 ELSE 2 END, id`).all(...args) as Record<string, unknown>[]).map(row);
  const swarms = new Map<string, Map<string, AgentCard[]>>();
  for (const a of rows) { const sc = a.subcluster ?? 'Swarm lead'; if (!swarms.has(a.swarm)) swarms.set(a.swarm, new Map()); const m = swarms.get(a.swarm)!; if (!m.has(sc)) m.set(sc, []); m.get(sc)!.push(a); }
  const totals = s.db.prepare("SELECT COUNT(*) total, SUM(jev_required) jev, SUM(risk_class='high') high FROM mb_swarm_agents").get() as { total: number; jev: number; high: number };
  return { generated: FILE.generated, note: FILE.note, totals, matched: rows.length, swarms: [...swarms].map(([name, subs]) => ({ name, subclusters: [...subs].map(([sub, agents]) => ({ name: sub, agents })) })) };
}
export function swarmNames(s: BusinessStore) { ensureImported(s); return (s.db.prepare('SELECT DISTINCT swarm FROM mb_swarm_agents ORDER BY swarm').all() as { swarm: string }[]).map((r) => r.swarm); }
