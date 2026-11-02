import { readJsonBounded } from '@/lib/bounded-body';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { memberRead } from '@/lib/metabos/member-read';
import { BusinessError } from '@/lib/metabos/store';
import { requirePermission } from '@/lib/metabos/biz/accounts';
import { DemoInput, demoStatus, draftReply, fixtureLead, recordHeld } from '@/lib/metabos/demo/judge';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const err = (e: unknown) => e instanceof BusinessError ? NextResponse.json({ error: e.message }, { status: e.status }) : e instanceof z.ZodError ? NextResponse.json({ error: 'Invalid request' }, { status: 400 }) : NextResponse.json({ error: 'Server error' }, { status: 500 });
/** Judge demo helpers. Writes need jev.decide. Fixtures are labelled; sends still use /api/dispatch. */
export async function GET(req: Request) { try { const { s } = memberRead(req); return NextResponse.json(demoStatus(s, process.env), { headers: { 'Cache-Control': 'no-store' } }); } catch (e) { return err(e); } }
export async function POST(req: Request) {
  try { const { s, me } = memberRead(req); requirePermission(me, 'jev.decide'); const b = DemoInput.parse(await readJsonBounded(req)); const who = String((me as { name?: string; id: string }).name ?? me.id);
    if (b.action === 'status') return NextResponse.json(demoStatus(s, process.env));
    if (b.action === 'fixtureLead') return NextResponse.json(fixtureLead(s, who, process.env));
    if (b.action === 'draft') return NextResponse.json(draftReply(s, who, b.conversationId, b.brand));
    return NextResponse.json(recordHeld(s, who, b.dispatchId, b.reason));
  } catch (e) { return err(e); }
}
