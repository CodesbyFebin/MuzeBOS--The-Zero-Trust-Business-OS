'use client';

/**
 * F8 spend report under the GladOS style (pages/feature-additions.md): GCard
 * "Spending" with a GStackedBar of the last six uploaded months by category,
 * month over month, a GList of the top categories (a click opens a GSheet of
 * that category's transactions) and the top merchants. Data:
 * lib/spend-report.ts over the uploaded card ledger only.
 */

import { useState } from 'react';
import { GButton, GCard, GEmpty, GLegend, GList, GRow, GSampleBadge, GSectionHeader, GSheet, GStackedBar, GTable, type GColumn, type VizColor } from '@/components/g';
import type { SpendCard, SpendTxn } from '@/lib/spend-report';

const usd = (n: number, cents = false) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents ? 2 : 0 });
/** One series slot per stack key: at most five categories plus Other (lib/spend-report.ts). */
const seriesColor = (i: number): VizColor => `series-${Math.min(6, i + 1) as 1 | 2 | 3 | 4 | 5 | 6}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;

const TXN_COLUMNS = (hide: boolean): GColumn<SpendTxn>[] => [
  { key: 'date', label: 'Date', render: (t) => t.date, sortValue: (t) => t.date },
  { key: 'desc', label: 'Description', render: (t) => <span title={t.description}>{t.merchant}</span>, sortValue: (t) => t.merchant },
  { key: 'usd', label: 'Amount', numeric: true, render: (t) => <span data-mask={hide || undefined} className="fin-g-money">{usd(t.usd, true)}</span>, sortValue: (t) => t.usd },
];

export function SpendingG({ spend, hide }: { spend: SpendCard; hide: boolean }) {
  const [hidden, setHidden] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  if (spend.state === 'none') {
    return (
      <GCard p={24} className="fin-g-spend" aria-labelledby="fin-g-spend">
        <GSectionHeader id="fin-g-spend" size={22} title="Spending" caption="By category, month over month" />
        <GEmpty title="Upload a statement to see spending." body="A credit card CSV fills spending by category, month and merchant." action={{ label: 'Upload a statement', href: '#statement-upload' }} />
      </GCard>
    );
  }

  const { report, sample } = spend;
  const first = report.months[0];
  const last = report.months[report.months.length - 1];
  const mom = report.mom;
  const momText = mom
    ? mom.deltaPct === null
      ? `${usd(mom.total)} in ${last.label}`
      : `${usd(mom.total)} in ${last.label}, ${mom.deltaPct >= 0 ? 'up' : 'down'} ${Math.abs(mom.deltaPct)}% on ${report.months.find((m) => m.month === mom.prevMonth)?.label ?? mom.prevMonth}`
    : `${usd(last.total)} in ${last.label}`;
  const keys = report.keys.map((k, i) => ({ id: k, label: k, color: seriesColor(i) }));
  const txns = open ? report.txns.filter((t) => t.category === open) : [];

  return (
    <GCard p={24} className="fin-g-spend" aria-labelledby="fin-g-spend">
      <GSectionHeader
        id="fin-g-spend"
        size={22}
        title={<span className="fin-g-spend-title">Spending{sample && <GSampleBadge fixture="lib/spend-report.ts sampleSpendRows" />}</span>}
        caption={<span data-mask={hide || undefined} className="fin-g-money">{`Card statements · ${first.label} to ${last.label} · ${usd(report.total)}`}</span>}
      />
      <p className="fin-g-cap" data-mask={hide || undefined}>{momText}</p>
      <GLegend
        label="Show or hide a category"
        items={keys.map((k) => ({ id: k.id, label: k.label, color: k.color, on: !hidden.includes(k.id) }))}
        onToggle={(id) => setHidden((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]))}
        onIsolate={(id) => setHidden(keys.map((k) => k.id).filter((k) => k !== id))}
      />
      <div data-mask={hide || undefined}>
        <GStackedBar
          label="Spending per month by category"
          keys={keys}
          hiddenKeys={hidden}
          columns={report.months.map((m) => ({ id: m.month, label: m.label, parts: keys.map((k) => m.byCategory[k.id] ?? 0) }))}
          formatValue={(v) => usd(v)}
          height={170}
        />
      </div>
      <div className="fin-g-spend-lists">
        <section aria-labelledby="fin-g-spend-cats">
          <h3 id="fin-g-spend-cats" className="fin-g-spend-h">Top categories</h3>
          <GList divided label="Top spending categories">
            {report.categories.slice(0, 6).map((c) => (
              <GRow
                key={c.category}
                title={c.category}
                meta={`${c.count} ${c.count === 1 ? 'transaction' : 'transactions'} · ${pct(c.share)}`}
                trailing={<span data-mask={hide || undefined} className="fin-g-money">{usd(c.total)}</span>}
                onClick={() => setOpen(c.category)}
                hint={`See the ${c.category} transactions`}
              />
            ))}
          </GList>
        </section>
        <section aria-labelledby="fin-g-spend-merch">
          <h3 id="fin-g-spend-merch" className="fin-g-spend-h">Top merchants</h3>
          <GList divided label="Top merchants">
            {report.merchants.map((m) => (
              <GRow key={m.merchant} title={m.merchant} meta={`${m.count} ${m.count === 1 ? 'charge' : 'charges'}`} trailing={<span data-mask={hide || undefined} className="fin-g-money">{usd(m.total)}</span>} />
            ))}
          </GList>
        </section>
      </div>
      <GSheet
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open ?? ''}
        caption={`${txns.length} ${txns.length === 1 ? 'transaction' : 'transactions'} · ${first.label} to ${last.label}`}
        width={720}
        footer={<GButton onClick={() => setOpen(null)}>Close</GButton>}
      >
        <GTable columns={TXN_COLUMNS(hide)} rows={txns} rowKey={(t) => `${t.date}|${t.description}|${t.usd}`} caption={`${open ?? ''} transactions`} sort={{ key: 'date', dir: 'desc' }} />
      </GSheet>
    </GCard>
  );
}
