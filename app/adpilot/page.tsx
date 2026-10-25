import { readAdpilotFile } from '@/lib/adpilot-data';
import { adStore } from '@/lib/foreplay/store';
import { readWatchEntries } from '@/lib/foreplay/watchlist';
import { readSavedAds } from '@/lib/foreplay/saved';
import { storeAdById, storeWall } from '@/lib/foreplay/wall';
import { findLinkedAd, isLinkId } from '@/lib/adpilot-links';
import { AdPilotDeck } from '@/components/adpilot/AdPilotDeck';
import { AdLibrary } from '@/components/adpilot/AdLibrary';
import { PageHeader } from '@/components/PageHeader';
import { SectionHead } from '@/components/terminal';
import Link from 'next/link';
import { readCampaigns } from '@/lib/creative-engine/store';
import { ENGINE_HREF, ENGINE_NAME_SENTENCE } from '@/lib/creative-engine/name';
import { filmingMode } from '@/lib/paths';
import { resolveForeplayKey } from '@/lib/foreplay/client';
import { Suspense } from 'react';
import { AdPilotDeckG } from '@/components/adpilot/AdPilotDeckG';
import { GButton, GPage, GSectionHeader } from '@/components/g';
import { GStyleProvider } from '@/components/system-g/style-context';
import { getAppearance } from '@/lib/appearance-server';
import { treeFor } from '@/lib/appearance';

export const dynamic = 'force-dynamic';

/**
 * AdPilot — the paid-media deck. Its accent is theme-keyed in CSS
 * ([data-adpilot] token blocks in app/globals.css): red in Console, Red and
 * White, the theme's own blue-white signal in Frost and Grey Frost. Nothing
 * outside the wrapper inherits it except the shell chrome hooks (G1). The
 * page sits on a full-page ground + dot grid that fades toward the edges.
 * Top half is the campaign command deck — campaigns arrive ONLY from the
 * ad-account sync, never a button. Bottom half is the Ad library on live
 * Foreplay data.
 */

export default function AdPilotPage({ searchParams }: { searchParams?: { ad?: string | string[] } }) {
  const { campaigns, syncedAt } = readAdpilotFile();
  const wall = storeWall(80);
  const watchlist = readWatchEntries();
  const saved = readSavedAds();
  // G2: an ?ad= outside the capped wall (a fresh launch a signal names) is looked up in the store.
  const adParam = searchParams?.ad;
  const linkedAd = isLinkId(adParam) && !findLinkedAd(adParam, [wall, saved.map((s) => s.ad)]) ? storeAdById(adParam) : null;
  const allSignals = adStore.readSignals();
  const signals = allSignals.slice(0, 60);
  const usage = adStore.readUsage();
  const meta = adStore.readMeta();

  const engineCampaigns = readCampaigns().length;
  const filming = filmingMode();
  // Honest credits (SPEC §5 C8): a count is shown only when Foreplay is keyed.
  const foreplayConfigured = !!resolveForeplayKey();
  const now = Date.now();
  const library = (
    <AdLibrary
      initialWall={wall}
      linkedAd={linkedAd}
      watchlist={watchlist}
      saved={saved}
      signals={signals}
      signalsTotal={allSignals.length}
      credits={foreplayConfigured && usage ? { remaining: usage.remaining_credits, total: usage.total_credits } : null}
      foreplayConfigured={foreplayConfigured}
      lastSyncAt={meta.lastSyncAt}
      now={now}
    />
  );

  // Two trees, one fetch (glados-ui SPEC X5). Under GladOS the page follows the
  // chosen accent (C30): no data-adpilot red, no dot grid, the kit everywhere.
  if (treeFor(getAppearance(), '/adpilot') === 'glados') {
    return (
      <GPage className="ap-g">
        <GStyleProvider>
        <GSectionHeader
          size="page"
          title="AdPilot"
          caption="Paid media"
          action={
            <GButton size="sm" href={ENGINE_HREF}>
              {ENGINE_NAME_SENTENCE}{engineCampaigns ? ` · ${engineCampaigns} campaign${engineCampaigns === 1 ? '' : 's'}` : ''}
            </GButton>
          }
        />
        <Suspense fallback={null}>
          <AdPilotDeckG campaigns={campaigns} syncedAt={syncedAt} now={now} filming={filming} />
          <section className="soc-g-sec" aria-labelledby="adpilot-intel">
            <GSectionHeader id="adpilot-intel" size={22} title="Ad intelligence" caption={`${wall.length} tracked ads`} />
            {library}
          </section>
        </Suspense>
        </GStyleProvider>
      </GPage>
    );
  }

  return (
    <div className="relative" data-adpilot>
      {/* The page ground (SPEC S06 FR-c4): the solid base is a fixed
          full-viewport layer; the dot grid scrolls with the content on an
          absolute layer that cancels main's padding exactly (px-8 pt-7 pb-16,
          wider tiers), so both run the FULL scroll length. */}
      <div aria-hidden className="ap-ground page-ground" />
      <div
        aria-hidden
        className="ap-dots pointer-events-none absolute inset-0 -mx-8 -mb-16 -mt-7 wide:-mx-10 ultra:-mx-12"
        style={{
          backgroundImage: 'radial-gradient(var(--ap-dot) 1px, transparent 1.4px)',
          backgroundSize: '26px 26px',
          maskImage: 'linear-gradient(90deg, transparent, #000 16%, #000 84%, transparent)',
          WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 16%, #000 84%, transparent)',
        }}
      />

      <div className="relative">
        <PageHeader
          eyebrow="Paid media"
          title="AdPilot"
          right={
            <Link href={ENGINE_HREF} className="rounded-full border px-3 py-1 text-[11.5px] text-os-accent transition-colors hover:bg-[var(--accent-soft)]" style={{ borderColor: 'var(--accent-line)' }}>
              {ENGINE_NAME_SENTENCE}{engineCampaigns ? ` · ${engineCampaigns} campaign${engineCampaigns === 1 ? '' : 's'}` : ''} ›
            </Link>
          }
        />

        {/* One boundary for the URL state the deck and the library read
            (?campaign=, ?ad=, ?brand=; SPEC S01 F9, G2). */}
        <Suspense fallback={null}>
          <AdPilotDeck campaigns={campaigns} syncedAt={syncedAt} now={now} filming={filming} />

        <section className="mt-12">
          <SectionHead label="Ad intelligence" count={`${wall.length} tracked ads`} />
          {library}
        </section>
        </Suspense>

      </div>
    </div>
  );
}
