import { getDb } from '@/lib/data';
import { trakyoKey } from '@/lib/connectors/trakyo';
import { foMode, sampleLeadMagnets } from '@/lib/fo-sample';
import { setupHrefFor } from '@/lib/integrations-catalog';
import { buildLeadMagnetsPage } from '@/lib/lead-magnets';
import { LeadMagnetStatusSchema } from '@/lib/schemas';
import { getAppearance } from '@/lib/appearance-server';
import { treeFor } from '@/lib/appearance';
import { LeadMagnetsG } from '@/components/lead-magnets/LeadMagnetsG';
import { LeadMagnetsClassic } from '@/components/lead-magnets/LeadMagnetsClassic';
import { LeadMagnetsLegacy } from '@/components/lead-magnets/LeadMagnetsLegacy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * /lead-magnets (founderos-ui pages/lead-magnets.md; FO's /content/lead-magnets
 * 308s here, next.config.mjs). SQLite only: no connector call on render. One
 * view model feeds every tree. `?status=` filters; `?sample=1` previews on a
 * blank install; Filming shows the badged fixture.
 */
export default async function LeadMagnetsPage({ searchParams = {} }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const all = getDb().leadMagnets.all();
  const sample = searchParams.sample === '1' ? '?sample=1' : '';
  const mode = foMode(`http://localhost/lead-magnets${sample}`, all.length === 0);
  const rawStatus = typeof searchParams.status === 'string' ? LeadMagnetStatusSchema.safeParse(searchParams.status) : null;
  const filter = rawStatus?.success ? rawStatus.data : null;
  const page = buildLeadMagnetsPage(mode === 'live' ? all : sampleLeadMagnets(), {
    filter,
    mode,
    trakyoConfigured: mode === 'live' && Boolean(trakyoKey()),
    trakyoSetupHref: setupHrefFor('trakyo'),
  });
  const tree = treeFor(getAppearance(), '/lead-magnets');
  if (tree === 'glados') return <LeadMagnetsG page={page} />;
  if (tree === 'legacy') return <LeadMagnetsLegacy page={page} />;
  return <LeadMagnetsClassic page={page} />;
}
