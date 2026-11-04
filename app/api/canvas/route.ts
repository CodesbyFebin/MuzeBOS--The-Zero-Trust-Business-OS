import { requirePermission } from '@/lib/metabos/biz/accounts';
import { NextResponse } from 'next/server';
import { readJsonBounded } from '@/lib/bounded-body';
import { memberRead } from '@/lib/metabos/member-read';
import { fail, actorOf } from '@/lib/metabos/canvas/http';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
import { listFrames, createFrame, patchFrame } from '@/lib/metabos/canvas/store';
import { canvasModel } from '@/lib/metabos/canvas/generate';
export async function GET(req: Request) { try { const { s } = memberRead(req); return NextResponse.json({ frames: listFrames(s), model: canvasModel(process.env) ? 'configured' : null }, { headers: { 'Cache-Control': 'no-store' } }); } catch (e) { return fail(e); } }
export async function POST(req: Request) { try { const { s, me } = memberRead(req); requirePermission(me, 'deals.write'); return NextResponse.json({ frame: createFrame(s, actorOf(me), await readJsonBounded(req)) }, { status: 201 }); } catch (e) { return fail(e); } }
export async function PATCH(req: Request) { try { const { s, me } = memberRead(req); requirePermission(me, 'deals.write'); return NextResponse.json({ frame: patchFrame(s, actorOf(me), await readJsonBounded(req)) }); } catch (e) { return fail(e); } }
