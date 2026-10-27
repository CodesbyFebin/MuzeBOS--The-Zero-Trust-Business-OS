import { NextResponse } from 'next/server';
import { z } from 'zod';
import { businessStore, BusinessError } from '@/lib/muzebos/store';
import { businessAccess } from '@/lib/muzebos/http';
import { createMission, listMissions, runMission } from '@/lib/muzebos/ai/lead';
import { queue } from '@/lib/muzebos/ai/jev';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const cmd = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), request: z.string().trim().min(3).max(4000) }),
  z.object({ action: z.literal('run'), missionId: z.string().max(64) }),
]);
function fail(e: unknown) {
  if (e instanceof BusinessError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof z.ZodError || e instanceof SyntaxError) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  return NextResponse.json({ error: 'Mission failed' }, { status: 500 });
}
export async function GET(req: Request) {
  try { businessAccess(req); const s = businessStore(); return NextResponse.json({ missions: listMissions(s), pendingJev: queue(s).filter((r) => r.status === 'awaiting_approval').length }); } catch (e) { return fail(e); }
}
export async function POST(req: Request) {
  try {
    businessAccess(req); const c = cmd.parse(await req.json()); const s = businessStore();
    if (c.action === 'create') { const m = await createMission(s, c.request); return NextResponse.json({ mission: await runMission(s, m.id), note: m.note ?? null }); }
    return NextResponse.json({ mission: await runMission(s, c.missionId) });
  } catch (e) { return fail(e); }
}
