import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBounded } from '@/lib/bounded-body';
import { BusinessError } from '@/lib/metabos/store';
import { memberRead } from '@/lib/metabos/member-read';
import { routeMuseVoice } from '@/lib/metabos/muse/voice';
import { metaDryRun } from '@/lib/metabos/meta/graph';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** MUSE command intake: classifies a spoken or typed command and records it in the evidence chain. Inference is /api/ai; sends are /api/bos then /api/dispatch. */
export async function POST(req: Request) {
  try {
    const { s, me } = memberRead(req);
    const b = z.object({ command: z.string().trim().min(1).max(600), via: z.enum(['voice', 'typed', 'chip']) }).strict().parse(await readJsonBounded(req));
    const r = routeMuseVoice(b.command);
    if (r.kind !== 'local' && r.kind !== 'empty') s.transact(() => s.appendEvidence('muse.command', r.kind, `${b.via} by ${me.id}: ${r.kind}${r.kind === 'view' ? ` ${r.view}` : ''}`));
    return NextResponse.json({ route: r, dryRun: metaDryRun(process.env) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof BusinessError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError || e instanceof SyntaxError) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
