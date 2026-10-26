import { businessStore } from '@/lib/muzebos/store';
import { BodyTooLarge, isWebhookSource, readBodyCapped, receiveWebhook, verifyChallenge } from '@/lib/muzebos/webhooks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const reply = (r: { status: number; body: string }) => new Response(r.body, { status: r.status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });

/** Meta subscription handshake for /api/webhooks/{whatsapp,instagram,messenger}. */
export function GET(req: Request, { params }: { params: { source: string } }) {
  if (!isWebhookSource(params.source)) return reply({ status: 404, body: 'not_found' });
  return reply(verifyChallenge(new URL(req.url).searchParams, process.env.META_VERIFY_TOKEN));
}

export async function POST(req: Request, { params }: { params: { source: string } }) {
  if (!isWebhookSource(params.source)) return reply({ status: 404, body: 'not_found' });
  const secret = process.env.META_APP_SECRET;
  if (!secret) return reply({ status: 503, body: 'not_configured' });
  let raw: Buffer;
  try { raw = await readBodyCapped(req); } catch (e) {
    if (e instanceof BodyTooLarge) return reply({ status: 413, body: 'too_large' });
    return reply({ status: 400, body: 'unreadable_body' });
  }
  return reply(receiveWebhook(businessStore(), { source: params.source, raw, signature: req.headers.get('x-hub-signature-256'), secret }));
}
