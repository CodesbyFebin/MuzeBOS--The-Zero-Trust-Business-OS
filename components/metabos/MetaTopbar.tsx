'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Search } from 'lucide-react';
import { NotificationsMenu, ProfileMenu, PageDetailDrawer, MobileTabBar } from '@/components/metabos/ShellExtras';
import { breadcrumbs, resolveMenu, featureByRoute } from '@/lib/metabos/registry';
import { StatusBadge } from '@/components/metabos/StatusBadge';

/** MeTaBos top bar: page title, registry breadcrumb, search (⌘K), notifications and founder profile. */
export function MetaTopbar({ onSearch }: { onSearch: () => void }) {
  const pathname = usePathname() || '/';
  const crumbs = breadcrumbs(pathname);
  const feature = featureByRoute(pathname.split(/[?#]/)[0]);
  const title = feature?.label ?? resolveMenu(pathname)?.label ?? crumbs[crumbs.length - 1]?.label;
  const toggleDrawer = () => {
    const el = document.documentElement;
    if (el.getAttribute('data-mb-drawer') === 'open') el.removeAttribute('data-mb-drawer'); else el.setAttribute('data-mb-drawer', 'open');
  };
  return (
    <header className="os-topbar mb-topbar" data-mb-topbar>
      <button type="button" className="mb-icon-btn mb-drawer-btn" onClick={toggleDrawer} aria-label="Open navigation" aria-controls="os-sidebar"><Menu size={16} aria-hidden /></button>
      <div className="mb-topbar-title">
        <nav aria-label="Breadcrumb"><ol className="mb-crumbs">{crumbs.map((c, i) => <li key={i}>{c.href ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}</li>)}</ol></nav>
        <div className="mb-page-title"><strong>{title}</strong>{feature && feature.route !== '/' && <StatusBadge status={feature.status} />}</div>
      </div>
      <div className="mb-topbar-actions">
        <button type="button" className="mb-search-btn" onClick={onSearch} aria-label="Search pages and commands (Ctrl+K)"><Search size={14} aria-hidden /><span>Search</span><kbd>⌘K</kbd></button>
        <PageDetailDrawer />
        <NotificationsMenu />
        <ProfileMenu />
      </div>
      <MobileTabBar />
    </header>
  );
}
