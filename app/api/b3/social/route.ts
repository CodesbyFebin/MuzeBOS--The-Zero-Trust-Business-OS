import { readJsonBounded } from '@/lib/bounded-body';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { memberRead } from '@/lib/metabos/member-read';
import { BusinessError } from '@/lib/metabos/store';
import { channelStatus, listPosts, queuePosts } from '@/lib/metabos/b3/social';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const body = z.object({ posts: z.array(z.unknown()).min(1).max(14) }).strict();
const err = (e: unknown) => e instanceof BusinessError ? NextResponse.json({ error: e.message }, { status: e.status }) : e instanceof z.ZodError ? NextResponse.json({ error: 'Invalid request' }, { status: 400 }) : NextResponse.json({ error: 'Social queue unavailable' }, { status: 503 });
export async function GET(req: Request) { try { const { s } = memberRead(req); return NextResponse.json({ posts: listPosts(s), channels: channelStatus() }); } catch (e) { return err(e); } }
export async function POST(req: Request) { try { const { s, me } = memberRead(req); const b = body.parse(await readJsonBounded(req)); return NextResponse.json({ posts: queuePosts(s, String((me as { id?: string }).id ?? 'member'), b.posts), dispatched: false }); } catch (e) { return err(e); } }
