import type { BusinessStore } from './store';
import type { AgentTask } from '@/lib/schemas';
import type { ConnectorStatus } from '@/lib/connectors/types';
export type MissionTodo={id:string;title:string;dueAt:string|null;status:string;kind:'reminder'|'task';overdue:boolean};
export function missionSnapshot(store:BusinessStore,tasks:AgentTask[],connectors:ConnectorStatus[],at=new Date()) {
 const records=store.snapshot();const reminders=store.reminders();const timestamp=at.toISOString();
 const todo:MissionTodo[]=[...reminders.filter(r=>r.status==='open').map(r=>({id:r.id,title:r.title,dueAt:r.dueAt,status:r.status,kind:'reminder' as const,overdue:!!r.dueAt&&Date.parse(r.dueAt)<at.getTime()})),...tasks.filter(t=>t.status!=='done').map(t=>({id:t.id,title:t.title,dueAt:t.dueAt,status:t.status,kind:'task' as const,overdue:!!t.dueAt&&Date.parse(t.dueAt)<at.getTime()}))].sort((a,b)=>Number(b.overdue)-Number(a.overdue)||(a.dueAt?Date.parse(a.dueAt):Infinity)-(b.dueAt?Date.parse(b.dueAt):Infinity)||a.title.localeCompare(b.title));
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
 const stockouts=records.products.filter(p=>p.stock===0);
 return {graph:{nodes:graphNodes,edges:graphEdges},asOf:timestamp,mode:'real' as const,refreshSeconds:20,counters:{customers:records.customers.length,products:records.products.length,awaitingApproval:approvals.filter(a=>!a.expired).length,expiredApprovals:approvals.filter(a=>a.expired).length,paymentPending:pending.length,paymentPendingMinor:pending.reduce((s,i)=>s+i.payload.total,0),issuedInvoices:records.invoices.length,issuedMinor:records.invoices.reduce((s,i)=>s+i.payload.total,0),outOfStock:stockouts.length,openTodos:todo.length,overdue:todo.filter(t=>t.overdue).length,blockedTasks:tasks.filter(t=>t.status==='blocked').length},approvals:approvals.slice(0,8),stockouts:stockouts.slice(0,6).map(p=>({id:p.id,name:p.name,sku:p.sku})),todo:todo.slice(0,30),completedReminders:reminders.filter(r=>r.status==='done').length,feed:records.evidence.slice(0,12),auditValid:records.auditValid,connections:connectors.map(c=>({id:c.id,name:c.name,state:c.state,detail:c.detail})),sources:{business:'available',tasks:'available',connections:'available'} as Record<string,string>};
}
export type MissionSnapshot=ReturnType<typeof missionSnapshot>;
