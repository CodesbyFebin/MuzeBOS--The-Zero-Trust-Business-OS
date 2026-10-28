import { readJsonBounded } from '@/lib/bounded-body';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { memberRead } from '@/lib/metabos/member-read';
import { BusinessError } from '@/lib/metabos/store';
import { listPipelines, startPipeline } from '@/lib/metabos/b3/pipeline';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const err = (e: unknown) => e instanceof BusinessError ? NextResponse.json({ error: e.message }, { status: e.status }) : e instanceof z.ZodError ? NextResponse.json({ error: 'Invalid request' }, { status: 400 }) : NextResponse.json({ error: 'Pipelines unavailable' }, { status: 503 });
export async function GET(req: Request) { try { const { s } = memberRead(req); return NextResponse.json({ pipelines: listPipelines(s) }); } catch (e) { return err(e); } }
export async function POST(req: Request) { try { const { s } = memberRead(req); return NextResponse.json({ ...(await startPipeline(s, await readJsonBounded(req))), dispatched: false }); } catch (e) { return err(e); } }
