import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBounded } from '@/lib/bounded-body';
import { memberRead } from '@/lib/metabos/member-read';
import { requirePermission } from '@/lib/metabos/biz/accounts';
import { BusinessError } from '@/lib/metabos/store';
import { companionSnapshot, DraftInput, proposeCompanionDraft } from '@/lib/metabos/companion/core';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
function fail(e: unknown) { return NextResponse.json({ error: e instanceof BusinessError ? e.message : e instanceof z.ZodError || e instanceof SyntaxError ? 'Invalid companion request' : 'Companion unavailable' }, { status: e instanceof BusinessError ? e.status : e instanceof z.ZodError || e instanceof SyntaxError ? 400 : 500, headers: { 'Cache-Control': 'no-store' } }); }
export function GET(req: Request) { try { const { s } = memberRead(req, 'finance.read'); return NextResponse.json(companionSnapshot(s, process.env), { headers: { 'Cache-Control': 'no-store' } }); } catch (e) { return fail(e); } }
/** Creates an awaiting-approval draft only. There is no approve, execute, send, or shell operation here. */
export async function POST(req: Request) {
  try { const { s, me } = memberRead(req); requirePermission(me, 'expense.submit'); requirePermission(me, 'finance.read');
    const key = z.string().uuid().parse(req.headers.get('idempotency-key'));
    const input = DraftInput.parse(await readJsonBounded(req));
    const task = s.command(key, input, () => proposeCompanionDraft(s, input));
    return NextResponse.json({ task, next: '/workspace/brain/inference' }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return fail(e); }
}
