import { readJsonBounded } from '@/lib/bounded-body';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { businessStore, BusinessError } from '@/lib/muzebos/store';
import { businessAccess } from '@/lib/muzebos/http';
import { createMission, listMissions, advanceMission, adoptLeadPlan } from '@/lib/muzebos/ai/lead';
import { queue } from '@/lib/muzebos/ai/jev';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const cmd = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), request: z.string().trim().min(3).max(4000), lane: z.enum(['meta', 'baseten']).default('meta'), paidConsent: z.boolean().default(false) }),
  z.object({ action: z.literal('advance'), missionId: z.string().max(64) }),
  z.object({ action: z.literal('adoptLeadPlan'), missionId: z.string().max(64) }),
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
    businessAccess(req); const c = cmd.parse(await readJsonBounded(req)); const s = businessStore();
    if (c.action === 'create') return NextResponse.json({ mission: createMission(s, c.request, { lane: c.lane, paidConsent: c.paidConsent }) });
    if (c.action === 'adoptLeadPlan') return NextResponse.json({ mission: adoptLeadPlan(s, c.missionId) });
    return NextResponse.json({ mission: advanceMission(s, c.missionId) });
  } catch (e) { return fail(e); }
}
