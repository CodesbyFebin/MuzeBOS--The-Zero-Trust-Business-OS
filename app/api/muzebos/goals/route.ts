import { readJsonBounded } from '@/lib/bounded-body';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { businessStore, BusinessError } from '@/lib/muzebos/store';
import { businessAccess } from '@/lib/muzebos/http';
import { addCheckin, addProject, createGoal, ruleDraft, getGoal, requestModelDraft, readModelDraft, listGoals, toggleProject } from '@/lib/muzebos/goals';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const cmd = z.object({ action: z.enum(['createGoal', 'addProject', 'toggleProject', 'checkin', 'draft', 'requestModelDraft', 'readModelDraft']) }).passthrough();
function fail(e: unknown) {
  if (e instanceof BusinessError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof z.ZodError || e instanceof SyntaxError) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  return NextResponse.json({ error: 'Goals request failed' }, { status: 500 });
}
export async function GET(req: Request) { try { businessAccess(req); return NextResponse.json({ goals: listGoals(businessStore()) }); } catch (e) { return fail(e); } }
export async function POST(req: Request) {
  try {
    businessAccess(req); const body = cmd.parse(await readJsonBounded(req)); const s = businessStore();
    switch (body.action) {
      case 'createGoal': return NextResponse.json({ goal: createGoal(s, body) });
      case 'addProject': return NextResponse.json({ goal: addProject(s, body) });
      case 'toggleProject': return NextResponse.json({ goal: toggleProject(s, z.string().max(64).parse(body.projectId)) });
      case 'checkin': return NextResponse.json({ goal: addCheckin(s, body) });
      case 'draft': return NextResponse.json({ draft: ruleDraft(getGoal(s, z.string().max(64).parse(body.goalId))) });
      case 'requestModelDraft': return NextResponse.json({ task: requestModelDraft(s, z.string().max(64).parse(body.goalId), { paidConsent: body.paidConsent === true }) });
      case 'readModelDraft': return NextResponse.json({ draft: readModelDraft(s, z.string().max(64).parse(body.taskId)) });
    }
  } catch (e) { return fail(e); }
}
