/** Meta product status monitor and dispatch circuit breaker.
 *  No live health is fetched: metastatus.com has no documented public feed, so every product reads "Unknown" with a link out.
 *  An operator can mark a product degraded or outage by hand (labelled manual); approved dispatches for that product are held until cleared. */
import { z } from 'zod';
import { BusinessError, type BusinessStore } from '@/lib/metabos/store';
export const STATUS_SOURCE = 'https://metastatus.com/';
export const META_PRODUCTS = [
  ['ads', 'Ads Manager'], ['ads', 'Marketing API'], ['ads', 'Messaging Ads'], ['ads', 'Catalog'], ['ads', 'Audience Network'], ['ads', 'Instagram Boost'], ['ads', 'Facebook & Instagram Shops'],
  ['business', 'Horizon Device Manager'], ['business', 'Business Suite'], ['business', 'Admin Center'],
  ['developer', 'Facebook Login'], ['developer', 'Graph API'], ['developer', 'Messenger API for Instagram'], ['developer', 'Messenger Platform'], ['developer', 'WhatsApp Business Platform'],
  ['transparency', 'Ads Transparency'], ['transparency', 'Data Transparency'],
] as const;
export type ProductName = (typeof META_PRODUCTS)[number][1];
/** Which products a dispatch channel depends on. Channels not listed are not Meta products. */
export const CHANNEL_PRODUCTS: Record<string, ProductName[]> = { whatsapp: ['WhatsApp Business Platform', 'Graph API'], instagram: ['Messenger API for Instagram', 'Graph API'], messenger: ['Messenger Platform', 'Graph API'], 'page-post': ['Graph API'], 'ig-publish': ['Graph API'] };
const ensure = (s: BusinessStore) => s.db.exec('CREATE TABLE IF NOT EXISTS mb_meta_status_marks(product TEXT PRIMARY KEY, state TEXT NOT NULL, note TEXT, markedBy TEXT NOT NULL, markedAt TEXT NOT NULL)');
type Mark = { product: string; state: 'degraded' | 'outage'; note: string | null; markedBy: string; markedAt: string };
export function metaStatus(s: BusinessStore) {
  ensure(s); const marks = new Map((s.db.prepare('SELECT * FROM mb_meta_status_marks').all() as Mark[]).map((m) => [m.product, m]));
  return { source: STATUS_SOURCE, note: 'Live status is not fetched (no documented public feed). Check metastatus.com. Manual marks are set by an operator, not by Meta.',
    products: META_PRODUCTS.map(([group, name]) => { const m = marks.get(name); return { group, name, status: m ? m.state : 'unknown', manual: !!m, markedBy: m?.markedBy ?? null, markedAt: m?.markedAt ?? null, note: m?.note ?? null }; }) };
}
export const MarkInput = z.object({ product: z.enum(META_PRODUCTS.map(([, n]) => n) as [ProductName, ...ProductName[]]), state: z.enum(['degraded', 'outage', 'clear']), note: z.string().max(200).nullable().default(null) }).strict();
export function markProduct(s: BusinessStore, actor: string, raw: unknown) {
  const m = MarkInput.parse(raw); ensure(s);
  s.transact(() => {
    if (m.state === 'clear') s.db.prepare('DELETE FROM mb_meta_status_marks WHERE product=?').run(m.product);
    else s.db.prepare('INSERT OR REPLACE INTO mb_meta_status_marks VALUES(?,?,?,?,?)').run(m.product, m.state, m.note, actor, new Date().toISOString());
    s.appendEvidence('meta.status.manual_mark', m.product, `${m.state} (manual, by ${actor})${m.note ? `: ${m.note}` : ''}`);
  });
  return metaStatus(s);
}
/** Circuit breaker: throws 503 and records a hold when a product the channel needs is marked degraded or outage. */
export function assertChannelOpen(s: BusinessStore, channel: string, dispatchId: string) {
  const need = CHANNEL_PRODUCTS[channel]; if (!need) return; ensure(s);
  const hit = need.map((p) => s.db.prepare('SELECT * FROM mb_meta_status_marks WHERE product=?').get(p) as Mark | undefined).find(Boolean);
  if (!hit) return;
  s.transact(() => s.appendEvidence('dispatch.held.circuit_breaker', dispatchId, `${hit.product} marked ${hit.state} (manual); dispatch held, still approved`));
  throw new BusinessError(`Held: ${hit.product} is marked ${hit.state} by an operator. Clear it in #meta-status, then send again.`, 503);
}
