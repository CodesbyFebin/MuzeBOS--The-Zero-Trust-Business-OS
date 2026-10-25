import { NextResponse } from 'next/server';
import { businessAccess } from '@/lib/muzebos/http';
import { businessStore, BusinessError } from '@/lib/muzebos/store';
import { missionSnapshot } from '@/lib/muzebos/mission';
import { getDb } from '@/lib/data';
import { filmingMode } from '@/lib/paths';
import { allConnectorStatuses } from '@/lib/connectors';
import type { ConnectorStatus } from '@/lib/connectors/types';
import type { AgentTask } from '@/lib/schemas';
export const dynamic='force-dynamic';
export const runtime='nodejs';
async function boundedConnections():Promise<ConnectorStatus[]> {
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([allConnectorStatuses(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Connection status timeout')),5000);})]);}finally{if(timer)clearTimeout(timer);}
}
export async function GET(req:Request) {
 try {
  businessAccess(req);
  // The commerce store is real even if inherited preview mode is on. Never
  // mix fictional tasks/connectors into the real mission-control summary.
  const demo=filmingMode();
  const [tasks,connections]=await Promise.allSettled([Promise.resolve().then(()=>demo?[] as AgentTask[]:getDb().agentTasks.all()),demo?Promise.resolve([] as ConnectorStatus[]):boundedConnections()]);
  const summary=missionSnapshot(businessStore(),tasks.status==='fulfilled'?tasks.value:[],connections.status==='fulfilled'?connections.value:[]);
  summary.sources.tasks=demo?'preview_excluded':tasks.status==='fulfilled'?'available':'unavailable';
  summary.sources.connections=demo?'preview_excluded':connections.status==='fulfilled'?'available':'unavailable';
  return NextResponse.json(summary,{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({error:e instanceof BusinessError?e.message:'Mission status unavailable'},{status:e instanceof BusinessError?e.status:503});}
}
