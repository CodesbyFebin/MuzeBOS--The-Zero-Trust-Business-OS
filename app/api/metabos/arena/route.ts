import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBounded, BodyTooLargeError } from '@/lib/bounded-body';
import { memberRead } from '@/lib/metabos/member-read';
import { requirePermission } from '@/lib/metabos/biz/accounts';
import { BusinessError } from '@/lib/metabos/store';
import { InferenceStore } from '@/lib/metabos/inference/store';
import { skills, saveSkill, skill, exportSkill, proposeSkill } from '@/lib/metabos/arena/skills';
import { floorActors } from '@/lib/metabos/arena/snapshot';
export const dynamic = 'force-dynamic';
const id = z.string().regex(/^[a-z][a-z0-9-]{2,63}$/), version = z.number().int().min(1).max(100000);
const Command = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), manifest: z.unknown(), expectedVersion: z.number().int().min(0).max(99999) }).strict(),
  z.object({ action: z.literal('propose'), id, version, hash: z.string().regex(/^[a-f0-9]{64}$/), context: z.string().trim().min(1).max(4000) }).strict(),
]);
function fail(e: unknown) { const status = e instanceof BusinessError || e instanceof BodyTooLargeError ? e.status : e instanceof z.ZodError || e instanceof SyntaxError ? 400 : 500; return NextResponse.json({ error: status === 500 ? 'Arena operation failed' : e instanceof Error ? e.message : 'Invalid request' }, { status, headers: { 'Cache-Control': 'no-store' } }); }
export function GET(req: Request) {
  try {
    const { s } = memberRead(req, 'finance.read'); const url = new URL(req.url);
    if (url.searchParams.has('export')) {
      const v = skill(s, id.parse(url.searchParams.get('id')), version.parse(Number(url.searchParams.get('version'))));
      const format = z.enum(['json', 'yaml', 'markdown']).parse(url.searchParams.get('export'));
      return new Response(exportSkill(v, format), { headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': `attachment; filename="${v.id}-v${v.version}.${format === 'markdown' ? 'md' : format}"` } });
    }
    const snap = new InferenceStore(s).snapshot(), at = Date.now();
    return NextResponse.json({ at: new Date(at).toISOString(), actors: floorActors(snap.tasks, at), tasks: snap.tasks.map(t => ({ id: t.id, title: t.payload.title, agent: t.payload.agent, state: t.state, parentId: t.payload.parentId, hash: t.hash, outputHash: t.outputHash, workerId: t.workerId, leaseUntil: t.leaseUntil })), workers: snap.workers, counters: snap.counters, evidence: s.evidence().filter(e => /^(inference\.|arena\.)/.test(e.action)).slice(-60).reverse(), auditValid: snap.auditValid, skills: skills(s), proof: snap.proof, isolation: { state: 'not_configured', detail: 'No per-agent computer or verified isolated sandbox attached. This view observes inference drafts; it does not start terminal processes.' } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return fail(e); }
}
export async function POST(req: Request) {
  try {
    const { s, me } = memberRead(req, 'finance.read'); requirePermission(me, 'jev.decide');
    if (!req.headers.get('content-type')?.startsWith('application/json')) throw new BusinessError('JSON required', 415);
    const key = z.string().uuid().parse(req.headers.get('idempotency-key'));
    const c = Command.parse(await readJsonBounded(req, 32000));
    const result = s.command(key, c, () => c.action === 'save' ? saveSkill(s, me.id, c.manifest, c.expectedVersion) : proposeSkill(s, me.id, c));
    return NextResponse.json({ result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return fail(e); }
}
