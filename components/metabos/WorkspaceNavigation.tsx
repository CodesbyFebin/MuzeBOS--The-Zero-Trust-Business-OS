'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { SCROLL_MENUS, PINNED_MENUS, resolveMenu, menuById, type MenuDefinition } from '@/lib/metabos/registry';
import { StatusDot } from '@/components/metabos/StatusBadge';

/** Registry-driven shell navigation: an 18-item rail (14–18 pinned) plus the selected menu's secondary panel. */
export function WorkspaceNavigation() {
  const pathname = usePathname() || '/';
  const active = resolveMenu(pathname);
  const [panelOpen, setPanelOpen] = useState(true);
  // close the mobile drawer whenever the route changes
  useEffect(() => { document.documentElement.removeAttribute('data-mb-drawer'); }, [pathname]);
  const shown: MenuDefinition | undefined = active ?? menuById('mission');
  const rail = (m: MenuDefinition) => (
    <Link key={m.id} href={m.route} title={`${String(m.number).padStart(2, '0')} ${m.label}`} aria-label={m.label}
      aria-current={active?.id === m.id ? 'page' : undefined} data-workspace-entry={m.id} className="os-nav-link mb-side-link mb-rail-link">
      <m.icon className="os-nav-icon h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
      <span className="mb-rail-label">{m.label}</span>
    </Link>
  );
  return (
    <div className="mb-sidebar-menu mb-shell-nav" data-panel={panelOpen ? 'open' : 'closed'}>
      <div className="mb-rail">
        <nav className="os-nav mb-main-nav" aria-label="Main destinations"><div className="os-nav-list">{SCROLL_MENUS.map(rail)}</div></nav>
        <nav className="mb-pinned-nav" aria-label="Pinned utilities">{PINNED_MENUS.map(rail)}</nav>
      </div>
      {shown && panelOpen && (
        <nav className="mb-secondary" aria-label={`${shown.label} pages`} key={shown.id}>
          <div className="mb-secondary-head">
            <Link href={shown.route} className="mb-secondary-title">{shown.label}</Link>
            <button type="button" className="mb-icon-btn" onClick={() => setPanelOpen(false)} aria-label="Collapse secondary panel" title="Collapse panel"><PanelLeftClose size={14} aria-hidden /></button>
          </div>
          <p className="mb-secondary-summary">{shown.summary}</p>
          {shown.clusters.map((c, i) => {
            const here = c.pages.some((p) => p.route === pathname);
            return (
              <details key={c.id} id={`nav-${c.id}`} open={shown.id === 'brain' || here || i === 0} className="mb-cluster">
                <summary>{c.label} <span className="mb-count">{c.pages.length}</span></summary>
                <ul>
                  {c.pages.map((p) => (
                    <li key={p.id}>
                      <Link href={p.route} aria-current={p.route === pathname ? 'page' : undefined} className="mb-secondary-link">
                        <StatusDot status={p.status} /><span>{p.label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </nav>
      )}
      {!panelOpen && (
        <button type="button" className="mb-icon-btn mb-panel-reopen" onClick={() => setPanelOpen(true)} aria-label="Expand secondary panel" title="Expand panel"><PanelLeftOpen size={14} aria-hidden /></button>
      )}
    </div>
  );
}
