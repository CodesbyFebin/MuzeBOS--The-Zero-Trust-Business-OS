'use client';
import { useEffect, useState } from 'react';
import type { HubView, Fact } from '@/lib/metabos/hubs';
const fmt = (f: Fact) => f.value === null ? '—' : f.unit === 'paise' && typeof f.value === 'number' ? `₹${(f.value / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : f.unit === 'percent' ? `${f.value}%` : String(f.value);
const TITLES: Record<string, string> = { money: 'Money today', brain: 'Brain today', growth: 'Growth today', activity: 'Jev approvals & activity', agents: 'Agents' };
/** Live counts from stored records; every number names its source. Sign-in required. */
export function HubOverview({ hub }: { hub: string }) {
  const [view, setView] = useState<HubView | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => { fetch(`/api/metabos/hubs/${hub}`, { cache: 'no-store' }).then(async (r) => { const j = await r.json(); if (!r.ok) setError(j.error ?? 'Could not load'); else setView(j); }).catch(() => setError('Could not load')); }, [hub]);
  const cols = view?.rows.length ? Array.from(new Set(view.rows.flatMap((r) => Object.keys(r)))) : [];
  return <section className="mb-panel" data-testid={`hub-${hub}`} aria-labelledby={`hub-${hub}-h`}>
    <h2 id={`hub-${hub}-h`}>{TITLES[hub] ?? hub}</h2>
    {error && <p role="alert">{error}</p>}
    {!error && !view && <p className="mb-muted">Loading stored records…</p>}
    {view && <>
      {view.empty && <p className="mb-empty">No records yet. Numbers appear as soon as you add data; nothing here is sample data.</p>}
      <dl className="mb-status-summary">{view.facts.map((f) => <div key={f.label}><dt>{f.label}</dt><dd data-testid="hub-fact">{fmt(f)}</dd><dd className="mb-muted"><small>from {f.source}</small></dd></div>)}</dl>
      {!!view.rows.length && <table><thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{view.rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c}>{String(r[c] ?? 0)}</td>)}</tr>)}</tbody></table>}
    </>}
  </section>;
}
