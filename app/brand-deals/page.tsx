import { getBrandDeals } from '@/lib/brand-deals';
import { resolveBdpilotBotUrl } from '@/lib/creds';
import { DealBoard } from '@/components/brand-deals/DealBoard';
import { DealBoardG } from '@/components/brand-deals/DealBoardG';
import { getAppearance } from '@/lib/appearance-server';
import { treeFor } from '@/lib/appearance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GladOS Futurism (Zentra) layout: the title row lives inside the floating
// slab, so this page skips the shared PageHeader deliberately.
// Two trees, one fetch (glados-ui SPEC X5): the new style renders DealBoardG.
export default async function BrandDealsPage() {
  const snapshot = await getBrandDeals();
  // Server-side only: the approval bot link renders when BDPILOT_BOT_URL is a
  // real http(s) URL, and is absent otherwise (H5).
  if (treeFor(getAppearance(), '/brand-deals') === 'glados') return <DealBoardG initial={snapshot} botUrl={resolveBdpilotBotUrl()} />;
  return <DealBoard initial={snapshot} botUrl={resolveBdpilotBotUrl()} />;
}
