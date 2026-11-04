import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBounded } from '@/lib/bounded-body';
import { BusinessError } from '@/lib/metabos/store';
import { memberRead } from '@/lib/metabos/member-read';
import { getBoard, putBoard } from '@/lib/metabos/board/config';
import { TILES } from '@/lib/metabos/board/registry';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const err = (e: unknown) => e instanceof BusinessError ? NextResponse.json({ error: e.message }, { status: e.status }) : e instanceof z.ZodError ? NextResponse.json({ error: 'Invalid request' }, { status: 400 }) : NextResponse.json({ error: 'Server error' }, { status: 500 });
const defs = TILES.map(({ id, group, name, checks }) => ({ id, group, name, checks }));
/** Board layout (tiles, order, size, hidden) plus what each tile checks. */
export async function GET(req: Request) { try { const { s } = memberRead(req); return NextResponse.json({ board: getBoard(s), defs }, { headers: { 'Cache-Control': 'no-store' } }); } catch (e) { return err(e); } }
export async function PUT(req: Request) {
  try { const { s, me } = memberRead(req); const who = String((me as { email?: string; id: string }).email ?? me.id);
    return NextResponse.json({ board: putBoard(s, who, await readJsonBounded(req)), defs }); } catch (e) { return err(e); }
}
