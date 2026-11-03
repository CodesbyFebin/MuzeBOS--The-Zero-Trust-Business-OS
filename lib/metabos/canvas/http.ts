import { NextResponse } from 'next/server';
import { z } from 'zod';
import { BusinessError } from '../store';
export const fail = (e: unknown) => e instanceof BusinessError ? NextResponse.json({ error: e.message }, { status: e.status }) : e instanceof z.ZodError ? NextResponse.json({ error: e.issues[0]?.message ?? 'Invalid request' }, { status: 400 }) : NextResponse.json({ error: 'Server error' }, { status: 500 });
export const actorOf = (me: unknown) => String((me as { email?: string }).email ?? (me as { id: string }).id);
