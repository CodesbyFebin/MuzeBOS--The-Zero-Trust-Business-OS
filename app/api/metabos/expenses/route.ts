import { memberRead } from '@/lib/metabos/member-read';
import { readJsonBounded } from '@/lib/bounded-body';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { businessStore, BusinessError } from '@/lib/metabos/store';
import { businessAccess } from '@/lib/metabos/http';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
function fail(e: unknown) {
  if (e instanceof BusinessError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof z.ZodError || e instanceof SyntaxError) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  return NextResponse.json({ error: 'Request failed' }, { status: 500 });
}
const lane = { lane: z.enum(['meta', 'baseten']).default('meta'), paidConsent: z.boolean().default(false) };
import { listExpenses, submitExpense, decideExpense, withdrawExpense, cannotDecide, MANAGER_LIMIT, EXPENSE_CATEGORIES } from '@/lib/metabos/biz/expenses';
import { listMembers } from '@/lib/metabos/biz/members';
import { currentMember, requireMember } from '@/lib/metabos/biz/accounts';
const cmd = z.discriminatedUnion('action', [
  z.object({ action: z.literal('submit'), expense: z.unknown() }),
  z.object({ action: z.literal('decide'), expenseId: z.string(), decision: z.string(), hash: z.string(), reason: z.string().optional() }),
  z.object({ action: z.literal('withdraw'), expenseId: z.string().max(64) }),
]);
export async function GET(req: Request) {
  try {
    memberRead(req, 'expense.submit'); const s = businessStore(); const me = currentMember(s, req); const actor = me?.id ?? null;
    const members = listMembers(s); const expenses = listExpenses(s).map((e) => ({ ...e, blockedFor: actor && members.some((m) => m.id === actor) ? cannotDecide(s, actor, e) : null }));
    return NextResponse.json({ me, members, expenses, managerLimit: MANAGER_LIMIT, categories: EXPENSE_CATEGORIES });
  } catch (e) { return fail(e); }
}
export async function POST(req: Request) {
  try {
    businessAccess(req); const c = cmd.parse(await readJsonBounded(req)); const s = businessStore(); const me = requireMember(s, req);
    if (c.action === 'submit') return NextResponse.json({ expense: submitExpense(s, me.id, c.expense) });
    if (c.action === 'withdraw') return NextResponse.json({ expense: withdrawExpense(s, me.id, c.expenseId) });
    const { action: _a, ...d } = c; return NextResponse.json({ expense: decideExpense(s, me.id, d) });
  } catch (e) { return fail(e); }
}
