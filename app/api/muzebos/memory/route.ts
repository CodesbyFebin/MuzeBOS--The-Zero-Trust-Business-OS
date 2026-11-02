import { NextResponse } from 'next/server';
import { z } from 'zod';
import { businessStore, BusinessError } from '@/lib/muzebos/store';
import { businessAccess } from '@/lib/muzebos/http';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
function fail(e: unknown) {
  if (e instanceof BusinessError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof z.ZodError || e instanceof SyntaxError) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  return NextResponse.json({ error: 'Request failed' }, { status: 500 });
}
const lane = { lane: z.enum(['meta', 'baseten']).default('meta'), paidConsent: z.boolean().default(false) };
import { listMemory, remember, agentDraft, promote, forget, contextFor, requestCompaction, readCompaction, LAYER_NAMES } from '@/lib/muzebos/biz/memory';
import { listMembers, DEPARTMENTS } from '@/lib/muzebos/biz/members';
const cmd = z.discriminatedUnion('action', [
  z.object({ action: z.literal('remember'), actorId: z.string().max(64), memory: z.unknown() }),
  z.object({ action: z.literal('agentDraft'), role: z.string().max(32), memory: z.unknown() }),
  z.object({ action: z.literal('promote'), actorId: z.string().max(64), id: z.string().max(64) }),
  z.object({ action: z.literal('forget'), actorId: z.string().max(64), id: z.string().max(64) }),
  z.object({ action: z.literal('context'), role: z.enum(DEPARTMENTS), sessionId: z.string().max(64), query: z.string().max(400), budget: z.number().int().min(100).max(8000).optional() }),
  z.object({ action: z.literal('requestCompaction'), ...lane }),
  z.object({ action: z.literal('readCompaction'), taskId: z.string().max(64) }),
]);
export async function GET(req: Request) {
  try { businessAccess(req); const s = businessStore(); return NextResponse.json({ memory: listMemory(s), members: listMembers(s), layers: LAYER_NAMES, departments: DEPARTMENTS }); } catch (e) { return fail(e); }
}
export async function POST(req: Request) {
  try {
    businessAccess(req); const c = cmd.parse(await req.json()); const s = businessStore();
    if (c.action === 'remember') return NextResponse.json({ memory: remember(s, c.actorId, c.memory) });
    if (c.action === 'agentDraft') return NextResponse.json({ memory: agentDraft(s, c.role, c.memory) });
    if (c.action === 'promote') return NextResponse.json({ memory: promote(s, c.actorId, c.id) });
    if (c.action === 'forget') { forget(s, c.actorId, c.id); return NextResponse.json({ ok: true }); }
    if (c.action === 'context') return NextResponse.json(contextFor(s, c.role, c.sessionId, c.query, c.budget));
    if (c.action === 'requestCompaction') return NextResponse.json({ task: requestCompaction(s, { lane: c.lane, paidConsent: c.paidConsent }) });
    return NextResponse.json({ memory: readCompaction(s, c.taskId) });
  } catch (e) { return fail(e); }
}
