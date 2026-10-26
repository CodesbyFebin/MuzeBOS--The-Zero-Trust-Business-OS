'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import type { Analytics } from '@/lib/muzebos/analytics';

const money = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n / 100);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const CHANNEL: Record<string, string> = { manual: 'Manual', walk_in: 'Walk-in', phone: 'Phone', whatsapp: 'WhatsApp', instagram: 'Instagram', web: 'Web' };
const day = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
function preset(id: string): { from: string; to: string } {
  const now = new Date(); const to = day(now);
  if (id === 'month') return { from: `${to.slice(0, 7)}-01`, to };
  if (id === 'year') return { from: `${to.slice(0, 4)}-01-01`, to };
  if (id === '30' || id === '90') return { from: day(new Date(now.getTime() - (Number(id) - 1) * 86_400_000)), to };
  return { from: '', to: '' };
}
const PRESETS = [['all', 'All time'], ['month', 'This month'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['year', 'This year']] as const;

export function AnalyticsWorkspace() {
  const [range, setRange] = useState({ from: '', to: '' });
  const [active, setActive] = useState('all');
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const query = useMemo(() => { const q = new URLSearchParams({ tz: String(-new Date().getTimezoneOffset()) }); if (range.from) q.set('from', range.from); if (range.to) q.set('to', range.to); return q.toString(); }, [range]);
  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch(`/api/analytics?${query}`, { cache: 'no-store' }); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Analytics unavailable'); setData(d); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Analytics unavailable'); }
    finally { setLoading(false); }
  }, [query]);
  useEffect(() => { void load(); }, [load]);
  const maxMonth = Math.max(1, ...(data?.monthly.map((m) => m.issuedRevenue) ?? [0]));
  const k = data?.kpis;
  return <div className="mb-console mb-category mb-analytics">
    <span className="mb-eyebrow">GROWTH / ANALYTICS</span><h1>Business analytics</h1>
    <p className="mb-muted">Computed only from invoices and order drafts in this workspace. No traffic, ad or provider data is included.</p>
    <div className="mb-filter" role="group" aria-label="Date range">{PRESETS.map(([id, label]) => <button key={id} className="mb-button" aria-pressed={active === id} onClick={() => { setActive(id); setRange(preset(id)); }}>{label}</button>)}</div>
    <div className="mb-range"><label>From<input type="date" aria-label="From date" value={range.from} max={range.to || undefined} onChange={(e) => { setActive('custom'); setRange((r) => ({ ...r, from: e.target.value })); }}/></label><label>To<input type="date" aria-label="To date" value={range.to} min={range.from || undefined} onChange={(e) => { setActive('custom'); setRange((r) => ({ ...r, to: e.target.value })); }}/></label>
      <a className="mb-button" href={`/api/analytics?${query}&format=csv`} download><Download size={14} aria-hidden/> Export CSV</a>
      <button className="mb-button" onClick={() => void load()} aria-label="Refresh analytics"><RefreshCw size={14} aria-hidden/></button></div>
    {error && <p className="mb-alert" role="alert">{error}</p>}
    {loading && !data && <p className="mb-muted">Loading analytics…</p>}
    {data && k && <>
      {data.empty && <p className="mb-empty" role="note">No invoices or order drafts in this range. Figures below are zero, not estimates.</p>}
      <section aria-label="Key metrics" className="mb-kpis">
        {[['Issued revenue', money(k.issuedRevenue), data.definitions.issuedRevenue], ['Settled (manual)', money(k.settledRevenue), data.definitions.settledRevenue], ['Outstanding', money(k.outstanding), data.definitions.outstanding], ['Invoices', String(k.invoices), data.definitions.invoices], ['Average order value', k.aov === null ? 'Unavailable' : money(k.aov), data.definitions.aov], ['Draft-to-invoice', k.conversion === null ? 'Unavailable' : pct(k.conversion), data.definitions.conversion]].map(([label, value, def]) =>
          <article className="mb-panel mb-kpi" key={label} data-kpi={label}><span className="mb-muted">{label}</span><strong>{value}</strong><small>{def}</small></article>)}
      </section>
      <div className="mb-analytics-grid">
        <section className="mb-panel" aria-label="Monthly trend"><h2>Monthly issued revenue</h2>{!data.monthly.length ? <p className="mb-empty">No months to show.</p> : <ol className="mb-bars">{data.monthly.map((m) => <li key={m.month} title={`${m.month}: ${money(m.issuedRevenue)} from ${m.invoices} invoices`}><span className="mb-bar" style={{ height: `${Math.round((m.issuedRevenue / maxMonth) * 100)}%` }}/><small>{m.month}</small><small className="sr-only">{money(m.issuedRevenue)}, {m.invoices} invoices</small></li>)}</ol>}</section>
        <section className="mb-panel" aria-label="Channel distribution"><h2>Channels</h2><p className="mb-muted">{data.definitions.channels}</p>{!data.channels.length ? <p className="mb-empty">No invoices in this range.</p> : <ul className="mb-channels">{data.channels.map((c) => <li key={c.channel}><div className="mb-row"><span>{CHANNEL[c.channel] ?? c.channel}</span><span>{c.invoices} · {money(c.issuedRevenue)} · {pct(c.share)}</span></div><span className="mb-meter"><span style={{ width: pct(c.share) }}/></span></li>)}</ul>}</section>
        <section className="mb-panel" aria-label="Order counts"><h2>Order drafts <small>{data.orders.total}</small></h2><table className="mb-table"><tbody>{([['Issued', data.orders.issued], ['Awaiting review', data.orders.awaiting_review], ['Expired', data.orders.expired], ['Rejected', data.orders.rejected]] as const).map(([l, n]) => <tr key={l}><th scope="row">{l}</th><td>{n}</td></tr>)}</tbody></table></section>
        <section className="mb-panel" aria-label="Unavailable metrics"><h2>Not available</h2>{data.unavailable.map((u) => <article key={u.metric} className="mb-unavailable" data-metric={u.metric}><div className="mb-row"><strong>{u.metric}</strong><span className="mb-badge">Unavailable</span></div><ul>{u.missing.map((m) => <li key={m}>Missing: {m}</li>)}</ul></article>)}</section>
      </div>
    </>}
  </div>;
}
