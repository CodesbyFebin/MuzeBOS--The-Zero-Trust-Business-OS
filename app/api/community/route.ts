import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBounded } from '@/lib/bounded-body';
import { memberRead } from '@/lib/metabos/member-read';
import { fail } from '@/lib/metabos/canvas/http';
import { requirePermission } from '@/lib/metabos/biz/accounts';
import { agentPost, createChannel, createServer, createThread, edit, post, proposeMeta, remove, roleOf, snapshot } from '@/lib/metabos/community/store';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const Q = z.object({ channelId: z.string().uuid().optional(), threadId: z.string().uuid().optional() });
export async function GET(req: Request) {
  try { const { s, me } = memberRead(req); const q = Q.parse(Object.fromEntries(new URL(req.url).searchParams));
    return NextResponse.json({ ...snapshot(s, q.channelId, q.threadId), me: { id: me.id, name: me.name, role: roleOf(me) } }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (e) { return fail(e); }
}
const B = z.object({ action: z.enum(['createServer', 'createChannel', 'createThread', 'post', 'agentPost', 'edit', 'delete', 'proposeMeta']), input: z.unknown() }).strict();
export async function POST(req: Request) {
  try { const { s, me } = memberRead(req); const b = B.parse(await readJsonBounded(req));
    switch (b.action) {
      case 'createServer': return NextResponse.json({ server: createServer(s, me, b.input) }, { status: 201 });
      case 'createChannel': return NextResponse.json({ channel: createChannel(s, me, b.input) }, { status: 201 });
      case 'createThread': return NextResponse.json({ thread: createThread(s, me, b.input) }, { status: 201 });
      case 'post': return NextResponse.json({ message: post(s, me, b.input) }, { status: 201 });
      case 'agentPost': requirePermission(me, 'jev.decide'); return NextResponse.json({ message: agentPost(s, me, b.input) }, { status: 201 });
      case 'edit': return NextResponse.json({ message: edit(s, me, b.input) });
      case 'delete': return NextResponse.json(remove(s, me, b.input));
      case 'proposeMeta': requirePermission(me, 'expense.submit'); return NextResponse.json(proposeMeta(s, me, b.input), { status: 201 });
    } }
  catch (e) { return fail(e); }
}
