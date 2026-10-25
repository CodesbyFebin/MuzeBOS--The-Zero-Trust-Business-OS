import { NextResponse } from 'next/server';
import { z } from 'zod';
import { businessStore, BusinessError } from '@/lib/muzebos/store';
import { businessAccess } from '@/lib/muzebos/http';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const command=z.discriminatedUnion('action',[
  z.object({action:z.literal('configure'),data:z.unknown()}),
  z.object({action:z.literal('customer'),data:z.unknown()}),
  z.object({action:z.literal('product'),data:z.unknown()}),
  z.object({action:z.literal('draft'),data:z.unknown()}),
  z.object({action:z.literal('issue'),id:z.string().uuid(),hash:z.string().regex(/^[0-9a-f]{64}$/)}),
  z.object({action:z.literal('reject'),id:z.string().uuid()}),
  z.object({action:z.literal('reconcile'),id:z.string().uuid(),reference:z.string().trim().min(1).max(160)}),
]);
function failure(error: unknown) {
  if(error instanceof BusinessError) return NextResponse.json({error:error.message},{status:error.status});
  if(error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({error:'Invalid request',issues:error instanceof z.ZodError?error.issues:undefined},{status:400});
  console.error('Business operation failed',error instanceof Error ? error.name : 'unknown');
  return NextResponse.json({error:'Business operation failed'},{status:500});
}
export async function GET(req: Request) {
  try { businessAccess(req); return NextResponse.json(businessStore().snapshot(),{headers:{'Cache-Control':'no-store'}}); } catch(e) { return failure(e); }
}
export async function POST(req: Request) {
  try {
    businessAccess(req);
    if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new BusinessError('JSON content type required',415);
    if(Number(req.headers.get('content-length')||0)>64_000) throw new BusinessError('Request too large',413);
    const reader=req.body?.getReader();
    if(!reader) throw new BusinessError('Request body required');
    const chunks:Uint8Array[]=[];let size=0;
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>64_000){await reader.cancel();throw new BusinessError('Request too large',413);}chunks.push(value);}
    const raw=Buffer.concat(chunks).toString('utf8');
    const c=command.parse(JSON.parse(raw));
    const key=z.string().uuid().parse(req.headers.get('idempotency-key'));
    const store=businessStore();
    const result=store.command(key,c,()=>{
      switch(c.action) {
        case 'configure':return store.configure(c.data);
        case 'customer':return store.customer(c.data);
        case 'product':return store.product(c.data);
        case 'draft':return store.draft(c.data);
        case 'issue':return store.issue(c.id,c.hash);
        case 'reject':return store.reject(c.id);
        case 'reconcile':return store.reconcile(c.id,c.reference);
      }
    });
    return NextResponse.json({result},{headers:{'Cache-Control':'no-store'}});
  } catch(e) { return failure(e); }
}
