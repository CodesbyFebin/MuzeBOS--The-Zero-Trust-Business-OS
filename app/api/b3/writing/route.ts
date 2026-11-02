import { readJsonBounded } from '@/lib/bounded-body';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { memberRead } from '@/lib/metabos/member-read';
import { BusinessError } from '@/lib/metabos/store';
import { addSource, embeddingsStatus, inYourVoice, listSources, refreshSource, removeSource } from '@/lib/metabos/b3/writing';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add'), url: z.string().max(500) }).strict(),
  z.object({ action: z.literal('refresh'), id: z.string().uuid() }).strict(),
  z.object({ action: z.literal('remove'), id: z.string().uuid() }).strict(),
]);
const err = (e: unknown) => e instanceof BusinessError ? NextResponse.json({ error: e.message }, { status: e.status }) : e instanceof z.ZodError ? NextResponse.json({ error: 'Invalid request' }, { status: 400 }) : NextResponse.json({ error: 'Writing library unavailable' }, { status: 503 });
export async function GET(req: Request) {
  try { const { s } = memberRead(req); const q = new URL(req.url).searchParams.get('q')?.slice(0, 200) ?? '';
    return NextResponse.json({ sources: listSources(s), embeddings: embeddingsStatus(), voice: q ? inYourVoice(s, q) : null }); } catch (e) { return err(e); }
}
export async function POST(req: Request) {
  try { const { s, me } = memberRead(req, 'memory.company'); const b = body.parse(await readJsonBounded(req));
    if (b.action === 'add') { const id = addSource(s, String((me as { id?: string }).id ?? 'owner'), b.url); let result: unknown = null; let fetchError: string | null = null; try { result = await refreshSource(s, id); } catch (e) { fetchError = e instanceof Error ? e.message : 'fetch failed'; } return NextResponse.json({ id, result, fetchError }); }
    if (b.action === 'refresh') return NextResponse.json({ result: await refreshSource(s, b.id) });
    removeSource(s, b.id); return NextResponse.json({ removed: b.id });
  } catch (e) { return err(e); }
}
