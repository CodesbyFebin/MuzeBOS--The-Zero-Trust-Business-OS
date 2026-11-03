import { NextResponse } from 'next/server';
import { readJsonBounded } from '@/lib/bounded-body';
import { memberRead } from '@/lib/metabos/member-read';
import { fail, actorOf } from '@/lib/metabos/canvas/http';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
import { z } from 'zod';
import { CANVAS_TOOLS, handleCanvasRpc } from '@/lib/metabos/canvas/mcp';
const Rpc = z.object({ jsonrpc: z.literal('2.0'), id: z.union([z.string().max(64), z.number(), z.null()]).optional(), method: z.string().max(64), params: z.object({ name: z.string().max(64).optional(), arguments: z.unknown().optional() }).passthrough().optional() }).strict();
export async function GET(req: Request) { try { memberRead(req); return NextResponse.json({ tools: CANVAS_TOOLS, transport: 'JSON-RPC over HTTP POST', writes: 'canvas frames only' }); } catch (e) { return fail(e); } }
export async function POST(req: Request) {
  try { const { s, me } = memberRead(req); const m = Rpc.safeParse(await readJsonBounded(req)); if (!m.success) return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid request' } }, { status: 400 }); return NextResponse.json(await handleCanvasRpc(s, actorOf(me), m.data as Parameters<typeof handleCanvasRpc>[2])); }
  catch (e) { return fail(e); }
}
