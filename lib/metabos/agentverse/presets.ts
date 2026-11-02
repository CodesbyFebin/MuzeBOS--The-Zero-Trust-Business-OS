/** Server preset logic, ported from the owner's AI Studio pureLogic.ts (t88; owner-made). Gradients, invented agents and mock servers removed.
 *  Channels map onto real AgentVerse channel ids; unknown names stay as plain category labels. */
export type NotificationSettings = { notifyOnPendingApproval: boolean; notifyOnHighValueLead: boolean; highValueLeadThresholdInr: number | null; emailDigest: 'off' | 'daily' | 'weekly' };
export type ServerPreset = { id: string; name: string; description: string; channelCategories: { categoryName: string; channelNames: string[] }[]; defaultAgentRoles: ('Admin' | 'Agent' | 'Viewer')[]; notificationSettings: NotificationSettings; isCustom?: boolean };
const N: NotificationSettings = { notifyOnPendingApproval: true, notifyOnHighValueLead: false, highValueLeadThresholdInr: null, emailDigest: 'weekly' };
const P = (id: string, name: string, description: string, cats: [string, string[]][], roles: ServerPreset['defaultAgentRoles']): ServerPreset => ({ id, name, description, channelCategories: cats.map(([categoryName, channelNames]) => ({ categoryName, channelNames })), defaultAgentRoles: roles, notificationSettings: { ...N } });
export const PRESET_LIBRARY: ServerPreset[] = [
  P('meta-growth', 'Full Meta Growth Suite', 'Inbox, ads drafts and approvals together', [['Meta Suite', ['unified-inbox', 'instagram', 'whatsapp', 'facebook']], ['Ads command center', ['campaigns', 'creatives-lab', 'audiences', 'roas-dashboard']], ['Git for agents', ['commit-log', 'pending-approvals', 'activity-feed']]], ['Admin', 'Agent', 'Viewer']),
  P('wa-desk', 'WhatsApp & Customer Desk', 'Customer threads with approval-gated replies', [['Meta Suite', ['unified-inbox', 'whatsapp']], ['Git for agents', ['pending-approvals', 'activity-feed']]], ['Admin', 'Agent']),
  P('git-devops', 'Git Agentic DevOps', 'Commit log, evidence and fleet', [['Git for agents', ['commit-log', 'branches', 'pending-approvals', 'evidence-vault', 'firewall']], ['Agent swarm', ['fleet-console', 'blame', 'meta-status']]], ['Admin', 'Agent']),
  P('creator', 'Solo Creator Studio', 'Drafts for Instagram and Threads', [['Meta Suite', ['instagram', 'threads']], ['Ads command center', ['creatives-lab']], ['Git for agents', ['pending-approvals']]], ['Admin']),
];
export function saveCustomPreset(presets: ServerPreset[], preset: ServerPreset): ServerPreset[] {
  const i = presets.findIndex((p) => p.id === preset.id);
  if (i >= 0) { const u = [...presets]; u[i] = { ...preset, isCustom: true }; return u; }
  return [...presets, { ...preset, isCustom: true }];
}
/** Slug -> real channel id, following the AI Studio keyword rules. Returns null when no real channel matches. */
export function channelFor(name: string, known: readonly string[]): string | null {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (known.includes(slug)) return slug;
  const rules: [RegExp, string][] = [[/inbox|dm|chat/, 'unified-inbox'], [/commit|repo/, 'commit-log'], [/pending|approval/, 'pending-approvals'], [/campaign|roas|^ads?$|-ads?-|^ads?-/, 'campaigns'], [/graph|knowledge/, 'knowledge-graph'], [/activity|feed/, 'activity-feed'], [/terminal|fleet|console/, 'fleet-console'], [/arena|sparring/, 'sparring-pit'], [/status/, 'meta-status']];
  return rules.find(([r]) => r.test(slug))?.[1] ?? null;
}
/** The channel layout a deployed server shows. The server itself is created as a real workspace by the API. */
export function deployLayout(preset: ServerPreset, known: readonly string[]) {
  return preset.channelCategories.map((c) => ({ label: c.categoryName, channels: [...new Set(c.channelNames.map((n) => channelFor(n, known)).filter((x): x is string => !!x))] }));
}
