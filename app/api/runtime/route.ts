import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBounded } from '@/lib/bounded-body';
import { BusinessError } from '@/lib/metabos/store';
import { memberRead } from '@/lib/metabos/member-read';
import { getRuntime, setRuntime, rakazoConfig, missingRakazo, RakazoClient } from '@/lib/metabos/runtime/rakazo';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const err = (e: unknown) => e instanceof BusinessError ? NextResponse.json({ error: e.message }, { status: e.status }) : e instanceof z.ZodError ? NextResponse.json({ error: 'Invalid request' }, { status: 400 }) : NextResponse.json({ error: 'Server error' }, { status: 500 });
const who = (me: unknown) => String((me as { email?: string; id: string }).email ?? (me as { id: string }).id);
/** Agent runtime: local (default) or Rakazo. Rakazo bots are listed only when it is configured and reachable. */
export async function GET(req: Request) {
  try { const { s } = memberRead(req); const cfg = rakazoConfig(process.env); const mode = getRuntime(s);
    if (!cfg) return NextResponse.json({ mode, rakazo: { configured: false, missing: missingRakazo(process.env), bots: [] } }, { headers: { 'Cache-Control': 'no-store' } });
    const c = new RakazoClient(cfg); const h = await c.health(); let bots: unknown[] = []; let botsError: string | null = null;
    if (h.ok) { try { bots = await c.listBots(); } catch (e) { botsError = e instanceof Error ? e.message : 'failed'; } }
    return NextResponse.json({ mode, rakazo: { configured: true, health: h, bots, botsError } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return err(e); }
}
const Put = z.discriminatedUnion('action', [
  z.object({ action: z.literal('mode'), mode: z.enum(['local', 'rakazo']) }).strict(),
  z.object({ action: z.literal('create'), name: z.string().trim().min(1).max(60), description: z.string().max(300).default('') }).strict(),
  z.object({ action: z.literal('message'), botId: z.string().min(1).max(64), text: z.string().trim().min(1).max(4000) }).strict(),
]);
export async function PUT(req: Request) {
  try { const { s, me } = memberRead(req); const b = Put.parse(await readJsonBounded(req));
    if (b.action === 'mode') return NextResponse.json({ mode: setRuntime(s, who(me), b.mode, process.env) });
    const cfg = rakazoConfig(process.env); if (!cfg) throw new BusinessError('Rakazo not configured', 409); const c = new RakazoClient(cfg);
    if (b.action === 'create') { const bot = await c.createBot({ name: b.name, description: b.description }); s.appendEvidence('runtime.rakazo.bot.create', bot.id, JSON.stringify({ by: who(me), name: bot.name })); return NextResponse.json({ bot }); }
    await c.message(b.botId, b.text); s.appendEvidence('runtime.rakazo.message', b.botId, JSON.stringify({ by: who(me), chars: b.text.length })); return NextResponse.json({ sent: true });
  } catch (e) { return err(e); }
}
