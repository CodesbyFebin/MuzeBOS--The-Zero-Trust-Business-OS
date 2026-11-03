import { NextResponse } from 'next/server';
import { readJsonBounded } from '@/lib/bounded-body';
import { memberRead } from '@/lib/metabos/member-read';
import { fail, actorOf } from '@/lib/metabos/canvas/http';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
import { z } from 'zod';
import { generateIntoFrame } from '@/lib/metabos/canvas/generate';
export async function POST(req: Request) { try { const { s, me } = memberRead(req); const b = z.object({ id: z.string().uuid(), brief: z.string().trim().min(1).max(2000) }).strict().parse(await readJsonBounded(req)); return NextResponse.json(await generateIntoFrame(s, actorOf(me), b.id, b.brief)); } catch (e) { return fail(e); } }
