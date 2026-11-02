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
import { listExpenses, submitExpense, decideExpense, withdrawExpense, cannotDecide, MANAGER_LIMIT, EXPENSE_CATEGORIES } from '@/lib/muzebos/biz/expenses';
import { listMembers, addMember } from '@/lib/muzebos/biz/members';
const cmd = z.discriminatedUnion('action', [
  z.object({ action: z.literal('submit'), actorId: z.string().max(64), expense: z.unknown() }),
  z.object({ action: z.literal('decide'), actorId: z.string().max(64), expenseId: z.string(), decision: z.string(), hash: z.string(), reason: z.string().optional() }),
  z.object({ action: z.literal('withdraw'), actorId: z.string().max(64), expenseId: z.string().max(64) }),
  z.object({ action: z.literal('addMember'), actorId: z.string().max(64), member: z.unknown() }),
]);
export async function GET(req: Request) {
  try {
    businessAccess(req); const s = businessStore(); const actor = new URL(req.url).searchParams.get('actorId');
    const members = listMembers(s); const expenses = listExpenses(s).map((e) => ({ ...e, blockedFor: actor && members.some((m) => m.id === actor) ? cannotDecide(s, actor, e) : null }));
    return NextResponse.json({ members, expenses, managerLimit: MANAGER_LIMIT, categories: EXPENSE_CATEGORIES });
  } catch (e) { return fail(e); }
}
export async function POST(req: Request) {
  try {
    businessAccess(req); const c = cmd.parse(await req.json()); const s = businessStore();
    if (c.action === 'submit') return NextResponse.json({ expense: submitExpense(s, c.actorId, c.expense) });
    if (c.action === 'withdraw') return NextResponse.json({ expense: withdrawExpense(s, c.actorId, c.expenseId) });
    if (c.action === 'addMember') return NextResponse.json({ member: addMember(s, c.actorId, c.member) });
    const { action: _a, actorId, ...d } = c; return NextResponse.json({ expense: decideExpense(s, actorId, d) });
  } catch (e) { return fail(e); }
}
