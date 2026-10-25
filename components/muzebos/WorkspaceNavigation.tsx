'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MAIN_ENTRIES, PINNED_ENTRIES, workspaceActive, type MainEntry } from '@/lib/muzebos/navigation';
export function WorkspaceNavigation() {
 const active=workspaceActive(usePathname());
 const render=(entry:MainEntry)=><Link key={entry.id} href={entry.href} title={entry.label} aria-current={active===entry.id?'page':undefined} data-workspace-entry={entry.id} className="os-nav-link mb-side-link"><entry.icon className="os-nav-icon h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden/><span className="os-nav-label truncate">{entry.label}</span></Link>;
 return <div className="mb-sidebar-menu"><nav className="os-nav mb-main-nav" aria-label="Founder workspace"><div className="os-nav-list">{['Command','Daily','Weekly','Setup','Review'].map(c=><div key={c} className="os-nav-group"><div className="os-nav-group-title" aria-hidden>{c==='Setup'?'Monthly / setup':c}</div>{MAIN_ENTRIES.filter(e=>e.cadence===c).map(render)}</div>)}</div></nav><nav className="mb-pinned-nav" aria-label="Pinned utilities"><span className="os-nav-group-title" aria-hidden>Always here</span>{PINNED_ENTRIES.map(render)}</nav></div>;
}
