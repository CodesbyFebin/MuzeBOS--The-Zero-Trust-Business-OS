import type { GladosDb } from '@/lib/db';
import { realAgents } from '@/lib/agents/real';
import type { Agent, Department } from '@/lib/schemas';

/**
 * Structural seed. A fresh install is a blank OS: the six operating pillars
 * and the agent roster exist (they are the system's own crew, mirrored from
 * lib/agents/real.ts so /agents can never list an agent that has no runtime),
 * and nothing else. People, tasks, tools, metrics, funnel and
 * social rows all start empty and are filled by the operator or by live
 * connectors.
 */
const GRAY = { white: '#fafafa', light: '#d4d4d4', mid: '#a3a3a3', dim: '#737373' };

// Pillar ids and order are load-bearing: lenses, setup and the graph use them.
const departments: Department[] = [
  { id: 'dept-sales', name: 'Sales', slug: 'sales', tagline: 'Pipeline and deals.', color: GRAY.white, order: 1 },
  { id: 'dept-marketing-growth', name: 'Marketing/Growth', slug: 'marketing-growth', tagline: 'Audience and content.', color: GRAY.light, order: 2 },
  { id: 'dept-tech', name: 'TECH', slug: 'tech', tagline: 'Infrastructure, the brain and the agents.', color: GRAY.dim, order: 3 },
  { id: 'dept-finance', name: 'Finances', slug: 'finances', tagline: 'Processors and books.', color: GRAY.mid, order: 4 },
  { id: 'dept-comms', name: 'Communications', slug: 'comms', tagline: 'Every inbox in one feed.', color: GRAY.mid, order: 5 },
  { id: 'dept-clients', name: 'Clients', slug: 'clients', tagline: 'Delivery and service.', color: GRAY.light, order: 6 },
];

/** Org structure over the runtime roster: who delegates to whom. */
const PARENT: Record<string, string> = {
  'crm-pulse': 'sales-agent',
  'deal-scanner': 'sales-agent',
  'deal-alerts': 'sales-agent',
  'inbound-watcher': 'draft-approval-bot',
  'brand-deal-drafter': 'draft-approval-bot',
  'markdown-auditor': 'data-agent',
  'gmail-worker': 'comms-agent',
  'whatsapp-worker': 'comms-agent',
  'slack-worker': 'comms-agent',
  'vector-auditor': 'data-agent',
};

const agents: Agent[] = realAgents.map((a) => ({
  id: a.id,
  departmentId: a.departmentId,
  name: a.name,
  role: a.description,
  status: 'active',
  tier: PARENT[a.id] ? 'worker' : 'lead',
  description: a.description,
  model: 'builtin',
  tools: [],
  parentId: PARENT[a.id] ?? null,
  instance: 'builtin',
}));

export function seedDatabase(db: GladosDb): void {
  // INSERT OR REPLACE makes re-seeding idempotent by id; deleteWhereIdNotIn
  // retires rows that left the model.
  for (const d of departments) db.departments.insert(d);
  db.departments.deleteWhereIdNotIn(departments.map((d) => d.id));
  for (const a of agents) db.agents.insert(a);
  db.agents.deleteWhereIdNotIn(agents.map((a) => a.id));
}
