import { NextResponse } from 'next/server';
import { z } from 'zod';
import { memberRead } from '@/lib/metabos/member-read';
import { BusinessError } from '@/lib/metabos/store';
import { requirePermission } from '@/lib/metabos/biz/accounts';
import { addOptOut, listOptOuts, removeOptOut, TALK_CHANNELS } from '@/lib/metabos/talk/core';
import { closeHandoff, draftFollowUp, followUpCandidates, openHandoff, proposeReply, requestWhatsAppApproval, resume, retryTranscription, setApproverPhone, takeHandoff, talkView } from '@/lib/metabos/talk/service';
import { connection } from '@/lib/metabos/dispatch/service';
import { metaKey } from '@/lib/metabos/ai/meta';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const id = z.string().uuid();
const Ch = z.enum(TALK_CHANNELS);
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('reply'), conversationId: id, text: z.string().max(4000).optional(), quickReply: z.string().max(40).optional(), author: z.enum(['human', 'copilot']) }).strict(),
  z.object({ action: z.literal('follow-up'), conversationId: id, text: z.string().max(1000).optional(), silenceHours: z.number().int().min(1).max(23).optional() }).strict(),
  z.object({ action: z.literal('handoff'), conversationId: id, reason: z.string().trim().min(3).max(300) }).strict(),
  z.object({ action: z.literal('take'), handoffId: id }).strict(),
  z.object({ action: z.literal('close'), handoffId: id, resolution: z.string().trim().min(3).max(1000), resumeCopilot: z.boolean() }).strict(),
  z.object({ action: z.literal('resume'), conversationId: id }).strict(),
  z.object({ action: z.literal('opt-out'), channel: Ch, address: z.string().trim().min(3).max(200), reason: z.string().trim().min(3).max(200) }).strict(),
  z.object({ action: z.literal('opt-in'), channel: Ch, address: z.string().trim().min(3).max(200), note: z.string().trim().min(3).max(200) }).strict(),
  z.object({ action: z.literal('transcribe'), messageId: id }).strict(),
  z.object({ action: z.literal('approver-phone'), memberId: z.string().min(1).max(80), phone: z.string().min(8).max(20) }).strict(),
  z.object({ action: z.literal('whatsapp-approval'), dispatchId: id, approverId: z.string().min(1).max(80) }).strict(),
]);
function failure(e: unknown) {
  if (e instanceof BusinessError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof z.ZodError || e instanceof SyntaxError) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  console.error('Talk failed', e instanceof Error ? e.name : 'unknown');
  return NextResponse.json({ error: 'Talk action failed' }, { status: 500 });
}
/** Talk copilot: conversations from signed webhooks, handoffs, opt-outs and follow-ups. Sends go through /api/dispatch. */
export async function GET(req: Request) {
  try {
    const { s } = memberRead(req);
    const u = new URL(req.url); const c = u.searchParams.get('conversation') ?? undefined;
    return NextResponse.json({ ...talkView(s, c ? id.parse(c) : undefined), optOuts: listOptOuts(s), followUps: followUpCandidates(s), connection: { muse_voice: Boolean(metaKey(process.env)), approval_signing: Boolean(process.env.MUZEBOS_APPROVAL_SIGNING_SECRET), instagram: Boolean(process.env.MUZEBOS_INSTAGRAM_ACCESS_TOKEN), channels: connection(process.env) } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return failure(e); }
}
export async function POST(req: Request) {
  try {
    const { s, me } = memberRead(req);
    if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new BusinessError('JSON content type required', 415);
    const text = await req.text(); if (text.length > 16_000) throw new BusinessError('Request too large', 413);
    const b = Body.parse(JSON.parse(text));
    switch (b.action) {
      case 'reply': requirePermission(me, 'deals.write'); return NextResponse.json({ dispatch: proposeReply(s, me, b.conversationId, b) });
      case 'follow-up': requirePermission(me, 'deals.write'); return NextResponse.json({ dispatch: draftFollowUp(s, me, b.conversationId, b.text, b.silenceHours) });
      case 'handoff': requirePermission(me, 'deals.write'); return NextResponse.json({ handoff: openHandoff(s, b.conversationId, `${me.name}: ${b.reason}`) });
      case 'take': requirePermission(me, 'deals.write'); return NextResponse.json({ handoff: takeHandoff(s, me.id, b.handoffId) });
      case 'close': requirePermission(me, 'deals.write'); return NextResponse.json({ handoff: closeHandoff(s, me.id, b.handoffId, b.resolution, b.resumeCopilot) });
      case 'resume': requirePermission(me, 'deals.write'); resume(s, me.id, b.conversationId); return NextResponse.json({ ok: true });
      case 'opt-out': requirePermission(me, 'deals.write'); addOptOut(s, b.channel, b.address, b.reason, `added by ${me.name}`); return NextResponse.json({ ok: true });
      case 'opt-in': requirePermission(me, 'jev.decide'); removeOptOut(s, me.id, b.channel, b.address, b.note); return NextResponse.json({ ok: true });
      case 'transcribe': requirePermission(me, 'deals.write'); return NextResponse.json({ transcriptStatus: await retryTranscription(s, b.messageId) });
      case 'approver-phone': requirePermission(me, 'members.manage'); setApproverPhone(s, me.id, b.memberId, b.phone); return NextResponse.json({ ok: true });
      case 'whatsapp-approval': {
        requirePermission(me, 'jev.decide');
        const key = req.headers.get('idempotency-key') ?? '';
        const r = await requestWhatsAppApproval(s, me, b.dispatchId, b.approverId, key, { env: process.env, fetch: (u, i) => fetch(u, i) });
        return NextResponse.json({ prompt: r.prompt, expiresAt: r.expiresAt });
      }
    }
  } catch (e) { return failure(e); }
}
