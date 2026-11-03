import { requirePermission } from '@/lib/metabos/biz/accounts';
import { NextResponse } from 'next/server';
import { readJsonBounded } from '@/lib/bounded-body';
import { memberRead } from '@/lib/metabos/member-read';
import { fail, actorOf } from '@/lib/metabos/canvas/http';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
import { listComments, addComment } from '@/lib/metabos/canvas/store';
export async function GET(req: Request) { try { const { s } = memberRead(req); const f = new URL(req.url).searchParams.get('frameId') ?? undefined; return NextResponse.json({ comments: listComments(s, f) }); } catch (e) { return fail(e); } }
export async function POST(req: Request) { try { const { s, me } = memberRead(req); requirePermission(me, 'deals.write'); return NextResponse.json({ comment: addComment(s, actorOf(me), await readJsonBounded(req)) }, { status: 201 }); } catch (e) { return fail(e); } }
