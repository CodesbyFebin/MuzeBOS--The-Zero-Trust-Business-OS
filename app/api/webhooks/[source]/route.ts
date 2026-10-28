import { businessStore } from '@/lib/metabos/store';
import { ingest, parseMetaWebhook } from '@/lib/metabos/talk/service';
import { BodyTooLarge, isWebhookSource, readBodyCapped, receiveWebhook, verifyChallenge } from '@/lib/metabos/webhooks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const reply = (r: { status: number; body: string }) => new Response(r.body, { status: r.status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });

/** Meta subscription handshake for /api/webhooks/{whatsapp,instagram,messenger}. */
export async function GET(req: Request, props: { params: Promise<{ source: string }> }) {
  const params = await props.params;
  if (!isWebhookSource(params.source)) return reply({ status: 404, body: 'not_found' });
  return reply(verifyChallenge(new URL(req.url).searchParams, process.env.META_VERIFY_TOKEN));
}

export async function POST(req: Request, props: { params: Promise<{ source: string }> }) {
  const params = await props.params;
  if (!isWebhookSource(params.source)) return reply({ status: 404, body: 'not_found' });
  const secret = process.env.META_APP_SECRET;
  if (!secret) return reply({ status: 503, body: 'not_configured' });
  let raw: Buffer;
  try { raw = await readBodyCapped(req); } catch (e) {
    if (e instanceof BodyTooLarge) return reply({ status: 413, body: 'too_large' });
    return reply({ status: 400, body: 'unreadable_body' });
  }
  const store = businessStore();
  const r = receiveWebhook(store, { source: params.source, raw, signature: req.headers.get('x-hub-signature-256'), secret });
  // Only a verified, parsed body reaches the Talk ingest. Messages are deduped by provider message id.
  if (r.status === 200) {
    try { await ingest(store, parseMetaWebhook(params.source, JSON.parse(raw.toString('utf8')))); }
    catch (e) { store.appendEvidence('talk.ingest-failed', params.source, e instanceof Error ? e.message.slice(0, 200) : 'ingest error'); }
  }
  return reply(r);
}
