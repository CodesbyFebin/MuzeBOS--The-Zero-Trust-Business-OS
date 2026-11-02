/** Pure Meta status helpers, ported from the owner's AI Studio pureLogic.ts (t88; owner-made) with invented latency/uptime removed.
 *  "unknown" is the default: we do not fetch live health. "degraded"/"outage" here only ever come from a manual operator mark. */
export type MetaHealth = 'unknown' | 'degraded' | 'outage';
export type MetaGroup = 'ads' | 'business' | 'developer' | 'transparency';
export type MetaProductRow = { group: MetaGroup | string; name: string; status: MetaHealth | string; manual: boolean; markedBy: string | null; markedAt: string | null; note: string | null };
export const GROUP_LABEL: Record<string, string> = { ads: 'Ads', business: 'Business Tools', developer: 'Developer Platform', transparency: 'Transparency Tools' };
export function calculateMetaHealth(products: Pick<MetaProductRow, 'status'>[]) {
  let outage = 0, degraded = 0;
  for (const p of products) { if (p.status === 'outage') outage++; else if (p.status === 'degraded') degraded++; }
  return { overall: (outage ? 'outage' : degraded ? 'degraded' : 'unknown') as MetaHealth, total: products.length, manualIncidents: outage + degraded, unknown: products.length - outage - degraded };
}
export function filterMetaProducts<T extends MetaProductRow>(products: T[], group: string, query: string): T[] {
  const q = query.toLowerCase().trim();
  return products.filter((p) => (group === 'All' || p.group === group) && (!q || p.name.toLowerCase().includes(q) || (GROUP_LABEL[p.group] ?? p.group).toLowerCase().includes(q) || (p.note ?? '').toLowerCase().includes(q)));
}
