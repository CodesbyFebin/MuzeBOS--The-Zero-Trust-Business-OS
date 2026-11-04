import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBounded } from '@/lib/bounded-body';
import { BusinessError } from '@/lib/metabos/store';
import { memberRead } from '@/lib/metabos/member-read';
import { assignableAgents, createIssue, listIssues, updateIssue } from '@/lib/metabos/board/issues';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const err = (e: unknown) => e instanceof BusinessError ? NextResponse.json({ error: e.message }, { status: e.status }) : e instanceof z.ZodError ? NextResponse.json({ error: 'Invalid request' }, { status: 400 }) : NextResponse.json({ error: 'Server error' }, { status: 500 });
const who = (me: unknown) => String((me as { email?: string; id: string }).email ?? (me as { id: string }).id);
/** Issues assigned to agents, plus the agents that can take one. */
export async function GET(req: Request) { try { const { s } = memberRead(req); return NextResponse.json({ issues: listIssues(s), agents: assignableAgents(s) }, { headers: { 'Cache-Control': 'no-store' } }); } catch (e) { return err(e); } }
export async function POST(req: Request) { try { const { s, me } = memberRead(req); return NextResponse.json({ issue: createIssue(s, who(me), await readJsonBounded(req)) }, { status: 201 }); } catch (e) { return err(e); } }
export async function PATCH(req: Request) { try { const { s, me } = memberRead(req); return NextResponse.json({ issue: updateIssue(s, who(me), await readJsonBounded(req)) }); } catch (e) { return err(e); } }
