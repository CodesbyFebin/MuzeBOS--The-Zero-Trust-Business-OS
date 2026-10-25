import { getAppearance } from '@/lib/appearance-server';
import { treeFor } from '@/lib/appearance';
import { buildTradingPage, type TradingSearch } from '@/lib/trading-page';
import { TradingG } from '@/components/trading/TradingG';
import { TradingClassic } from '@/components/trading/TradingClassic';
import { TradingError } from '@/components/trading/TradingError';
import { TradingLegacy, TradingLegacyError } from '@/components/trading/TradingLegacy';

export const dynamic = 'force-dynamic';

/**
 * /trading (pages/trading.md): one server build, one tree per style. The
 * model comes from lib/trading-page.ts; the trees only render it. Under
 * Bennett Legacy (/trading is in L_READY) the Legacy tree renders the same model.
 */
export default async function TradingPage({ searchParams = {} }: { searchParams?: TradingSearch }) {
  const page = await buildTradingPage(searchParams);
  const tree = treeFor(getAppearance(), '/trading');
  const g = tree === 'glados';
  if (!page.ok) return tree === 'legacy' ? <TradingLegacyError message={page.error} /> : <TradingError message={page.error} g={g} />;
  const props = { model: page.model, pushPath: page.pushPath, setup: page.setup };
  if (tree === 'legacy') return <TradingLegacy {...props} />;
  if (g) return <TradingG {...props} />;
  return <TradingClassic {...props} />;
}
