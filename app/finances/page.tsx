import { configuredProcessors, monthToDateIncome, stripeSnapshot, wiseOutgoing, fanbasisMonthToDateIncome } from '@/lib/connectors/payments';
import { incomeAccounts, totalIncome, incomeCategories, net, expensesView } from '@/lib/finances';
import { openLedger } from '@/lib/ledger';
import { openBankStore } from '@/lib/bank';
import { businessSeries } from '@/lib/bank-statements';
import { sampleSpendRows, spendReport, type SpendCard } from '@/lib/spend-report';
import type { LedgerRow } from '@/lib/statements';
import { FinancesClient, type FinancesAccount, type FinancesClientProps } from './FinancesClient';
import { FinancesG } from './FinancesG';
import { getAppearance } from '@/lib/appearance-server';
import { treeFor } from '@/lib/appearance';
import { isFilming } from '@/lib/demo-mode';
import { runtimeEnv } from '@/lib/creds';
import {
  FINANCE_DEMO_TOTAL_USD,
  DEMO_STRIPE_AVAILABLE_USD,
  DEMO_STRIPE_PENDING_USD,
  demoIncomeAccounts,
  demoBusinessSeries,
  demoWiseOutgoing,
  demoRecentStripeCharges,
  demoIncomeCategories,
  demoExpensesByCategory,
} from '@/lib/finance-demo';

export const dynamic = 'force-dynamic';

export default async function FinancesPage(route: { searchParams?: { sample?: string } }) {
  // tolerant of a bare call (tests/smoke.test.ts renders pages without props)
  const searchParams = route?.searchParams;
  const stripeKeyed = configuredProcessors(runtimeEnv()).some((p) => p.id === 'stripe' && p.configured);

  // Stripe is only "live" when the API actually answers — a present-but-invalid
  // key (or a server env missing it) stays honest pending, never a fake live.
  let stripeLive = false;
  let mtdUsd: number | null = null;
  let available = 0;
  let pending = 0;
  let recent: { amount: number; currency: string; description: string; created: number }[] = [];
  if (stripeKeyed) {
    const [mtd, snap] = await Promise.all([
      monthToDateIncome().catch(() => null),
      stripeSnapshot().catch(() => null),
    ]);
    if (snap) {
      stripeLive = true;
      available = (snap.available[0]?.amount ?? 0) / 100;
      pending = (snap.pending[0]?.amount ?? 0) / 100;
      recent = snap.recentCharges;
    }
    mtdUsd = mtd ? mtd.amountCents / 100 : null;
  }

  // Which processors have keys (honest config), so non-Stripe cards show
  // "key set · pull pending" vs "connect →" rather than a misleading live badge.
  const configuredMap = Object.fromEntries(configuredProcessors(runtimeEnv()).map((p) => [p.id, p.configured]));
  // Live FanBasis month-to-date income per account (null when unkeyed).
  const [fbAa, fbMer] = await Promise.all([
    fanbasisMonthToDateIncome(runtimeEnv().FANBASIS_KEY_2).catch(() => null),
    fanbasisMonthToDateIncome(runtimeEnv().FANBASIS_KEY_1).catch(() => null),
  ]);
  const liveIncomeUsd: Record<string, number> = {};
  if (fbAa != null) liveIncomeUsd['fanbasis-2'] = fbAa;
  if (fbMer != null) liveIncomeUsd['fanbasis-1'] = fbMer;
  // Filming mode: scripted books (lib/finance-demo.ts). No real keys live on a filming
  // host, so every section would otherwise render honestly empty.
  const filming = isFilming();
  if (filming) {
    stripeLive = true;
    available = DEMO_STRIPE_AVAILABLE_USD;
    pending = DEMO_STRIPE_PENDING_USD;
    recent = demoRecentStripeCharges();
  }
  const accounts: FinancesAccount[] = filming ? demoIncomeAccounts() : incomeAccounts({ connected: stripeLive, mtdUsd }, configuredMap, liveIncomeUsd);
  // Outgoing Wise transfers — null (no Wise key) hides the section entirely.
  const wiseOut = filming ? demoWiseOutgoing() : await wiseOutgoing(runtimeEnv()).catch(() => null);
  const incomeMtd = totalIncome(accounts);
  // Expenses from the uploaded statement ledger when present; the scripted
  // demo set in Filming; otherwise nothing (H9: never sample rows as real).
  let ledgerSpend: { category: string; total: number }[] = [];
  let ledgerMonth: string | null = null;
  let spendRows: LedgerRow[] = [];
  try {
    const ledger = openLedger();
    ledgerSpend = ledger.monthly();
    ledgerMonth = ledger.latestMonth();
    spendRows = ledger.spendRows();
    ledger.close();
  } catch {
    ledgerSpend = [];
  }
  // Per-business income from uploaded bank statements (Acme, General Ops…).
  let bankSeries: ReturnType<typeof businessSeries> = [];
  if (filming) {
    bankSeries = demoBusinessSeries();
  } else {
    try {
      const bank = openBankStore();
      bankSeries = businessSeries(bank.all());
      bank.close();
    } catch {
      bankSeries = [];
    }
  }
  // "2026-06" → "Jun 2026" for an honest period label on the uploaded figures.
  const monthLabel = ledgerMonth
    ? new Date(`${ledgerMonth}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    : null;
  const { source: expensesSource, byCategory, total: expenses } = expensesView({
    ledgerSpend,
    filming,
    demo: demoExpensesByCategory,
  });
  const netMonthly = net(incomeMtd, expenses);
  const liveCount = accounts.filter((a) => a.live).length;
  const maxAccount = Math.max(...accounts.map((a) => a.income ?? 0), 1);
  const maxCategory = Math.max(...byCategory.map((c) => c.total), 1);
  // Real income-by-category derivation (never demo numbers): one column per
  // processor account, sum-consistent with incomeMtd above. When nothing is
  // configured every account's income is 0 and the hero renders its honest
  // empty state via FinancesClient rather than a faked chart.
  const categories = filming ? demoIncomeCategories() : incomeCategories(accounts);

  // Spend report (F8): the uploaded card ledger only. Filming, and ?sample=1 on an empty ledger,
  // show the badged fixture; otherwise no rows means the honest empty state.
  const realSpend = filming ? null : spendReport(spendRows);
  const spendFixture = filming || (!realSpend && searchParams?.sample === '1');
  const sampleSpend = spendFixture ? spendReport(sampleSpendRows()) : null;
  const spend: SpendCard = realSpend
    ? { state: 'ready', sample: false, report: realSpend }
    : sampleSpend
      ? { state: 'ready', sample: true, report: sampleSpend }
      : { state: 'none' };

  // Two trees, one fetch (glados-ui SPEC X5): the new style renders FinancesG.
  const props: FinancesClientProps = {
    headlineTotal: filming ? FINANCE_DEMO_TOTAL_USD : incomeMtd,
    headlinePeriod: filming ? 'YTD' : 'MTD',
    incomeMtd,
    netMonthly,
    expenses,
    expensesSource,
    monthLabel,
    categories,
    accounts,
    byCategory,
    bankSeries,
    wiseOut,
    recent,
    stripeLive,
    available,
    pending,
    liveCount,
    maxAccount,
    maxCategory,
    spend,
  };
  if (treeFor(getAppearance(), '/finances') === 'glados') return <FinancesG {...props} />;
  return <FinancesClient {...props} />;
}
