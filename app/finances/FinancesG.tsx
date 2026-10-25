'use client';

/**
 * /finances under the GladOS style (glados-ui SPEC S02 §4.4, §5.7; X5).
 * Same props as FinancesClient (the server page fetches once for both
 * trees), same search and hide-values behaviour, every widget a G kit part.
 * Layout kept: hero, four tiles, income by business, expenses, processors,
 * Wise, recent income. Cut (FR-N2, FR-N6): the header's duplicate total and
 * net, and the expenses bar list that repeated the donut legend.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowDownLeft, ArrowUpRight, Eye, EyeOff, Landmark, Scale, Send, Upload } from 'lucide-react';
import {
  GAsk, GBarChart, GButton, GCard, GDonut, GEmpty, GErrorLine, GEyebrow, GInput, GList, GPage, GProgress, GRow, GSectionHeader, GSegmented, GSelect, GTag,
  GBar, type SeriesBar, type StageColumn,
} from '@/components/g';
import { matchesQuery } from './search';
import { SpendingG } from './SpendingG';
import { processorPeriodLabel, processorSetupHref } from '@/lib/finances';
import type { BusinessSeries, IncomeRange, MonthPoint } from '@/lib/bank-statements';
import type { FinancesAccount, FinancesClientProps } from './FinancesClient';

const HIDE_VALUES_KEY = 'finances:hide-values';

const usd = (n: number, cents = false) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents ? 2 : 0 });

function ago(unix: number): string {
  const mins = Math.round((Date.now() - unix * 1000) / 60_000);
  if (mins < 60) return `${Math.max(0, mins)} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

/** Blurs an amount while hide-values is on (the kit's [data-mask] recipe). */
function Money({ children, hide }: { children: React.ReactNode; hide: boolean }) {
  return <span data-mask={hide || undefined} className="fin-g-money">{children}</span>;
}

export function FinancesG(props: FinancesClientProps) {
  const {
    headlinePeriod, incomeMtd, netMonthly, expenses, expensesSource, monthLabel, categories, accounts, byCategory, bankSeries, wiseOut, recent,
    stripeLive, available, pending, liveCount, maxAccount, spend,
  } = props;
  const [hide, setHide] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState('');

  // Hide-values persists (same key as Classic), guarded against blocked storage.
  useEffect(() => {
    try { setHide(localStorage.getItem(HIDE_VALUES_KEY) === '1'); } catch { /* stay visible */ }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(HIDE_VALUES_KEY, hide ? '1' : '0'); } catch { /* session only */ }
  }, [hide, hydrated]);

  const active = query.trim().length > 0;
  const categoryTotal = categories.reduce((s, c) => s + c.usd, 0);
  const searchParams = useSearchParams();
  // ?category=<key> preselects; else the largest category (unchanged logic).
  const [heroKey, setHeroKey] = useState<string | null>(() => {
    const wanted = searchParams?.get('category');
    if (wanted && categories.some((c) => c.key === wanted)) return wanted;
    return categories.reduce<{ key: string; usd: number } | null>((best, c) => (!best || c.usd > best.usd ? c : best), null)?.key ?? null;
  });
  const pct = (v: number) => (categoryTotal > 0 ? Math.round((v / categoryTotal) * 100) : 0);
  const columns: StageColumn[] = categories.map((c) => ({
    id: c.key,
    label: c.label,
    value: c.usd,
    sub: `${pct(c.usd)}% of ${headlinePeriod}`,
    tip: { lines: [`${usd(c.usd)} · ${pct(c.usd)}% of ${headlinePeriod}`], hint: 'Click to focus' },
  }));
  const dimCategory = (label: string, amount: number) => active && !matchesQuery({ payee: label, category: label, amountUsd: amount }, query);

  const filteredRecent = useMemo(() => recent.filter((c) => matchesQuery({ payee: c.description, description: c.description, amountUsd: c.amount / 100 }, query)), [recent, query]);
  const filteredWise = useMemo(
    () => (wiseOut ?? []).filter((t) => matchesQuery({ payee: t.reference ?? t.status, description: t.reference ?? t.status, amountUsd: t.amountCents / 100 }, query)),
    [wiseOut, query],
  );
  const dimAccount = (a: FinancesAccount) => active && !matchesQuery({ payee: a.label, description: a.processor, amountUsd: a.income ?? 0 }, query);

  return (
    <GPage className="fin-g">
      <GSectionHeader
        size="page"
        title="Finances"
        caption="Every processor, one view"
        action={
          <GButton aria-pressed={hide} onClick={() => setHide((v) => !v)} title={hide ? 'Show every amount' : 'Blur every amount on this page'}>
            {hide ? <EyeOff size={14} strokeWidth={1.75} aria-hidden /> : <Eye size={14} strokeWidth={1.75} aria-hidden />}
            {hide ? 'Hidden' : 'Visible'}
          </GButton>
        }
      />

      {/* Hero: income by category on the stage chart (FR-N3), search below it, never over it. */}
      <GCard p={24} className="fin-g-hero" aria-labelledby="fin-g-hero">
        <GSectionHeader id="fin-g-hero" size={22} title="Income by category" action={<span className="fin-g-cap">{headlinePeriod} · {categories.length} {categories.length === 1 ? 'category' : 'categories'}</span>} />
        {categoryTotal > 0 ? (
          <>
            <div className="fin-g-chart">
              <GBarChart
                variant="stages"
                measure="usd"
                flow={false}
                columns={columns}
                selected={heroKey}
                onSelect={setHeroKey}
                hideValues={hide}
                label={`Income by category, ${headlinePeriod}`}
              />
            </div>
            <GAsk mode="filter" value={query} onValueChange={setQuery} label="Search transactions" placeholder="Search transactions, categories and processors" className="fin-g-ask" />
          </>
        ) : (
          <GEmpty kind="unconfigured" title="No processor income configured yet." body="Connect a payment processor to see income by category." setupHref="/integrations" setupHint="connect a payment processor to see income by category" />
        )}
      </GCard>

      {/* Tiles (FR-N4) */}
      <div className="fin-g-tiles">
        <Tile label={`Income · ${headlinePeriod}`} icon={<ArrowDownLeft size={14} strokeWidth={1.6} aria-hidden />} value={<Money hide={hide}>{usd(incomeMtd)}</Money>} sub={`${liveCount}/${accounts.length} live`} />
        <Tile
          label="Expenses · /mo"
          icon={<ArrowUpRight size={14} strokeWidth={1.6} aria-hidden />}
          value={expensesSource === 'none' ? '—' : <Money hide={hide}>{usd(expenses)}</Money>}
          sub={
            expensesSource === 'none' ? (
              <span data-expenses-empty=""><GButton size="sm" href="#statement-upload" title="Upload a card or bank statement below to see monthly spend">No statements yet</GButton></span>
            ) : expensesSource === 'uploaded' ? (
              <GTag tone="ok" dot>{monthLabel ? `Uploaded · ${monthLabel}` : 'Uploaded'}</GTag>
            ) : 'per month'
          }
        />
        <Tile
          label={`Net · ${headlinePeriod}`}
          icon={<Scale size={14} strokeWidth={1.6} aria-hidden />}
          value={<span data-tone={netMonthly < 0 ? 'err' : undefined}><Money hide={hide}>{netMonthly >= 0 ? '' : '−'}{usd(Math.abs(netMonthly))}</Money></span>}
          sub={expensesSource === 'none' ? 'no expenses uploaded' : 'in − out'}
        />
        <Tile
          label="Stripe balance"
          icon={<Landmark size={14} strokeWidth={1.6} aria-hidden />}
          value={stripeLive ? <Money hide={hide}>{usd(available, true)}</Money> : '—'}
          sub={stripeLive ? <Money hide={hide}>{usd(pending, true)} pending</Money> : <GButton size="sm" href={processorSetupHref('stripe')} title="STRIPE_SECRET_KEY">Connect Stripe</GButton>}
        />
      </div>

      {/* Income by business (FR-N5) */}
      {bankSeries.length > 0 && (
        <section className="fin-g-sec" aria-labelledby="fin-g-business">
          <GSectionHeader id="fin-g-business" size={22} title="Income by business" caption="Bank deposits, from uploaded statements" />
          <div className="fin-g-business">
            {bankSeries.map((s) => <BusinessCard key={s.business} series={s} hide={hide} />)}
          </div>
        </section>
      )}

      {/* Expenses (FR-N6): donut + uploader; the duplicate bar list is cut */}
      <section className="fin-g-sec" aria-labelledby="fin-g-expenses">
        <GSectionHeader
          id="fin-g-expenses"
          size={22}
          title="Monthly expenses by category"
          caption={expensesSource === 'none' ? 'None uploaded' : <Money hide={hide}>{expensesSource === 'uploaded' && monthLabel ? `${usd(expenses)} · ${monthLabel}` : `${usd(expenses)} /mo`}</Money>}
        />
        <div className="fin-g-expenses">
          <GCard p={24} className="fin-g-donut">
            {expensesSource === 'none' ? (
              <div data-expenses-empty="">
                <GEmpty title="Upload a card CSV to see spend by category" body="Nothing has been uploaded yet, so there are no expense figures on this page." />
              </div>
            ) : (
              <GDonut
                slices={byCategory.map((c) => ({ id: c.category, label: c.category, value: c.total }))}
                formatValue={(v) => usd(v)}
                centreLabel={expensesSource === 'uploaded' && monthLabel ? monthLabel : 'per month'}
                dimmed={byCategory.filter((c) => dimCategory(c.category, c.total)).map((c) => c.category)}
                hideValues={hide}
                label="Monthly expenses by category"
              />
            )}
          </GCard>
          <div id="statement-upload" className="fin-g-upload-wrap">
            <UploadCard />
          </div>
        </div>
      </section>

      {/* Spending (FounderOS merge F8): by category per month, top merchants, month over month */}
      {spend && <SpendingG spend={spend} hide={hide} />}

      {/* Processors (FR-N7) */}
      <section className="fin-g-sec" aria-labelledby="fin-g-proc">
        <GSectionHeader id="fin-g-proc" size={22} title="Income by processor" caption={`${liveCount}/${accounts.length} live`} />
        <div className="fin-g-proc">
          {accounts.map((a) => (
            <GCard key={a.id} p={20} className="fin-g-proc-card" data-dim={dimAccount(a) || undefined}>
              <div className="fin-g-proc-head">
                <div className="fin-g-proc-name">
                  <span>{a.label}</span>
                  <span className="fin-g-cap">{a.processor}</span>
                </div>
                {a.live ? (
                  <GTag tone="ok" dot>Live</GTag>
                ) : a.configured ? (
                  <GTag tone="warn" dot>Key set</GTag>
                ) : (
                  <GButton size="sm" href={processorSetupHref(a.id)} title={`connect ${a.processor} to pull its income`}>Connect</GButton>
                )}
              </div>
              <div className="fin-g-proc-value">
                <span className="fin-g-num-md">{a.income != null ? <Money hide={hide}>{usd(a.income)}</Money> : '—'}</span>
                <span className="fin-g-cap">{processorPeriodLabel(a, headlinePeriod)}</span>
              </div>
              <GBar label={`${a.label}: ${a.income != null ? usd(a.income) : 'no data'}, share of the largest processor`} value={a.income} max={maxAccount} tone="accent" />
            </GCard>
          ))}
        </div>
      </section>

      {/* Outgoing · Wise (hidden until a Wise key lands) */}
      {wiseOut && (
        <section className="fin-g-sec" aria-labelledby="fin-g-wise">
          <GSectionHeader id="fin-g-wise" size={22} title="Outgoing · Wise" caption={`${filteredWise.length} transfer${filteredWise.length === 1 ? '' : 's'}`} />
          <GCard p={16}>
            {filteredWise.length === 0 ? (
              <GEmpty inline title={active ? 'Nothing matches that search.' : 'Wise connected · no recent outgoing transfers'} />
            ) : (
              <GList label="Outgoing Wise transfers">
                {filteredWise.map((t, i) => (
                  <GRow
                    key={`${t.created}-${i}`}
                    leading={<Send size={15} strokeWidth={1.6} aria-hidden />}
                    title={<span className="fin-g-out"><Money hide={hide}>−{(t.amountCents / 100).toLocaleString('en-US', { style: 'currency', currency: t.currency })}</Money></span>}
                    meta={t.reference ?? t.status}
                    trailing={<span className="fin-g-cap">{t.status}</span>}
                  />
                ))}
              </GList>
            )}
          </GCard>
        </section>
      )}

      {/* Recent income · Stripe */}
      {stripeLive && recent.length > 0 && (
        <section className="fin-g-sec" aria-labelledby="fin-g-recent">
          <GSectionHeader id="fin-g-recent" size={22} title="Recent income" caption="Stripe · live" />
          <GCard p={16}>
            {filteredRecent.length === 0 ? (
              <GEmpty inline title="Nothing matches that search." />
            ) : (
              <GList label="Recent Stripe charges">
                {filteredRecent.map((c, i) => (
                  <GRow
                    key={`${c.created}-${i}`}
                    leading={<ArrowDownLeft size={15} strokeWidth={1.6} aria-hidden />}
                    title={<span className="fin-g-in"><Money hide={hide}>+{usd(c.amount / 100, true)}</Money></span>}
                    meta={c.description}
                    trailing={<span className="fin-g-cap">{ago(c.created)}</span>}
                  />
                ))}
              </GList>
            )}
          </GCard>
        </section>
      )}
    </GPage>
  );
}

function Tile({ label, icon, value, sub }: { label: string; icon: React.ReactNode; value: React.ReactNode; sub: React.ReactNode }) {
  return (
    <GCard p={20} className="fin-g-tile">
      <div className="fin-g-tile-head">
        <GEyebrow>{label}</GEyebrow>
        <span className="fin-g-icon">{icon}</span>
      </div>
      <div className="fin-g-num">{value}</div>
      <div className="fin-g-tile-sub">{sub}</div>
    </GCard>
  );
}

/* ── income by business (FR-N5): GBarChart series + metric GSegmented + range GSelect ── */

type Metric = 'in' | 'out' | 'net';
const RANGES: { label: string; value: string }[] = [
  { label: '30 days', value: '1' },
  { label: '60 days', value: '2' },
  { label: '3 months', value: '3' },
  { label: '6 months', value: '6' },
  { label: '12 months', value: '12' },
  { label: 'All time', value: 'all' },
];
const metricCents = (m: MonthPoint, metric: Metric) => (metric === 'in' ? m.creditsCents : metric === 'out' ? m.debitsCents : m.netCents);
const cUsd = (cents: number) => usd(cents / 100);
const signed = (cents: number) => `${cents < 0 ? '−' : '+'}${cUsd(Math.abs(cents))}`;
const monthShort = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
const monthLong = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

function BusinessCard({ series, hide }: { series: BusinessSeries; hide: boolean }) {
  const [range, setRange] = useState<IncomeRange>('all');
  const [metric, setMetric] = useState<Metric>('in');
  const shown = range === 'all' ? series.months : series.months.slice(-range);
  const totalIn = shown.reduce((s, m) => s + m.creditsCents, 0);
  const totalOut = shown.reduce((s, m) => s + m.debitsCents, 0);
  const net = shown.reduce((s, m) => s + m.netCents, 0);
  const total = metric === 'in' ? totalIn : metric === 'out' ? totalOut : net;
  const bars: SeriesBar[] = shown.map((m) => ({
    id: m.month,
    label: monthShort(m.month),
    value: metricCents(m, metric) / 100,
    tip: { title: monthLong(m.month), lines: [`${cUsd(m.creditsCents)} in`, `${cUsd(m.debitsCents)} out · ${signed(m.netCents)} net`] },
  }));
  return (
    <GCard p={24} className="fin-g-biz">
      <div className="fin-g-biz-head">
        <div className="fin-g-biz-name">
          <span>{series.business}</span>
          <span className="fin-g-cap">{metric === 'in' ? 'Income · bank deposits' : metric === 'out' ? 'Outflow · bank debits' : 'Net · after money out'}</span>
        </div>
        <div className="fin-g-biz-ctrls">
          <GSegmented<Metric> label="Metric" value={metric} onChange={setMetric} options={[{ value: 'in', label: 'In' }, { value: 'out', label: 'Out' }, { value: 'net', label: 'Net' }]} />
          <GSelect size="compact" aria-label="Range" value={String(range)} onChange={(e) => setRange(e.target.value === 'all' ? 'all' : (Number(e.target.value) as IncomeRange))} options={RANGES} />
        </div>
      </div>
      <div className="fin-g-biz-total">
        <span className="fin-g-num-md" data-tone={metric === 'net' && total < 0 ? 'err' : undefined}><Money hide={hide}>{metric === 'net' ? signed(total) : cUsd(total)}</Money></span>
        <span className="fin-g-cap" data-tone={metric === 'in' ? (net >= 0 ? 'ok' : 'err') : undefined}>
          <Money hide={hide}>{metric === 'in' ? `${signed(net)} net` : metric === 'out' ? `of ${cUsd(totalIn)} in` : `${cUsd(totalIn)} in − ${cUsd(totalOut)} out`}</Money>
        </span>
      </div>
      <div className="fin-g-biz-chart" data-mask={hide || undefined}>
        <GBarChart variant="series" bars={bars} tone={metric === 'in' ? 'accent' : metric === 'out' ? 'err' : 'signed'} height={104} formatValue={(v) => usd(v)} label={`${series.business}: ${metric === 'in' ? 'money in' : metric === 'out' ? 'money out' : 'net'} per month`} />
      </div>
    </GCard>
  );
}

/* ── statement upload (FR-N1, §5.7): the same two routes as StatementUploader ── */

function UploadCard() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ tone: 'busy' | 'ok' | 'err'; text: string } | null>(null);
  const busy = status?.tone === 'busy';

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus({ tone: 'busy', text: `Parsing ${file.name}` });
    const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch(isPdf ? '/api/finances/bank-statement' : '/api/finances/statements', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) setStatus({ tone: 'err', text: data.error ?? 'Upload failed' });
      else if (isPdf) {
        setStatus({ tone: 'ok', text: `${data.summary.business} ${data.summary.month}: ${usd(data.summary.creditsCents / 100)} in` });
        router.refresh();
      } else {
        setStatus({ tone: 'ok', text: `${data.inserted} new of ${data.parsed} parsed rows` });
        router.refresh();
      }
    } catch (err) {
      setStatus({ tone: 'err', text: err instanceof Error ? err.message : 'Upload failed' });
    } finally {
      e.target.value = '';
    }
  }

  return (
    <GCard p={24} className="fin-g-upload">
      <Upload size={20} strokeWidth={1.6} aria-hidden className="fin-g-icon" />
      <h3 className="fin-g-upload-title">Upload statements</h3>
      <p className="fin-g-upload-copy">
        A credit card CSV (categorised spend) or a bank statement PDF (income per business). Stored locally, never committed.
      </p>
      <GInput ref={input} type="file" accept=".csv,text/csv,.pdf,application/pdf" hidden onChange={onFile} disabled={busy} aria-label="Statement file" />
      <GButton variant="ink" busy={busy} onClick={() => input.current?.click()}>Choose CSV or PDF</GButton>
      {status?.tone === 'busy' && <GProgress text={status.text} />}
      {status?.tone === 'ok' && <p className="fin-g-upload-copy" role="status">{status.text}</p>}
      {status?.tone === 'err' && <GErrorLine>{status.text}</GErrorLine>}
    </GCard>
  );
}
