'use client';
import React, { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { MissionGraph } from './MissionGraph';
import { LayoutEditor } from './MissionLayoutEditor';
import { DEFAULT_LAYOUT, type MissionWidget } from '@/lib/muzebos/mission-layout-client';
import { ArrowUpRight, Check, Clock3, ListTodo, Package, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';
import type { MissionSnapshot } from '@/lib/muzebos/mission';
import { WORKSPACE_CATEGORIES } from '@/lib/muzebos/navigation';
const amount=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(n/100);
const date=(s:string)=>new Date(s).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
export function MissionControl() {
 const [data,setData]=useState<MissionSnapshot|null>(null);const [error,setError]=useState('');const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);const [refreshing,setRefreshing]=useState(false);const [filter,setFilter]=useState<'all'|'today'|'overdue'>('all');const [tick,setTick]=useState(()=>Date.now());
 useEffect(()=>{const t=setInterval(()=>setTick(Date.now()),10000);return()=>clearInterval(t);},[]);
 const refresh=useCallback(async(signal?:AbortSignal)=>{
  const res=await fetch(`/api/mission-control?tz=${new Date().getTimezoneOffset()}`,{cache:'no-store',signal});const body=await res.json();
  if(!res.ok)throw new Error(body.error||'Unable to update mission status');setData(body);setError('');setTick(Date.now());
 },[]);
 useEffect(()=>{
  const controller=new AbortController();let inFlight=false;
  const update=async()=>{if(inFlight||controller.signal.aborted)return;inFlight=true;setRefreshing(true);try{await refresh(controller.signal);}catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Update failed');}finally{inFlight=false;if(!controller.signal.aborted)setRefreshing(false);}};
  void update();const interval=setInterval(()=>{if(document.visibilityState==='visible')void update();},20000);
  const resume=()=>{if(document.visibilityState==='visible')void update();};document.addEventListener('visibilitychange',resume);window.addEventListener('focus',resume);
  return()=>{controller.abort();clearInterval(interval);document.removeEventListener('visibilitychange',resume);window.removeEventListener('focus',resume);};
 },[refresh]);
 const [layout,setLayout]=useState<MissionWidget[]>(DEFAULT_LAYOUT);const [layoutDefault,setLayoutDefault]=useState(true);
 useEffect(()=>{fetch('/api/mission-control/layout',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(new Error('Layout unavailable'))).then(j=>{setLayout(j.widgets);setLayoutDefault(j.isDefault);}).catch(()=>setNotice('Saved layout unavailable; showing the default.'));},[]);
 async function layoutCommand(body:unknown,message:string){setBusy(true);setError('');try{const r=await fetch('/api/mission-control/layout',{method:'POST',headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw new Error(j.error||'Layout not saved');setLayout(j.widgets);setLayoutDefault(j.isDefault);setNotice(message);}catch(e){setError(e instanceof Error?e.message:'Layout not saved');}finally{setBusy(false);}}
 const saveWidgets=(w:MissionWidget[])=>layoutCommand({action:'save',widgets:w},'Layout saved.');
 const resetWidgets=()=>layoutCommand({action:'reset'},'Default layout restored.');
 async function command(input:unknown,message:string) {
  setBusy(true);setNotice('');
  try{const res=await fetch('/api/business',{method:'POST',headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify(input)});const body=await res.json();if(!res.ok)throw new Error(body.error||'Unable to save reminder');await refresh();setNotice(message);return true;}catch(e){setError(e instanceof Error?e.message:'Unable to save reminder');return false;}finally{setBusy(false);}
 }
 async function addReminder(e:FormEvent<HTMLFormElement>) {
  e.preventDefault();const form=e.currentTarget;const fields=new FormData(form);const local=String(fields.get('dueAt')||'');
  const title=String(fields.get('title')||'').trim();if(!title)return;
  const due=local?new Date(local):null;if(due&&Number.isNaN(due.getTime())){setError('Enter a valid reminder date');return;}
  const linkRaw=String(fields.get('link')||'');const [kind,id]=linkRaw.split(':');const link=kind&&id?{kind,id}:null;
  if(await command({action:'reminder',data:{title,dueAt:due?.toISOString()??null,link}},'Reminder saved. It will remain here until completed.'))form.reset();
 }
 const stale=!!data&&tick-Date.parse(data.asOf)>60_000;
 const shown=data?data.todo.filter(t=>filter==='all'||(filter==='overdue'?t.overdue:t.dueToday)):[];
 const unknown=data&&Object.values(data.sources).some(s=>s!=='available');
 return <div className="mb-console mb-mission"><header className="mb-heading"><div><span className="mb-eyebrow">FOUNDER HQ / OBSERVE · REVIEW · ACT</span><h1>Mission Control</h1><p>Your orders, money, conversations and stock. One operational view.</p></div><div className="mb-live-state"><span className={`mb-badge ${error?'mb-state-warning':''}`}><span className="mb-dot"/>{error?'UPDATE FAILED':stale?'STALE':refreshing?'UPDATING':'AUTO-REFRESH · 20s'}</span><small>{data?`Last received ${date(data.asOf)}`:'Waiting for local status'}</small><button aria-label="Refresh mission status" onClick={()=>refresh().catch(e=>setError(e.message))}><RefreshCw size={13}/></button></div></header>
 {stale&&!error&&<div role="alert" className="mb-alert" data-stale>Data is stale: last received {date(data!.asOf)}. Refresh to update.</div>}{error&&<div role="alert" className="mb-alert">{error}{data&&' · Showing the last received snapshot. Its timestamp has not changed.'}</div>}{notice&&<div role="status" className="mb-notice"><Check size={14}/>{notice}</div>}
 {!data?<div className="mb-panel mb-empty">{error?'Status unavailable. Retry to reconnect.':'Reading business records, tasks and connector status…'}</div>:<>
 {unknown&&<div className="mb-notice">Some sources are unavailable or excluded because inherited preview mode is on. No sample tasks or connector counts are used here.</div>}
{(()=>{const W:Record<MissionWidget,React.ReactNode>={
stats:<> <div className="mb-stats mb-mission-stats">{[
 {title:'Needs approval',value:data.counters.awaitingApproval,note:`${data.counters.expiredApprovals} expired drafts`,href:'/business?view=orders',icon:ShieldCheck},
 {title:'Outstanding invoices',value:amount(data.counters.paymentPendingMinor),note:`${data.counters.paymentPending} issued, unpaid · requests not tracked`,href:'/business?view=invoices',icon:Wallet},
 {title:'Settled (manual)',value:amount(data.counters.settledMinor),note:`${data.counters.settled} reconciled by operator · not provider-verified`,href:'/business?view=invoices',icon:Check},
 {title:'To do',value:data.counters.openTodos,note:`${data.counters.dueToday} due today · ${data.counters.overdue} overdue · ${data.counters.openTasks} tasks`,href:'#mission-todo',icon:ListTodo},
 {title:'Low stock',value:data.counters.lowStock+data.counters.outOfStock,note:`${data.counters.outOfStock} out · ${data.counters.lowStock} at or below ${data.counters.lowStockUnits} units`,href:'/business?view=inventory',icon:Package},
 ].map(s=><Link className="mb-stat-link" key={s.title} href={s.href}><span><s.icon size={14}/>{s.title}<ArrowUpRight size={12}/></span><strong>{s.value}</strong><small>{s.note}</small></Link>)}</div></>,
launchers:<> <div className="mb-daily-launchers">{WORKSPACE_CATEGORIES.filter(c=>c.cadence==='Daily').map(c=><Link key={c.id} href={`/workspace/${c.id}`}><c.icon size={15}/><span>{c.label}</span><ArrowUpRight size={12}/></Link>)}</div></>,
graph:<MissionGraph graph={data.graph}/>,
attention:<> <section className="mb-panel mb-attention"><div className="mb-panel-head"><h2>Attention desk</h2><span className="mb-badge">OBSERVED BUSINESS STATE</span></div>{!data.approvals.length&&!data.stockouts.length&&!data.lowStock.length&&!data.counters.paymentPending?<p className="mb-empty">No pending approvals, unpaid invoices or stockouts in the current records.</p>:<>
 {data.approvals.map(a=><Link href="/business?view=orders" className="mb-row" key={a.id}><div><strong>{a.customer}</strong><small>{a.expired?'Approval expired · create a fresh draft':`Review before ${date(a.expiresAt)}`}</small></div><span>{amount(a.total)} <ArrowUpRight size={13}/></span></Link>)}
 {!!data.counters.paymentPending&&<Link className="mb-row" href="/business?view=invoices"><div><strong>{data.counters.paymentPending} invoices awaiting payment evidence</strong><small>Payment requests do not confirm receipt or settlement.</small></div><ArrowUpRight size={15}/></Link>}
 {data.lowStock.map(p=><Link key={p.id} className="mb-row" href="/business?view=inventory"><div><strong>{p.name}</strong><small>{p.sku} · {p.stock} units left</small></div><span className="mb-tool-status existing">Low stock</span></Link>)}{data.stockouts.map(p=><Link key={p.id} className="mb-row" href="/business?view=inventory"><div><strong>{p.name}</strong><small>{p.sku} · zero units available</small></div><span className="mb-tool-status planned">Out of stock</span></Link>)}</>}
 </section></>,
todo:<><section className="mb-panel" id="mission-todo"><div className="mb-panel-head"><h2>To do & reminders</h2><Link className="mb-link" href="/tasks">Full task board <ArrowUpRight size={12}/></Link></div><form className="mb-reminder-form" onSubmit={addReminder}><label>Reminder<input name="title" placeholder="Follow up on an invoice…" required maxLength={200}/></label><label>Due (your local time)<input name="dueAt" type="datetime-local"/></label><label>Linked record<select name="link" defaultValue=""><option value="">None</option>{data.linkOptions.map(o=><option key={o.id} value={`${o.kind}:${o.id}`}>{o.kind}: {o.label}</option>)}</select></label><button className="mb-primary" disabled={busy}>Add reminder</button></form><p className="mb-muted">Reminders are stored locally and checked while this dashboard is open. No background push or email notification is claimed.</p>
 <div className="mb-filter" role="group" aria-label="Filter to do">{(['all','today','overdue'] as const).map(f=><button key={f} aria-pressed={filter===f} onClick={()=>setFilter(f)}>{f==='all'?'All':f==='today'?'Due today':'Overdue'}</button>)}</div>
 {!shown.length?<p className="mb-empty">{filter==='all'?'Nothing scheduled yet. Add a reminder or create a task.':filter==='overdue'?'Nothing overdue.':'Nothing due today.'}</p>:shown.map(t=><div className="mb-row" key={`${t.kind}:${t.id}`}><div><strong>{t.title}</strong><small className={t.overdue?'mb-overdue':''}>{t.overdue?'Overdue · ':''}{t.dueAt?date(t.dueAt):'No due date'} · {t.kind} · {t.status}{t.link&&<> · <Link className="mb-link" href={t.link.href}>{t.link.kind}: {t.link.label}</Link></>}</small></div>{t.kind==='reminder'?<button aria-label={`Complete reminder: ${t.title}`} disabled={busy} onClick={()=>command({action:'completeReminder',id:t.id},'Reminder completed.')}><Check size={14}/></button>:<Link className="mb-link" href="/tasks">Open <ArrowUpRight size={12}/></Link>}</div>)}<small>{data.completedReminders} completed reminders · showing up to 30 open items</small>{!!data.completed.length&&<details className="mb-completed"><summary>Recently completed</summary>{data.completed.map(r=><div className="mb-row" key={r.id}><div><strong>{r.title}</strong><small>Done {r.completedAt?date(r.completedAt):''}</small></div><button aria-label={`Reopen reminder: ${r.title}`} disabled={busy} onClick={()=>command({action:'reopenReminder',id:r.id},'Reminder reopened.')}>Reopen</button></div>)}</details>}
 </section></>,
connections:<> <section className="mb-panel"><div className="mb-panel-head"><h2>Connection status</h2><Link className="mb-link" href="/integrations">Set up <ArrowUpRight size={12}/></Link></div><p className="mb-muted">Checked {date(data.connectionsCheckedAt)}. Inherited connector health, using its cached status. A connected source does not establish every read/write capability.</p>{data.sources.connections!=='available'?<p className="mb-empty">Connection status {data.sources.connections.replaceAll('_',' ')}.</p>:data.connections.length===0?<p className="mb-empty">No connector status available.</p>:<><div className="mb-connection-summary"><strong>{data.connections.filter(c=>c.state==='connected').length}/{data.connections.length}</strong><span>sources report connected</span></div><div className="mb-connection-list">{data.connections.map(c=><Link className="mb-row" href="/integrations" key={c.id} title={c.detail}><span>{c.name}</span><span className={`mb-tool-status ${c.state==='connected'?'available':c.state==='error'?'planned':'existing'}`}>{c.state.replaceAll('_',' ')}</span></Link>)}</div></>}</section></>,
activity:<> <section className="mb-panel"><div className="mb-panel-head"><h2>Recent activity</h2><span className="mb-badge">{data.auditValid?'CHAIN VERIFIED':'CHAIN INVALID'}</span></div>{!data.feed.length?<p className="mb-empty">Business actions will appear here.</p>:data.feed.map(a=><article className="mb-mission-event" key={a.seq}><span className="mb-event-number">{String(a.seq).padStart(3,'0')}</span><div>{a.href?<Link className="mb-link" href={a.href}><strong>{a.action}</strong></Link>:<strong>{a.action}</strong>}<small>{date(a.createdAt)}</small><p>{a.detail}</p></div></article>)}<Link className="mb-link" href="/business?view=evidence">Inspect full evidence <ArrowUpRight size={12}/></Link></section></>,
};return <div className="mb-mission-widgets">{layout.map(w=><div key={w} data-widget={w}>{W[w]}</div>)}</div>;})()}
<LayoutEditor layout={layout} isDefault={layoutDefault} busy={busy} onSave={saveWidgets} onReset={resetWidgets}/>
 <footer className="mb-footer"><span>LOCAL BUSINESS DATA · {data.counters.issuedInvoices} issued invoices · {amount(data.counters.issuedMinor)} issued value, not settled revenue</span><Link href="/business?view=overview">Connected business graph <ArrowUpRight size={12}/></Link></footer>
 </>}
 </div>;
}
