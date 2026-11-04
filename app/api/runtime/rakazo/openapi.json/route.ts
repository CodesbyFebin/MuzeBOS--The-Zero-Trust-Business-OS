import { NextResponse } from 'next/server';
import { proposalOpenApi } from '@/lib/metabos/runtime/proposals';
export const dynamic = 'force-dynamic';
/** Public OpenAPI document for the propose_send tool source (no secrets in it). */
export function GET(req: Request) { return NextResponse.json(proposalOpenApi(new URL(req.url).origin)); }
