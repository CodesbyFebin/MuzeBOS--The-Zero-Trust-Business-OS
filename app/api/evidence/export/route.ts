import { memberRead } from '@/lib/metabos/member-read';
import { NextResponse } from 'next/server';
import { businessStore, BusinessError } from '@/lib/metabos/store';
import { attestChain, exportChain } from '@/lib/metabos/evidence-export';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** Full evidence hash chain as portable JSON for independent verification (tools/agenet-verify).
 *  ?attest=1 also runs the Rust verifier server-side, if built. Hash-commitment, not ZK. */
export async function GET(req: Request) {
  try {
    memberRead(req, 'finance.read');
    const x = exportChain(businessStore().evidence());
    const attest = new URL(req.url).searchParams.get('attest') === '1';
    const body = attest ? { ...x, attestation: attestChain(x) } : x;
    return new NextResponse(JSON.stringify(body, null, 2), { headers: { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="metabos-evidence-chain.json"', 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof BusinessError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: 'Evidence export unavailable' }, { status: 500 });
  }
}
