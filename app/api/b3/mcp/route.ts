import { readJsonBounded } from '@/lib/bounded-body';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { memberRead } from '@/lib/metabos/member-read';
import { BusinessError } from '@/lib/metabos/store';
import { handleRpc, MCP_TOOLS } from '@/lib/metabos/b3/gst-mcp';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const Rpc = z.object({ jsonrpc: z.literal('2.0'), id: z.union([z.string().max(64), z.number(), z.null()]).optional(), method: z.string().max(64), params: z.object({ name: z.string().max(64).optional(), arguments: z.unknown().optional() }).passthrough().optional() });
export async function GET(req: Request) { try { memberRead(req); return NextResponse.json({ tools: MCP_TOOLS, transport: 'JSON-RPC over HTTP POST', readOnly: true }); } catch (e) { return e instanceof BusinessError ? NextResponse.json({ error: e.message }, { status: e.status }) : NextResponse.json({ error: 'MCP unavailable' }, { status: 503 }); } }
export async function POST(req: Request) {
  try { memberRead(req); return NextResponse.json(handleRpc(Rpc.parse(await readJsonBounded(req)) as Parameters<typeof handleRpc>[0])); }
  catch (e) { if (e instanceof BusinessError) return NextResponse.json({ error: e.message }, { status: e.status }); return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid request' } }, { status: 400 }); }
}
