import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { FeatureDefinition } from '@/lib/metabos/registry';
import { businessStore } from '@/lib/metabos/store';
import { infraReport, type InfraReport } from '@/lib/metabos/infra';
import { StatusBadge } from '@/components/metabos/StatusBadge';
/** Server-rendered live measurements; reload the page to re-measure. */
export function InfraWorkspace({ feature }: { feature: FeatureDefinition }) {
  let r: InfraReport | null = null, error = '';
  try { r = infraReport(businessStore(), feature.id); } catch (e) { error = e instanceof Error ? e.message : 'Measurement failed'; }
  return <div className="mb-console mb-category mb-module mb-infra" data-feature={feature.id} data-status={feature.status}>
    <header className="mb-panel"><h1>{feature.label}</h1><StatusBadge status={feature.status} /><p className="mb-muted">{feature.summary}</p>
      {r && <p className="mb-muted" data-testid="measured-at">Measured {r.measuredAt} on this server. <Link className="mb-link" href={feature.route}>Re-measure</Link></p>}</header>
    {error && <section className="mb-panel"><p role="alert" className="mb-error">Could not measure: {error}</p></section>}
    {r && <section className="mb-panel" aria-label="Measurements"><h2>Measurements</h2><dl className="mb-stats">{r.metrics.map((m) => <div key={m.label}><dt>{m.label}</dt><dd>{m.value}</dd></div>)}</dl></section>}
    {r?.tables.map((t) => <section key={t.title} className="mb-panel"><h2>{t.title}</h2>{t.rows.length === 0 ? <p className="mb-muted">Nothing recorded yet.</p> :
      <div className="mb-table-wrap" style={{ overflowX: 'auto' }}><table><thead><tr>{t.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{t.rows.map((row, i) => <tr key={i}>{row.map((v, j) => <td key={j} style={{ wordBreak: 'break-all' }}>{String(v)}</td>)}</tr>)}</tbody></table></div>}</section>)}
    {r && <section className="mb-panel"><h2>Limits</h2><ul className="mb-help-list">{r.limits.map((l) => <li key={l}>{l}</li>)}</ul></section>}
    <Link className="mb-link" href={`/workspace/${feature.menuId}`}><ArrowLeft size={13} /> Back</Link>
  </div>;
}
