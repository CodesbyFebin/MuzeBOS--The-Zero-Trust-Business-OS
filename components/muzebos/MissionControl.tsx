'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { MissionGraph } from './MissionGraph';
import { ArrowUpRight, Check, Clock3, ListTodo, Package, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';
import type { MissionSnapshot } from '@/lib/muzebos/mission';
import { WORKSPACE_CATEGORIES } from '@/lib/muzebos/navigation';
const amount=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(n/100);
const date=(s:string)=>new Date(s).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
export function MissionControl() {
 const [data,setData]=useState<MissionSnapshot|null>(null);const [error,setError]=useState('');const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);const [refreshing,setRefreshing]=useState(false);
 const refresh=useCallback(async(signal?:AbortSignal)=>{
  const res=await fetch('/api/mission-control',{cache:'no-store',signal});const body=await res.json();
  if(!res.ok)throw new Error(body.error||'Unable to update mission status');setData(body);setError('');
 },[]);
 useEffect(()=>{
  const controller=new AbortController();let inFlight=false;
  const update=async()=>{if(inFlight||controller.signal.aborted)return;inFlight=true;setRefreshing(true);try{await refresh(controller.signal);}catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Update failed');}finally{inFlight=false;if(!controller.signal.aborted)setRefreshing(false);}};
  void update();const interval=setInterval(()=>{if(document.visibilityState==='visible')void update();},20000);
  const resume=()=>{if(document.visibilityState==='visible')void update();};document.addEventListener('visibilitychange',resume);window.addEventListener('focus',resume);
  return()=>{controller.abort();clearInterval(interval);document.removeEventListener('visibilitychange',resume);window.removeEventListener('focus',resume);};
 },[refresh]);
 async function command(input:unknown,message:string) {
  setBusy(true);setNotice('');
  try{const res=await fetch('/api/business',{method:'POST',headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify(input)});const body=await res.json();if(!res.ok)throw new Error(body.error||'Unable to save reminder');await refresh();setNotice(message);return true;}catch(e){setError(e instanceof Error?e.message:'Unable to save reminder');return false;}finally{setBusy(false);}
 }
 async function addReminder(e:FormEvent<HTMLFormElement>) {
  e.preventDefault();const form=e.currentTarget;const fields=new FormData(form);const local=String(fields.get('dueAt')||'');
  const title=String(fields.get('title')||'').trim();if(!title)return;
  const due=local?new Date(local):null;if(due&&Number.isNaN(due.getTime())){setError('Enter a valid reminder date');return;}
  if(await command({action:'reminder',data:{title,dueAt:due?.toISOString()??null}},'Reminder saved. It will remain here until completed.'))form.reset();
 }
 const unknown=data&&Object.values(data.sources).some(s=>s!=='available');
 return <div className="mb-console mb-mission"><header className="mb-heading"><div><span className="mb-eyebrow">FOUNDER HQ / OBSERVE · REVIEW · ACT</span><h1>Mission Control</h1><p>Your orders, money, conversations and stock. One operational view.</p></div><div className="mb-live-state"><span className={`mb-badge ${error?'mb-state-warning':''}`}><span className="mb-dot"/>{error?'UPDATE FAILED':refreshing?'UPDATING':'AUTO-REFRESH · 20s'}</span><small>{data?`Last received ${date(data.asOf)}`:'Waiting for local status'}</small><button aria-label="Refresh mission status" onClick={()=>refresh().catch(e=>setError(e.message))}><RefreshCw size={13}/></button></div></header>
 {error&&<div role="alert" className="mb-alert">{error}{data&&' · Showing the last received snapshot. Its timestamp has not changed.'}</div>}{notice&&<div role="status" className="mb-notice"><Check size={14}/>{notice}</div>}
 {!data?<div className="mb-panel mb-empty">{error?'Status unavailable. Retry to reconnect.':'Reading business records, tasks and connector status…'}</div>:<>
 {unknown&&<div className="mb-notice">Some sources are unavailable or excluded because inherited preview mode is on. No sample tasks or connector counts are used here.</div>}
 <div className="mb-stats mb-mission-stats">{[
 {title:'Needs approval',value:data.counters.awaitingApproval,note:`${data.counters.expiredApprovals} expired drafts`,href:'/business?view=orders',icon:ShieldCheck},
 {title:'Payment pending',value:amount(data.counters.paymentPendingMinor),note:`${data.counters.paymentPending} invoices · not settlement`,href:'/business?view=invoices',icon:Wallet},
 {title:'To do',value:data.counters.openTodos,note:`${data.counters.overdue} overdue · ${data.counters.blockedTasks} blocked tasks`,href:'#mission-todo',icon:ListTodo},
 {title:'Out of stock',value:data.counters.outOfStock,note:`${data.counters.products} catalog products`,href:'/business?view=inventory',icon:Package},
 ].map(s=><Link className="mb-stat-link" key={s.title} href={s.href}><span><s.icon size={14}/>{s.title}<ArrowUpRight size={12}/></span><strong>{s.value}</strong><small>{s.note}</small></Link>)}</div>
 <div className="mb-daily-launchers">{WORKSPACE_CATEGORIES.filter(c=>c.cadence==='Daily').map(c=><Link key={c.id} href={`/workspace/${c.id}`}><c.icon size={15}/><span>{c.label}</span><ArrowUpRight size={12}/></Link>)}</div>
 <div className="mb-mission-hero"><MissionGraph graph={data.graph}/><div><section className="mb-panel mb-attention"><div className="mb-panel-head"><h2>Attention desk</h2><span className="mb-badge">OBSERVED BUSINESS STATE</span></div>{!data.approvals.length&&!data.stockouts.length&&!data.counters.paymentPending?<p className="mb-empty">No pending approvals, unpaid invoices or stockouts in the current records.</p>:<>
 {data.approvals.map(a=><Link href="/business?view=orders" className="mb-row" key={a.id}><div><strong>{a.customer}</strong><small>{a.expired?'Approval expired · create a fresh draft':`Review before ${date(a.expiresAt)}`}</small></div><span>{amount(a.total)} <ArrowUpRight size={13}/></span></Link>)}
 {!!data.counters.paymentPending&&<Link className="mb-row" href="/business?view=invoices"><div><strong>{data.counters.paymentPending} invoices awaiting payment evidence</strong><small>Payment requests do not confirm receipt or settlement.</small></div><ArrowUpRight size={15}/></Link>}
 {data.stockouts.map(p=><Link key={p.id} className="mb-row" href="/business?view=inventory"><div><strong>{p.name}</strong><small>{p.sku} · zero units available</small></div><span className="mb-tool-status planned">Out of stock</span></Link>)}</>}
 </section></div></div><div className="mb-mission-columns"><div><section className="mb-panel" id="mission-todo"><div className="mb-panel-head"><h2>To do & reminders</h2><Link className="mb-link" href="/tasks">Full task board <ArrowUpRight size={12}/></Link></div><form className="mb-reminder-form" onSubmit={addReminder}><label>Reminder<input name="title" placeholder="Follow up on an invoice…" required maxLength={200}/></label><label>Due (your local time)<input name="dueAt" type="datetime-local"/></label><button className="mb-primary" disabled={busy}>Add reminder</button></form><p className="mb-muted">Reminders are stored locally and checked while this dashboard is open. No background push or email notification is claimed.</p>
 {!data.todo.length?<p className="mb-empty">Nothing scheduled yet. Add a reminder or create a task.</p>:data.todo.map(t=><div className="mb-row" key={`${t.kind}:${t.id}`}><div><strong>{t.title}</strong><small className={t.overdue?'mb-overdue':''}>{t.overdue?'Overdue · ':''}{t.dueAt?date(t.dueAt):'No due date'} · {t.kind} · {t.status}</small></div>{t.kind==='reminder'?<button aria-label={`Complete reminder: ${t.title}`} disabled={busy} onClick={()=>command({action:'completeReminder',id:t.id},'Reminder completed.')}><Check size={14}/></button>:<Link className="mb-link" href="/tasks">Open <ArrowUpRight size={12}/></Link>}</div>)}<small>{data.completedReminders} completed reminders · showing up to 30 open items</small>
 </section>
 </div><div>
 <section className="mb-panel"><div className="mb-panel-head"><h2>Connection status</h2><Link className="mb-link" href="/integrations">Set up <ArrowUpRight size={12}/></Link></div><p className="mb-muted">Inherited connector health, using its cached status. A connected source does not establish every read/write capability.</p>{data.sources.connections!=='available'?<p className="mb-empty">Connection status {data.sources.connections.replaceAll('_',' ')}.</p>:data.connections.length===0?<p className="mb-empty">No connector status available.</p>:<><div className="mb-connection-summary"><strong>{data.connections.filter(c=>c.state==='connected').length}/{data.connections.length}</strong><span>sources report connected</span></div><div className="mb-connection-list">{data.connections.map(c=><Link className="mb-row" href="/integrations" key={c.id} title={c.detail}><span>{c.name}</span><span className={`mb-tool-status ${c.state==='connected'?'available':c.state==='error'?'planned':'existing'}`}>{c.state.replaceAll('_',' ')}</span></Link>)}</div></>}</section>
 <section className="mb-panel"><div className="mb-panel-head"><h2>Recent activity</h2><span className="mb-badge">{data.auditValid?'CHAIN VERIFIED':'CHAIN INVALID'}</span></div>{!data.feed.length?<p className="mb-empty">Business actions will appear here.</p>:data.feed.map(a=><article className="mb-mission-event" key={a.seq}><span className="mb-event-number">{String(a.seq).padStart(3,'0')}</span><div><strong>{a.action}</strong><small>{date(a.createdAt)}</small><p>{a.detail}</p></div></article>)}<Link className="mb-link" href="/business?view=evidence">Inspect full evidence <ArrowUpRight size={12}/></Link></section>
 </div></div><footer className="mb-footer"><span>LOCAL BUSINESS DATA · {data.counters.issuedInvoices} issued invoices · {amount(data.counters.issuedMinor)} issued value, not settled revenue</span><Link href="/business?view=overview">Connected business graph <ArrowUpRight size={12}/></Link></footer>
 </>}
 </div>;
}
