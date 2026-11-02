/** MeTa Server map: groups the registry's menus into business "servers". Clusters become categories,
 *  pages become channels that link to the real route. Pure data, safe for client and server. */
import { MENUS, type FeatureStatus } from '../registry';

export type ServerChannel = { id: string; label: string; route: string; status: FeatureStatus; summary: string };
export type ServerCategory = { id: string; label: string; channels: ServerChannel[] };
export type BusinessServer = { id: string; name: string; short: string; topic: string; menus: string[]; categories: ServerCategory[] };

const GROUPS: { id: string; name: string; short: string; topic: string; menus: string[] }[] = [
  { id: 'hq', name: 'HQ', short: 'HQ', topic: 'Mission Control, workflows, evidence, settings and account', menus: ['mission', 'workflows', 'evidence', 'settings', 'upgrade', 'support', 'account'] },
  { id: 'sales', name: 'Sales & CRM', short: 'SC', topic: 'Orders, bookings, quotes, leads and customers', menus: ['orders'] },
  { id: 'finance', name: 'Ops & Finance', short: 'OF', topic: 'Invoices, GST, payments, stock and operations', menus: ['money', 'stock', 'operations'] },
  { id: 'marketing', name: 'Marketing & Ads', short: 'MA', topic: 'Social, campaigns, audiences and ad drafts', menus: ['growth'] },
  { id: 'support', name: 'Support & WhatsApp', short: 'SW', topic: 'Meta inbox, WhatsApp, broadcasts, calls and feedback', menus: ['talk'] },
  { id: 'privacy', name: 'Data & Privacy', short: 'DP', topic: 'Identity, licences, regulatory and DPDP data protection', menus: ['foundation'] },
  { id: 'knowledge', name: 'Knowledge & Builder', short: 'KB', topic: 'Writing library, themes, content, Agent Hub', menus: ['builder'] },
  { id: 'brain', name: 'Brain', short: 'BR', topic: 'Agents, runtime, MUSE voice and models', menus: ['brain'] },
  { id: 'dev', name: 'Dev & Systems', short: 'DV', topic: 'System health, webhooks and the API reference', menus: ['system', 'developer'] },
];

export function businessServers(): BusinessServer[] {
  return GROUPS.map((g) => ({ ...g, categories: g.menus.flatMap((mid) => {
    const m = MENUS.find((x) => x.id === mid); if (!m) return [];
    return m.clusters.map((c) => ({ id: `${mid}.${c.id}`, label: g.menus.length > 1 ? `${m.label} · ${c.label}` : c.label, channels: c.pages.map((p) => ({ id: p.id, label: p.label, route: p.route, status: p.status, summary: p.summary })) }));
  }) }));
}
/** Every registry route appears exactly once across the business servers. */
export function allServerRoutes(): string[] { return businessServers().flatMap((s) => s.categories.flatMap((c) => c.channels.map((ch) => ch.route))); }
/** Which server a commit belongs to, by kind. */
export const KIND_SERVER: Record<string, string> = { ad: 'marketing', social: 'marketing', 'dispatch.whatsapp': 'support', 'dispatch.instagram': 'support', 'dispatch.email': 'support', 'dispatch.payment-link': 'finance', 'dispatch.completion': 'brain', jev: 'brain' };
