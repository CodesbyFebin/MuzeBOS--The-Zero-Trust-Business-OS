import { NextResponse } from 'next/server';
import { readJsonBounded } from '@/lib/bounded-body';
import { memberRead } from '@/lib/metabos/member-read';
import { fail, actorOf } from '@/lib/metabos/canvas/http';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
import { z } from 'zod';
import { markReady } from '@/lib/metabos/canvas/store';
export async function POST(req: Request) { try { const { s, me } = memberRead(req); const { id } = z.object({ id: z.string().uuid() }).strict().parse(await readJsonBounded(req)); return NextResponse.json(markReady(s, actorOf(me), id)); } catch (e) { return fail(e); } }
