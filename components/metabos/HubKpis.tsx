'use client';
import { useEffect, useState } from 'react';
import { Inbox, MessageSquare, ShieldCheck, Users, Wallet, Check, Phone, Package } from 'lucide-react';
import { KpiCard } from './KpiCard';
const amount = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n / 100);
type Counters = Record<string, number | null>;
/** v3 KPI strip for the Orders, Money and Talk hubs. Every value comes from /api/mission-control or /api/talk (real SQLite); nothing is sampled. */
export function HubKpis({ hub }: { hub: 'orders' | 'money' | 'talk' }) {
  const [c, setC] = useState<Counters | null>(null); const [talk, setTalk] = useState<{ conversations: unknown[]; handoffs: { status?: string }[]; optOuts: unknown[] } | null>(null); const [err, setErr] = useState('');
  useEffect(() => {
    const ac = new AbortController();
    const url = hub === 'talk' ? '/api/talk' : `/api/mission-control?tz=${new Date().getTimezoneOffset()}`;
    fetch(url, { cache: 'no-store', signal: ac.signal }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Unavailable'); hub === 'talk' ? setTalk(j) : setC(j.counters); }).catch((e) => { if (!ac.signal.aborted) setErr(e instanceof Error ? e.message : 'Unavailable'); });
    return () => ac.abort();
  }, [hub]);
  if (err) return <p className="mb-notice" role="status" data-testid="hub-kpis-error">Live counts unavailable: {err}</p>;
  if (!c && !talk) return <p className="mb-muted" role="status">Reading business records…</p>;
  const n = (k: string) => (c?.[k] ?? 0) as number;
  const cards = hub === 'orders' ? [
    { label: 'Awaiting approval', value: n('awaitingApproval'), sub: `${n('expiredApprovals')} expired drafts`, href: '/business?view=orders', icon: ShieldCheck, tone: n('awaitingApproval') ? 'amber' : 'neutral' },
    { label: 'Customers', value: n('customers') || null, sub: 'Records in this workspace', href: '/business?view=customers', icon: Users, tone: 'neutral' },
    { label: 'Products', value: n('products') || null, sub: `${n('outOfStock')} out of stock`, href: '/business?view=inventory', icon: Package, tone: n('outOfStock') ? 'red' : 'neutral' },
  ] : hub === 'money' ? [
    { label: 'Outstanding invoices', value: n('paymentPending') ? amount(n('paymentPendingMinor')) : null, sub: `${n('paymentPending')} issued, unpaid`, href: '/business?view=invoices', icon: Wallet, tone: n('paymentPending') ? 'amber' : 'neutral' },
    { label: 'Settled (manual)', value: n('settled') ? amount(n('settledMinor')) : null, sub: 'Operator-reconciled, not provider-verified', href: '/business?view=invoices', icon: Check, tone: n('settled') ? 'green' : 'neutral' },
    { label: 'Issued value', value: n('issuedInvoices') ? amount(n('issuedMinor')) : null, sub: `${n('issuedInvoices')} invoices · not settled revenue`, href: '/business?view=invoices', icon: Inbox, tone: 'neutral' },
  ] : [
    { label: 'Conversations', value: talk!.conversations.length || null, sub: 'Most recent 200', href: '/workspace/talk', icon: MessageSquare, tone: 'neutral' },
    { label: 'Open handoffs', value: talk!.handoffs.filter((h) => h.status !== 'closed' && h.status !== 'resolved').length || null, sub: 'Waiting for a person', href: '/workspace/talk', icon: Phone, tone: 'amber' },
    { label: 'Opt-outs', value: talk!.optOuts.length || null, sub: 'Contacts who asked not to be messaged', href: '/workspace/talk', icon: Users, tone: 'neutral' },
  ];
  return <div className="mb-kpi-grid" data-testid={`hub-kpis-${hub}`}>{cards.map((k) => <KpiCard key={k.label} {...k} tone={k.tone as 'neutral'}/>)}</div>;
}
