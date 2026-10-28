import Link from 'next/link';
import { ChevronRight, type LucideIcon } from 'lucide-react';
export type KpiTone = 'green' | 'amber' | 'red' | 'neutral' | 'accent';
/** v3 KPI card. `value` null renders the honest empty text instead of a number. */
export function KpiCard({ label, value, sub, href, icon: Icon, tone = 'neutral', empty = 'No records yet' }: { label: string; value: string | number | null; sub?: string; href: string; icon: LucideIcon; tone?: KpiTone; empty?: string }) {
  return <Link className="mb-kpi-card" href={href} aria-label={`${label}: ${value ?? empty}`}>
    <span className="mb-kpi-icon" data-tone={tone === 'accent' ? undefined : tone} aria-hidden><Icon size={18}/></span>
    <span className="mb-kpi-info"><span className="mb-kpi-label">{label}</span>{value === null ? <span className="mb-kpi-value" data-empty>{empty}</span> : <span className="mb-kpi-value">{value}</span>}{sub && <span className="mb-kpi-sub">{sub}</span>}</span>
    <ChevronRight className="mb-kpi-arrow" size={14} aria-hidden/>
  </Link>;
}
