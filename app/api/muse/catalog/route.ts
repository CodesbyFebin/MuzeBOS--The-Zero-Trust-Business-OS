import { NextResponse } from 'next/server';
import { z } from 'zod';
import { memberRead } from '@/lib/metabos/member-read';
import { BusinessError } from '@/lib/metabos/store';
import { counts, loadCatalog, searchCatalog } from '@/lib/metabos/muse-catalog';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const Q = z.object({ q: z.string().max(80).optional(), kind: z.enum(['skill', 'mcp']).optional(), status: z.enum(['adoptable', 'reference', 'blocked']).optional(), fit: z.enum(['content', 'sales', 'ops', 'support', 'research']).optional(), limit: z.coerce.number().int().min(1).max(100).optional(), offset: z.coerce.number().int().min(0).max(100000).optional() });
/** Read-only MUSE skill/MCP catalog search. Running anything goes through POST /api/dispatch (channel "tool-call") and Jev. */
export async function GET(req: Request) {
  try {
    memberRead(req);
    const p = Q.parse(Object.fromEntries(new URL(req.url).searchParams));
    const c = loadCatalog();
    return NextResponse.json({ generatedAt: c.generatedAt, notes: c.notes, counts: counts(), ...searchCatalog(p, process.env) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof BusinessError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
    return NextResponse.json({ error: 'Catalog unavailable' }, { status: 503 });
  }
}
