import type { BusinessStore } from './store';
import type { AgentTask } from '@/lib/schemas';
import type { ConnectorStatus } from '@/lib/connectors/types';
import type { ReminderLinkKind } from './store';
export type MissionTodo={id:string;title:string;dueAt:string|null;status:string;kind:'reminder'|'task';overdue:boolean;dueToday:boolean;link:{kind:ReminderLinkKind;id:string;label:string;href:string}|null};
/** Fixed, disclosed threshold. Per-product reorder points are not modelled yet. */
export const LOW_STOCK_UNITS=5;
const RECORD_VIEW:Record<ReminderLinkKind,string>={customer:'/business?view=customers',product:'/business?view=inventory',order:'/business?view=orders',invoice:'/business?view=invoices',booking:'/workspace/orders/bookings'};
/** Source record for an evidence entry, derived from its action prefix. */
export function activityHref(action:string):string|null{
 const kind=action.split('.')[0];
 const map:Record<string,string>={customer:RECORD_VIEW.customer,product:RECORD_VIEW.product,approval:RECORD_VIEW.order,invoice:RECORD_VIEW.invoice,payment:RECORD_VIEW.invoice,booking:RECORD_VIEW.booking,reminder:'/#mission-todo',merchant:'/business?view=settings',webhook:'/workspace/system/webhooks'};
 return map[kind]??null;
}
/** Start/end of the operator's local calendar day, given Date#getTimezoneOffset minutes. */
export function localDay(at:Date,tzOffsetMinutes=0){const local=new Date(at.getTime()-tzOffsetMinutes*60_000);local.setUTCHours(0,0,0,0);const start=local.getTime()+tzOffsetMinutes*60_000;return{start,end:start+86_400_000};}
export function missionSnapshot(store:BusinessStore,tasks:AgentTask[],connectors:ConnectorStatus[],at=new Date(),tzOffsetMinutes=0) {
 const records=store.snapshot();const reminders=store.reminders();const timestamp=at.toISOString();const day=localDay(at,tzOffsetMinutes);
 const today=(d:string|null)=>!!d&&Date.parse(d)>=day.start&&Date.parse(d)<day.end;
 const label=(kind:ReminderLinkKind,id:string)=>kind==='customer'?records.customers.find(c=>c.id===id)?.name:kind==='product'?records.products.find(p=>p.id===id)?.sku:kind==='order'?records.orders.find(o=>o.id===id)?.payload.customer.name:kind==='invoice'?records.invoices.find(i=>i.id===id)?.number:store.bookings().find(b=>b.id===id)?.resource;
 const todo:MissionTodo[]=[...reminders.filter(r=>r.status==='open').map(r=>({id:r.id,title:r.title,dueAt:r.dueAt,status:r.status,kind:'reminder' as const,overdue:!!r.dueAt&&Date.parse(r.dueAt)<at.getTime(),dueToday:today(r.dueAt),link:r.linkKind&&r.linkId?{kind:r.linkKind,id:r.linkId,label:label(r.linkKind,r.linkId)??'Record',href:RECORD_VIEW[r.linkKind]}:null})),...tasks.filter(t=>t.status!=='done').map(t=>({id:t.id,title:t.title,dueAt:t.dueAt,status:t.status,kind:'task' as const,overdue:!!t.dueAt&&Date.parse(t.dueAt)<at.getTime(),dueToday:today(t.dueAt),link:null}))].sort((a,b)=>Number(b.overdue)-Number(a.overdue)||(a.dueAt?Date.parse(a.dueAt):Infinity)-(b.dueAt?Date.parse(b.dueAt):Infinity)||a.title.localeCompare(b.title));
 const approvals=records.orders.filter(o=>o.status==='awaiting_review').map(o=>({id:o.id,customer:o.payload.customer.name,total:o.payload.total,expiresAt:o.expiresAt,expired:o.expiresAt<=timestamp}));
 const graphNodes=[
 ...records.customers.slice(0,4).map((c,i)=>({id:c.id,kind:'Customer',label:c.name,detail:c.email||'No email supplied',href:'/business?view=customers',x:90,y:65+i*65})),
 ...records.products.slice(0,4).map((p,i)=>({id:p.id,kind:'Product',label:p.sku,detail:`${p.name} · ${p.stock} in stock`,href:'/business?view=inventory',x:310,y:65+i*65})),
 ...records.orders.slice(0,4).map((o,i)=>({id:o.id,kind:'Order',label:o.payload.customer.name,detail:o.status,href:'/business?view=orders',x:530,y:65+i*65})),
 ...records.invoices.slice(0,4).map((inv,i)=>({id:inv.id,kind:'Invoice',label:inv.number,detail:`${inv.payment} · ${inv.payload.total} INR minor units`,href:'/business?view=invoices',x:750,y:65+i*65})),
 ];
 const visible=new Set(graphNodes.map(n=>n.id));
 const graphEdges=[...records.orders.flatMap(o=>[{from:o.payload.customer.id,to:o.id},...o.payload.lines.map(l=>({from:l.productId,to:o.id}))]),...records.invoices.map(i=>({from:i.orderId,to:i.id}))].filter(e=>visible.has(e.from)&&visible.has(e.to));
 const pending=records.invoices.filter(i=>i.payment==='pending');
 const stockouts=records.products.filter(p=>p.stock===0);const low=records.products.filter(p=>p.stock>0&&p.stock<=LOW_STOCK_UNITS);const settled=records.invoices.filter(i=>i.payment==='manually_reconciled');
 return {graph:{nodes:graphNodes,edges:graphEdges},asOf:timestamp,mode:'real' as const,refreshSeconds:20,counters:{customers:records.customers.length,products:records.products.length,awaitingApproval:approvals.filter(a=>!a.expired).length,expiredApprovals:approvals.filter(a=>a.expired).length,paymentPending:pending.length,paymentPendingMinor:pending.reduce((s,i)=>s+i.payload.total,0),issuedInvoices:records.invoices.length,issuedMinor:records.invoices.reduce((s,i)=>s+i.payload.total,0),outOfStock:stockouts.length,lowStock:low.length,lowStockUnits:LOW_STOCK_UNITS,settled:settled.length,settledMinor:settled.reduce((s,i)=>s+i.payload.total,0),paymentRequested:null as number|null,dueToday:todo.filter(t=>t.dueToday).length,openTasks:tasks.filter(t=>t.status!=='done').length,openTodos:todo.length,overdue:todo.filter(t=>t.overdue).length,blockedTasks:tasks.filter(t=>t.status==='blocked').length},approvals:approvals.slice(0,8),stockouts:stockouts.slice(0,6).map(p=>({id:p.id,name:p.name,sku:p.sku})),lowStock:low.slice(0,6).map(p=>({id:p.id,name:p.name,sku:p.sku,stock:p.stock})),completed:reminders.filter(r=>r.status==='done').slice(0,10).map(r=>({id:r.id,title:r.title,completedAt:r.completedAt})),todo:todo.slice(0,30),completedReminders:reminders.filter(r=>r.status==='done').length,feed:records.evidence.slice(0,12).map(e=>({...e,href:activityHref(e.action)})),connectionsCheckedAt:timestamp,linkOptions:[...records.customers.map(c=>({kind:'customer' as const,id:c.id,label:c.name})),...records.products.map(p=>({kind:'product' as const,id:p.id,label:p.sku})),...records.orders.map(o=>({kind:'order' as const,id:o.id,label:`${o.payload.customer.name} · ${o.status}`})),...records.invoices.map(i=>({kind:'invoice' as const,id:i.id,label:i.number}))].slice(0,60),auditValid:records.auditValid,connections:connectors.map(c=>({id:c.id,name:c.name,state:c.state,detail:c.detail})),sources:{business:'available',tasks:'available',connections:'available'} as Record<string,string>};
}
export type MissionSnapshot=ReturnType<typeof missionSnapshot>;
