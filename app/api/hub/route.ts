import { readJsonBounded } from '@/lib/bounded-body';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { memberRead } from '@/lib/metabos/member-read';
import { BusinessError } from '@/lib/metabos/store';
import { buildAgent, createChannel, hubView, postDraft } from '@/lib/metabos/hub/agent-hub';
import { clawStatus, yaoStatus } from '@/lib/metabos/b3/agent-run';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const cmd = z.object({ action: z.enum(['createChannel', 'buildAgent', 'post']), input: z.unknown() }).strict();
const err = (e: unknown) => e instanceof BusinessError ? NextResponse.json({ error: e.message }, { status: e.status }) : e instanceof z.ZodError ? NextResponse.json({ error: 'Invalid request', issues: e.issues.slice(0, 5).map((i) => `${i.path.join('.')} ${i.message}`) }, { status: 400 }) : NextResponse.json({ error: 'Agent Hub unavailable' }, { status: 503 });
export async function GET(req: Request) {
  try { const { s } = memberRead(req); const u = new URL(req.url);
    return NextResponse.json({ ...hubView(s, u.searchParams.get('swarm')?.slice(0, 80) || undefined, u.searchParams.get('channel')?.slice(0, 80) || undefined), yao: yaoStatus(), claw: clawStatus() }, { headers: { 'Cache-Control': 'no-store' } }); } catch (e) { return err(e); }
}
export async function POST(req: Request) {
  try { const { s, me } = memberRead(req, 'jev.decide'); const c = cmd.parse(await readJsonBounded(req)); const who = String((me as { name?: string; id: string }).name ?? me.id);
    if (c.action === 'createChannel') return NextResponse.json(createChannel(s, who, c.input));
    if (c.action === 'buildAgent') return NextResponse.json(buildAgent(s, who, c.input));
    return NextResponse.json(postDraft(s, who, c.input));
  } catch (e) { return err(e); }
}
