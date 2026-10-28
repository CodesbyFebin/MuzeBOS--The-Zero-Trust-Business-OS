'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Search } from 'lucide-react';
import { WORKSPACE_CATEGORIES, PINNED_UTILITIES } from '@/lib/metabos/navigation';
import { menuById, statusCounts, FEATURE_STATUSES, STATUS_LABEL, type FeatureStatus } from '@/lib/metabos/registry';
import { StatusBadge } from '@/components/metabos/StatusBadge';
import { HubOverview } from '@/components/metabos/HubOverview';
import { HubKpis } from '@/components/metabos/HubKpis';
export function CategoryWorkspace({section}:{section:string}) {
 const category=WORKSPACE_CATEGORIES.find(c=>c.id===section);
 const utility=PINNED_UTILITIES.find(p=>p.key===section);
 if(section==='evidence')return <div className="mb-console mb-category"><div className="mb-eyebrow">VERIFICATION / LOCAL BUSINESS RECORDS</div><h1>Evidence & audit</h1><p className="mb-muted">Inspect commerce actions, payload hashes, inventory issuance and manual payment references.</p><Link className="mb-primary mb-button" href="/business?view=evidence">Open business evidence <ArrowUpRight size={14}/></Link><div className="mb-panel"><h2>What the ledger proves</h2><p className="mb-muted">The local hash chain is tamper-evident. It has no independent external anchor. Passkey signatures, live Meta inference and provider-verified payment evidence remain unimplemented.</p></div></div>;
 if(utility)return <div className="mb-console mb-category"><div className="mb-eyebrow">PINNED / {utility.id}</div><h1>{utility.label}</h1><p className="mb-muted">{utility.summary}</p><div className="mb-tool-grid">{utility.links.map(l=><Link className="mb-panel mb-utility-link" key={l.href} href={l.href}>{l.label}<ArrowUpRight size={16}/></Link>)}</div>{section==='developer'&&<section className="mb-panel"><h2>Current commerce API</h2><p className="mb-muted">GET /api/business reads records. POST /api/business accepts validated commands, operator authentication when configured, a same-origin request, and a UUID Idempotency-Key. API secrets belong on the server.</p><p className="mb-muted">Commands: customer, product, draft, approve, issue, reject, reconcile, configure, reminder, completeReminder. There is no automatic UTR or IMAP settlement verifier.</p></section>}{section==='support'&&<section className="mb-panel"><h2>Quick start</h2><ol className="mb-help-list"><li>Set your operator password in Settings.</li><li>Add customers and catalog items under Orders & CRM and Stock.</li><li>Create an order draft and review its exact totals.</li><li>Approve issuance, then inspect its evidence.</li><li>Use Mission Control to track due reminders and pending work.</li></ol></section>}{section==='upgrade'&&<section className="mb-panel"><h2>Core access</h2><p className="mb-muted">No core feature is locked by an upgrade screen in this build. Paid cloud subscriptions and add-on billing have not been implemented. External services can charge independently.</p></section>}</div>;
 if(!category)return null;
 return <CategoryDirectory section={section}/>;
}

/** Registry-driven directory for one category: clusters, honest status badges and dependencies. */
export function CategoryDirectory({section}:{section:string}) {
 const [query,setQuery]=useState('');
 const [status,setStatus]=useState<FeatureStatus|'all'>('all');
 const menu=menuById(section);const category=WORKSPACE_CATEGORIES.find(c=>c.id===section);
 if(!menu||!category)return null;
 const all=menu.clusters.flatMap(c=>c.pages);const counts=statusCounts(all);
 const q=query.trim().toLowerCase();
 const match=(p:typeof all[number])=>(status==='all'||p.status===status)&&(!q||`${p.pillar??''} ${p.label} ${p.summary}`.toLowerCase().includes(q));
 const shown=menu.clusters.map(c=>({...c,pages:c.pages.filter(match)})).filter(c=>c.pages.length);
 const v3=section==='orders'||section==='money'||section==='talk';
 return <div className={`mb-console mb-category${v3?' mb-v3':''}`} data-design={v3?'v3':undefined}><header className="mb-heading"><div><span className="mb-eyebrow">{String(menu.number).padStart(2,'0')} / {category.code} / {category.cadence.toUpperCase()} WORKSPACE</span><h1>{category.title}</h1><p>{category.summary}</p></div><span className="mb-badge">PILLARS {category.first}–{category.first+19}</span></header>
 <section className="mb-panel mb-source-shortcuts"><Link href="/workspace/system/sources">Source integration catalog</Link>{section==='brain'&&<><Link href="/workspace/brain/inference">Inference & agent workspace</Link><Link href="/workspace/brain/runtime">Interactive AI runtime</Link><Link href="/workspace/brain/employees">AI employees & founder prompts</Link><Link href="/workspace/brain/security">Agent permission review</Link></>}{section==='orders'&&<Link href="/workspace/orders/bookings">Bookings & appointments</Link>}</section>
 {v3&&<HubKpis hub={section as 'orders'|'money'|'talk'}/>}
 {['money','growth','brain'].includes(section)&&<HubOverview hub={section}/>}
 <section className="mb-status-summary" aria-label="Status summary">{FEATURE_STATUSES.map(s=><span key={s}><StatusBadge status={s}/> {counts[s]}</span>)}</section>
 <div className="mb-category-toolbar"><label className="mb-search"><span className="sr-only">Search {menu.label} pages</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a page or pillar…"/></label><label className="mb-filter"><span className="sr-only">Filter by status</span><select value={status} onChange={e=>setStatus(e.target.value as FeatureStatus|'all')}><option value="all">All statuses</option>{FEATURE_STATUSES.map(s=><option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></label></div>
 {shown.map(c=><section key={c.id} id={c.id} className="mb-cluster-section"><h2 className="mb-cluster-title">{c.label}</h2><div className="mb-tool-grid">{c.pages.map(t=><article className="mb-panel mb-tool-card" key={t.id}><div className="mb-panel-head"><span className="mb-eyebrow">{category.code}{t.pillar?` / ${t.pillar}`:''}</span><StatusBadge status={t.status}/></div><h2>{t.label}</h2><p className="mb-muted">{t.summary}</p>{t.dependencies.length>0&&<p className="mb-deps">Depends on: {t.dependencies.join(' · ')}</p>}{t.status==='available'||t.status==='existing'?<Link className="mb-link" href={t.route}>{t.status==='existing'?'Open existing screen':'Open tool'}<ArrowUpRight size={13}/></Link>:<Link className="mb-link mb-link-quiet" href={t.route}>{t.status==='blocked'?'Blocked · view dependencies':t.status==='needs-credentials'?'Needs credentials · open workspace':'Planned · no executable tool yet'}</Link>}</article>)}</div></section>)}
 {!shown.length&&<div className="mb-empty">No matching pages.</div>}<footer className="mb-footer">Pages are organized here without implying all roadmap features have shipped. Status comes from lib/metabos/registry.ts.</footer></div>;
}
