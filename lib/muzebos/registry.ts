/**
 * MuzeBOS feature registry (slice 1). The single source for the 18 main
 * destinations, their page clusters, canonical routes, legacy aliases and the
 * honest status of every page. Navigation, breadcrumbs, the command palette,
 * status badges and the directory pages are all generated from this file.
 *
 * Status rules ("honest or absent"):
 *  - available: a MuzeBOS-built operation works and is covered by tests.
 *  - existing:  an inherited FounderOS/GladOS screen that renders today; its
 *               connected data depends on configuration.
 *  - planned:   no executable implementation yet; dependencies are listed.
 *  - blocked:   cannot be built until an external provider, credential or
 *               platform capability exists; dependencies are listed.
 */
import type { LucideIcon } from 'lucide-react';
import { Home, Workflow, ShieldCheck } from 'lucide-react';
import { WORKSPACE_CATEGORIES, WORKSPACE_TOOLS, PINNED_UTILITIES, type WorkspaceTool } from '@/lib/muzebos/navigation';

export type FeatureStatus = 'available' | 'existing' | 'planned' | 'blocked';
export const FEATURE_STATUSES: FeatureStatus[] = ['available', 'existing', 'planned', 'blocked'];
export const STATUS_LABEL: Record<FeatureStatus, string> = { available: 'Available', existing: 'Existing screen', planned: 'Planned', blocked: 'Blocked' };

export type FeatureDefinition = {
  id: string;            // stable key, e.g. "orders.orders-pipeline"
  pillar?: number;       // original 1–205 pillar number, where one exists
  menuId: string;
  clusterId: string;
  label: string;
  route: string;         // canonical route, unique across the registry
  target?: string;       // where the working screen lives today (existing/available only)
  status: FeatureStatus;
  summary: string;
  dependencies: string[]; // required before status can move to available
  keywords?: string;
};
export type FeatureCluster = { id: string; label: string; pages: FeatureDefinition[] };
export type MenuSection = 'business' | 'core' | 'pinned';
export type MenuDefinition = {
  id: string; number: number; label: string; route: string; icon: LucideIcon;
  section: MenuSection; summary: string; aliases: string[]; clusters: FeatureCluster[];
  /** where the menu's own landing page renders, when it is not its directory */
  landing?: string;
};

const slug = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Cluster titles for each category's 20 pillars, five consecutive pillars per cluster. */
const CLUSTER_NAMES: Record<string, [string, string, string, string]> = {
  orders: ['Sell & book', 'Customers after sale', 'Quotes & leads', 'Wholesale & risk'],
  money: ['Invoicing & payments', 'Payment controls', 'Payment rails', 'Settlement & tax'],
  talk: ['Meta channels & inbox', 'Automation & broadcast', 'Calls & email', 'Feedback & quality'],
  stock: ['Catalog & movements', 'Purchasing & variants', 'Tracking & planning', 'Fulfilment & returns'],
  growth: ['Social & store', 'Marketing channels', 'Tracking & audiences', 'Experiments & trends'],
  operations: ['People & projects', 'Meetings & suppliers', 'Incidents & assets', 'Reviews & compliance'],
  builder: ['Content & themes', 'Delivery & localisation', 'Quality & rendering', 'Apps & domains'],
  brain: ['Assistants & employees', 'Knowledge & tools', 'Approval boundary', 'Intelligence'],
  foundation: ['Identity & records', 'Licences & compliance', 'Regulatory reporting', 'Data protection'],
  system: ['Connections & data', 'Queues & telemetry', 'Infrastructure', 'Resilience & delivery'],
};

/** Pages that already have a dedicated MuzeBOS route keep it as their canonical route. */
const DEDICATED_ROUTES: Record<number, string> = {
  3: '/workspace/orders/bookings',
  85: '/workspace/growth/analytics',
  144: '/workspace/brain/employees',
  181: '/workspace/system/sources',
  186: '/workspace/system/webhooks',
};

/** Pillars verified since the navigation catalogue was written: the status and scope the tests back. */
const VERIFIED: Record<number, { status: FeatureStatus; summary: string }> = {
  85: { status: 'available', summary: 'KPIs, monthly trend, channels, order counts, AOV, date ranges and CSV from local invoices and drafts. Profit, ROAS and cash flow are shown as unavailable with the missing inputs.' },
  186: { status: 'available', summary: 'Signature-verified Meta webhook receiver (WhatsApp, Instagram, Messenger) and its delivery log. Stores events; does not process or reply.' },
};

const PROVIDER = /whatsapp|instagram|messenger|facebook|upi gateway|upi autopay|ach|wire|pos hardware|sms|push notif|pixel|voice|kyc|aml|hardware key|passkey|cdn|container|failover|service mesh|edge cache|object storage|shelf scanner|call log/i;

const CATEGORY_DEPENDENCY: Record<string, string> = {
  orders: 'Slice 3: orders, inventory and invoice integrity',
  money: 'Slice 3: invoice integrity; provider-verified settlement evidence',
  talk: 'Slice 6: one verified channel adapter at a time',
  stock: 'Slice 3: inventory movement ledger extensions',
  growth: 'Slice 5: analytics from real records',
  operations: 'Slice 8: operations data model',
  builder: 'Slice 8: builder/publishing data model',
  brain: 'Slice 4: Brain templates, favorites and role preferences',
  foundation: 'Slice 8: business identity and records model',
  system: 'Slice 7: workflow execution and evidence',
};

function toFeature(t: WorkspaceTool, clusterId: string): FeatureDefinition {
  const verified = VERIFIED[t.id];
  const blocked = !verified && t.status === 'planned' && PROVIDER.test(t.name);
  const status: FeatureStatus = verified?.status ?? (blocked ? 'blocked' : t.status);
  const dependencies = status === 'available' || status === 'existing' ? [] : blocked
    ? ['External provider account and credentials', 'Verified adapter with failure/unavailable states', CATEGORY_DEPENDENCY[t.category]]
    : [CATEGORY_DEPENDENCY[t.category], 'Schema migration, validation and tests'];
  return {
    id: `${t.category}.${slug(t.name)}`,
    pillar: t.id,
    menuId: t.category,
    clusterId,
    label: t.name,
    route: DEDICATED_ROUTES[t.id] ?? `/workspace/${t.category}/${slug(t.name)}`,
    target: verified ? undefined : t.href,
    status,
    summary: verified ? verified.summary : status === 'blocked' ? 'Requires an external provider integration that is not built or verified. No executable implementation is claimed.' : t.scope,
    dependencies,
  };
}

function categoryClusters(id: string): FeatureCluster[] {
  const tools = WORKSPACE_TOOLS.filter((t) => t.category === id);
  return CLUSTER_NAMES[id].map((label, i) => {
    const cid = `${id}.${slug(label)}`;
    return { id: cid, label, pages: tools.slice(i * 5, i * 5 + 5).map((t) => toFeature(t, cid)) };
  });
}

/** Extra Brain workspace pages that exist as dedicated routes but are not one of the 200 pillars. */
const BRAIN_EXTRA: FeatureDefinition = {
  id: 'brain.agent-permission-review', menuId: 'brain', clusterId: 'brain.approval-boundary', label: 'Agent Permission Review',
  route: '/workspace/brain/security', status: 'available', dependencies: [],
  summary: 'Review attributed agent sources and their requested permissions. Nothing executes from this screen.',
};

const BRAIN_TEMPLATES: FeatureDefinition = {
  id: 'brain.founder-templates', menuId: 'brain', clusterId: 'brain.assistants-and-employees', label: 'Founder Templates',
  route: '/workspace/brain/templates', status: 'available', dependencies: [],
  summary: '12 founder templates with persisted favorites and role preference. Use template creates a local draft only; nothing runs or is sent.',
};

const LEGACY_ALIASES: Record<string, string[]> = {
  orders: ['/business', '/funnel', '/clients', '/brand-deals'],
  money: ['/finances', '/trading'],
  talk: ['/inbox'],
  growth: ['/social', '/adpilot', '/creative-engine', '/analytics', '/lab', '/lead-magnets'],
  operations: ['/tasks', '/org'],
  brain: ['/wizard', '/agents', '/chats', '/skills', '/brain', '/database', '/knowledge', '/drift'],
  system: ['/integrations', '/usage', '/compute', '/blueprint', '/roadmap'],
  settings: ['/setup'],
};

function utilityMenu(key: string): Omit<MenuDefinition, 'number'> {
  const u = PINNED_UTILITIES.find((p) => p.key === key)!;
  const cid = `${key}.overview`;
  const pages: FeatureDefinition[] = u.links.map((l) => ({
    id: `${key}.${slug(l.label)}`, menuId: key, clusterId: cid, label: l.label,
    route: `/workspace/${key}/${slug(l.label)}`, target: l.href, status: 'existing', dependencies: [],
    summary: `Opens the existing screen at ${l.href}.`,
  }));
  if (key === 'developer') pages.push(META_WEBHOOK_STATUS);
  return { id: key, label: key === 'upgrade' ? 'Upgrade' : u.label, route: `/workspace/${key}`, icon: u.icon, section: 'pinned', summary: u.summary, aliases: LEGACY_ALIASES[key] ?? [], clusters: [{ id: cid, label: 'Current destinations', pages }] };
}

const META_WEBHOOK_STATUS: FeatureDefinition = {
  id: 'developer.meta-webhooks', menuId: 'developer', clusterId: 'developer.overview', label: 'Meta webhook status',
  route: '/workspace/developer/meta-webhooks', status: 'available', dependencies: [],
  summary: 'Whether META_APP_SECRET and META_VERIFY_TOKEN are set (never their values), the endpoint paths, and recent deliveries.',
};

const missionPage: FeatureDefinition = { id: 'mission.overview', menuId: 'mission', clusterId: 'mission.today', label: 'Mission Control', route: '/', status: 'available', dependencies: [], summary: 'Derived pending approvals, unpaid requests, out-of-stock alerts and persisted reminders.' };
const workflowsPage: FeatureDefinition = { id: 'workflows.canvas', menuId: 'workflows', clusterId: 'workflows.build', label: 'Workflow Canvas', route: '/workflows', status: 'existing', dependencies: [], summary: 'Inherited workflow editor. Execution evidence for MuzeBOS commands is planned (slice 7).' };
const evidencePages: FeatureDefinition[] = [
  { id: 'evidence.commerce-ledger', menuId: 'evidence', clusterId: 'evidence.ledger', label: 'Commerce Evidence Ledger', route: '/workspace/evidence/commerce-ledger', target: '/business?view=evidence', status: 'available', dependencies: [], summary: 'Local commerce audit events, payload hashes and hash-chain verification.' },
  { id: 'evidence.workflow-runs', menuId: 'evidence', clusterId: 'evidence.ledger', label: 'Workflow Run Evidence', route: '/workspace/evidence/workflow-runs', status: 'planned', dependencies: ['Slice 7: workflow execution and evidence'], summary: 'Per-run evidence for workflow executions. Not implemented.' },
];

const cat = (id: string) => WORKSPACE_CATEGORIES.find((c) => c.id === id)!;
const MENU_LABELS: Record<string, string> = { orders: 'Orders', money: 'Money', talk: 'Talk', stock: 'Stock', growth: 'Growth', operations: 'Operations', builder: 'Builder', brain: 'Brain', foundation: 'Foundation', system: 'System' };
const categoryMenu = (id: string, section: MenuSection): Omit<MenuDefinition, 'number'> => {
  const clusters = categoryClusters(id);
  if (id === 'brain') { clusters[0].pages.push(BRAIN_TEMPLATES); clusters[2].pages.push(BRAIN_EXTRA); }
  return { id, label: MENU_LABELS[id], route: `/workspace/${id}`, icon: cat(id).icon, section, summary: cat(id).summary, aliases: LEGACY_ALIASES[id] ?? [], clusters };
};

const MENU_LIST: Omit<MenuDefinition, 'number'>[] = [
  { id: 'mission', label: 'Mission Control', route: '/', icon: Home, section: 'business', summary: 'Today: approvals, unpaid requests, stock alerts and reminders.', aliases: [], clusters: [{ id: 'mission.today', label: 'Today', pages: [missionPage] }] },
  ...['orders', 'money', 'talk', 'stock', 'growth', 'operations', 'builder', 'brain'].map((id) => categoryMenu(id, 'business')),
  ...['foundation', 'system'].map((id) => categoryMenu(id, 'core')),
  { id: 'workflows', label: 'Workflows', route: '/workflows', icon: Workflow, section: 'core', summary: 'Build and review automations.', aliases: [], clusters: [{ id: 'workflows.build', label: 'Build', pages: [workflowsPage] }] },
  { id: 'evidence', label: 'Evidence', route: '/workspace/evidence', icon: ShieldCheck, section: 'core', summary: 'Inspect commerce actions, payload hashes and audit verification.', aliases: [], clusters: [{ id: 'evidence.ledger', label: 'Ledgers', pages: evidencePages }] },
  ...['settings', 'upgrade', 'support', 'developer', 'account'].map(utilityMenu),
];
export const MENUS: MenuDefinition[] = MENU_LIST.map((m, i) => ({ ...m, number: i + 1 }));

export const PINNED_MENUS = MENUS.filter((m) => m.section === 'pinned');
export const SCROLL_MENUS = MENUS.filter((m) => m.section !== 'pinned');
export const ALL_FEATURES: FeatureDefinition[] = MENUS.flatMap((m) => m.clusters.flatMap((c) => c.pages));

export function menuById(id: string) { return MENUS.find((m) => m.id === id); }
export function featureByRoute(route: string) { return ALL_FEATURES.find((f) => f.route === route); }

const clean = (p: string) => (p.split(/[?#]/)[0].replace(/\/$/, '') || '/');

/** The menu a pathname belongs to: exact menu route, page route, nested route, then legacy alias. */
export function resolveMenu(pathname: string): MenuDefinition | undefined {
  const path = clean(pathname);
  const exact = MENUS.find((m) => m.route === path) ?? MENUS.find((m) => m.clusters.some((c) => c.pages.some((p) => p.route === path)));
  if (exact) return exact;
  const nested = MENUS.find((m) => m.route !== '/' && path.startsWith(m.route + '/'));
  if (nested) return nested;
  const aliases = MENUS.flatMap((m) => m.aliases.map((a) => ({ m, a }))).sort((x, y) => y.a.length - x.a.length);
  return aliases.find(({ a }) => path === a || path.startsWith(a + '/'))?.m;
}

export type Crumb = { label: string; href?: string };
/** Breadcrumb trail from the registry: Mission Control › Menu › Cluster › Page. */
export function breadcrumbs(pathname: string): Crumb[] {
  const path = clean(pathname);
  if (path === '/') return [{ label: 'Mission Control' }];
  const menu = resolveMenu(path);
  if (!menu) return [{ label: 'Mission Control', href: '/' }, { label: path.split('/').filter(Boolean).pop() ?? path }];
  const trail: Crumb[] = [{ label: 'Mission Control', href: '/' }, { label: menu.label, href: menu.route === path ? undefined : menu.route }];
  for (const c of menu.clusters) {
    const page = c.pages.find((p) => p.route === path);
    if (page && page.route !== menu.route) { trail.push({ label: c.label, href: `${menu.route}#${c.id}` }, { label: page.label }); break; }
  }
  return trail;
}

/** Look up a category page by its /workspace/<menu>/<slug> route segments. */
export function pageForSegments(menu: string, page: string) { return featureByRoute(`/workspace/${menu}/${page}`); }

export function statusCounts(features: FeatureDefinition[] = ALL_FEATURES): Record<FeatureStatus, number> {
  const out = { available: 0, existing: 0, planned: 0, blocked: 0 };
  for (const f of features) out[f.status]++;
  return out;
}

/** Digit shortcuts 1–9 open the first nine main destinations. */
export function workspaceDigitViews(): string[] { return MENUS.slice(0, 9).map((m) => m.route); }
