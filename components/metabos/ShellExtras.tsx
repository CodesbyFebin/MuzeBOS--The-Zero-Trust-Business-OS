'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Brain, Home, Info, LayoutGrid, Package, UserCircle, Wallet, X } from 'lucide-react';
import { featureByRoute, resolveMenu } from '@/lib/metabos/registry';
import { StatusBadge } from '@/components/metabos/StatusBadge';
import { useMe } from '@/components/metabos/bizClient';

/** Renders into <body> so fixed positioning is not trapped by the blurred top bar or transformed drawer. */
function Portal({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready ? createPortal(children, document.body) : null;
}

function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, close]);
  return ref;
}

type Finding = { invoiceId: string; number: string; customerName: string; amountText: string; daysOverdue: number };
type NotifState = { kind: 'loading' } | { kind: 'denied'; reason: string } | { kind: 'ok'; items: Finding[] };

/** Notifications: real overdue-invoice findings from /api/metabos/overdue (finance.read). No sample items. */
export function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<NotifState>({ kind: 'loading' });
  const ref = useOutside(open, () => setOpen(false));
  useEffect(() => {
    let live = true;
    fetch('/api/metabos/overdue').then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!live) return;
      if (!r.ok) setState({ kind: 'denied', reason: r.status === 401 ? 'Sign in to see attention items.' : r.status === 403 ? 'Your role cannot read finance items.' : 'Attention items unavailable.' });
      else setState({ kind: 'ok', items: (j.findings ?? []) as Finding[] });
    }).catch(() => live && setState({ kind: 'denied', reason: 'Attention items unavailable.' }));
    return () => { live = false; };
  }, []);
  const count = state.kind === 'ok' ? state.items.length : 0;
  return (
    <div className="mb-pop-wrap" ref={ref}>
      <button type="button" className="mb-icon-btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        aria-label={count ? `Notifications: ${count} overdue invoice${count === 1 ? '' : 's'}` : 'Notifications'} data-testid="notifications-btn">
        <Bell size={15} aria-hidden />{count > 0 && <span className="mb-badge-dot" aria-hidden>{count > 99 ? '99+' : count}</span>}
      </button>
      {open && (
        <div className="mb-pop" role="dialog" aria-label="Notifications" data-testid="notifications-panel">
          <div className="mb-pop-head">Attention</div>
          {state.kind === 'loading' && <p className="mb-muted">Loading…</p>}
          {state.kind === 'denied' && <p className="mb-muted">{state.reason}</p>}
          {state.kind === 'ok' && (state.items.length === 0 ? <p className="mb-muted">No records yet</p> : (
            <ul className="mb-pop-list">{state.items.slice(0, 8).map((f) => (
              <li key={f.invoiceId}><Link href="/workspace/money/overdue" onClick={() => setOpen(false)}>
                <strong>Invoice {f.number} overdue {f.daysOverdue}d</strong><span>{f.customerName} · {f.amountText}</span></Link></li>
            ))}</ul>
          ))}
        </div>
      )}
    </div>
  );
}

/** Profile: the server-checked signed-in member, or a sign-in link. */
export function ProfileMenu() {
  const me = useMe();
  const [open, setOpen] = useState(false);
  const ref = useOutside(open, () => setOpen(false));
  return (
    <div className="mb-pop-wrap" ref={ref}>
      <button type="button" className="mb-icon-btn mb-avatar" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)} aria-label="Profile and account" data-testid="profile-btn">
        {me ? <span aria-hidden>{me.name.trim().slice(0, 1).toUpperCase()}</span> : <UserCircle size={16} aria-hidden />}
      </button>
      {open && (
        <div className="mb-pop mb-pop-narrow" role="dialog" aria-label="Profile">
          {me === undefined ? <p className="mb-muted">Loading…</p> : me ? (
            <><div className="mb-pop-head">{me.name}</div><p className="mb-muted">{me.role} · {me.department}</p></>
          ) : <p className="mb-muted">Not signed in.</p>}
          <Link href={me ? '/workspace/account' : '/workspace/account/sign-in'} className="mb-pop-link" onClick={() => setOpen(false)}>{me ? 'Account' : 'Sign in'}</Link>
        </div>
      )}
    </div>
  );
}

/** Detail drawer: the current page's registry contract (status, permission, dependencies, evidence). */
export function PageDetailDrawer() {
  const pathname = (usePathname() || '/').split(/[?#]/)[0];
  const feature = featureByRoute(pathname);
  const menu = resolveMenu(pathname);
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k);
  }, [open]);
  if (!feature && !menu) return null;
  return (
    <>
      <button type="button" className="mb-icon-btn" onClick={() => setOpen(true)} aria-label="Page details" aria-expanded={open} aria-controls="mb-detail-drawer" data-testid="details-btn"><Info size={15} aria-hidden /></button>
      <Portal>
        <div className={`mb-drawer-overlay${open ? ' open' : ''}`} onClick={() => setOpen(false)} aria-hidden />
        <aside id="mb-detail-drawer" className={`mb-detail-drawer${open ? ' open' : ''}`} role="dialog" aria-modal="true" aria-label="Page details" aria-hidden={!open}>
          <div className="mb-dr-head"><h2>{feature?.label ?? menu?.label}</h2><button type="button" className="mb-icon-btn" onClick={() => setOpen(false)} aria-label="Close details"><X size={15} aria-hidden /></button></div>
          {feature ? (
            <dl className="mb-dr-list">
              <dt>Status</dt><dd><StatusBadge status={feature.status} /></dd>
              <dt>Menu</dt><dd>{menu?.label ?? '—'}</dd>
              <dt>Route</dt><dd><code>{feature.route}</code></dd>
              {feature.description && (<><dt>About</dt><dd>{feature.description}</dd></>)}
              <dt>Permission</dt><dd>{(feature.requiredPermissions ?? []).join(', ') || 'member'}</dd>
              <dt>Dependencies</dt><dd>{feature.dependencies.length ? feature.dependencies.join('; ') : 'None recorded'}</dd>
              <dt>Verification</dt><dd>{feature.verificationEvidence?.length ? <ul>{feature.verificationEvidence.map((v) => <li key={v}><code>{v}</code></li>)}</ul> : 'No verification evidence recorded'}</dd>
            </dl>
          ) : <p className="mb-muted">{menu?.summary}</p>}
        </aside>
      </Portal>
    </>
  );
}

const TABS = [
  { href: '/', label: 'Home', icon: Home, menu: 'mission' },
  { href: '/workspace/brain', label: 'Brain', icon: Brain, menu: 'brain' },
  { href: '/workspace/orders', label: 'Orders', icon: Package, menu: 'orders' },
  { href: '/workspace/money', label: 'Money', icon: Wallet, menu: 'money' },
] as const;

/** Mobile bottom tabs (62px + safe area). "More" opens the full 18-destination drawer. */
export function MobileTabBar() {
  const pathname = usePathname() || '/';
  const active = resolveMenu(pathname)?.id;
  const openMore = () => document.documentElement.setAttribute('data-mb-drawer', 'open');
  return (
    <Portal>
      <nav className="mb-tabbar" aria-label="Primary mobile tabs" data-testid="mobile-tabbar">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className="mb-tab" aria-current={active === t.menu ? 'page' : undefined}><t.icon size={20} aria-hidden /><span>{t.label}</span></Link>
        ))}
        <button type="button" className="mb-tab" onClick={openMore} aria-label="More destinations" aria-controls="os-sidebar"><LayoutGrid size={20} aria-hidden /><span>More</span></button>
      </nav>
    </Portal>
  );
}
