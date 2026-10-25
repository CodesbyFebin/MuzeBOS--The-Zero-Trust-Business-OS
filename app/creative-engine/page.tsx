import { Dashboard } from '@/components/creative-engine/Dashboard';
import { BackToAdPilot } from '@/components/creative-engine/BackLink';
import { getAppearance } from '@/lib/appearance-server';
import { treeFor } from '@/lib/appearance';
import { readCampaigns } from '@/lib/creative-engine/store';
import { buildHealthSnapshot } from '@/lib/creative-engine/snapshot';
import { SAMPLE_PRODUCT, sampleCampaign, sampleCatalog, sampleHealth, sampleRuns, sampleSaved, sampleSignals, sampleWatchlist } from '@/lib/creative-engine/demo';
import { toSummary } from '@/lib/creative-engine/pick';
import { productOptions } from '@/lib/creative-engine/products';
import { adStore } from '@/lib/foreplay/store';
import { readWatchEntries } from '@/lib/foreplay/watchlist';
import { readSavedAds } from '@/lib/foreplay/saved';

export const dynamic = 'force-dynamic';

/**
 * Creative Engine (renamed from Ad Engine, S02): its own page under AdPilot
 * (docs/projects/creative-engine/SPEC.md). `/ad-engine` 308s here (next.config.mjs).
 * Same sanctioned red colorway, scoped by the CSS-variable override. Reads
 * only stored facts. `?sample=1` previews the widgets on a badged, read-only,
 * fictional sample set; it is never written to the store.
 *
 * Two skins, one engine (glados-ui SPEC X5, GP1): under the GladOS style, with
 * the route in G_READY, the same Dashboard renders from the G kit; under Classic
 * it renders the paper markup unchanged. Data is fetched once for both.
 */


export default async function CreativeEnginePage({ searchParams }: { searchParams?: { sample?: string } }) {
  const sample = searchParams?.sample === '1';
  // S04 B25: the sample preview reads only the fictional sample world, never
  // the operator's saved ads, watchlist or signals.
  const saved = sample ? sampleSaved() : readSavedAds();
  const watchlist = sample ? sampleWatchlist() : readWatchEntries();
  const signals = sample ? sampleSignals() : adStore.readSignals().slice(0, 60);

  const campaigns = readCampaigns().map(toSummary);
  const health = sample ? sampleHealth() : await buildHealthSnapshot();
  // S03 FR-12: Product suggestions from ventures, the chosen Arcads product and the cached catalog (no network).
  const products = sample ? [{ label: SAMPLE_PRODUCT, detail: 'Sample product', source: 'arcads' as const }] : productOptions();
  const sampleSet = sample ? { campaign: sampleCampaign(), runs: sampleRuns(), catalog: sampleCatalog() } : null;
  const g = treeFor(getAppearance(), '/creative-engine') === 'glados';

  return (
    // The paper follows the app mode on <html data-mode>, which Settings owns
    // (glados-ui S00 FR-9); the global APPEARANCE_INIT_SCRIPT applies ?mode=
    // for the load and drops the retired engine-only stored mode (FR-10, FR-11).
    <div className="ae-paper relative" data-creative-engine>
      {/* Fixed full-viewport ground (SPEC S06 FR-c): never stops short of the scroll end. */}
      <div aria-hidden className="ae-ground page-ground" />
      <div className="relative">
        {/* No header tag pill: it was inert and
            repeated the breadcrumb (S04 B43, SPEC §5 C3). */}
        <div className="mb-5 flex items-center">
          <BackToAdPilot g={g} />
        </div>
        <Dashboard g={g} campaigns={campaigns} health={health} saved={saved} watchlist={watchlist} signals={signals} sample={sampleSet} products={products} renderedAt={Date.now()} />
      </div>
    </div>
  );
}
