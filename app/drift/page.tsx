import { PageHeader } from '@/components/PageHeader';
import { DriftRail } from '@/components/knowledge/DriftRail';
import { DriftG } from '@/components/knowledge/DriftG';
import { GPage, GSectionHeader, GTag } from '@/components/g';
import { readDriftInsights } from '@/lib/drift-store';
import { getAppearance } from '@/lib/appearance-server';
import { treeFor } from '@/lib/appearance';

export const dynamic = 'force-dynamic';

/**
 * Drift — canon-drift detection as its own surface. Claims made in incoming
 * context (calls, threads) are checked against the knowledge canon; repeated
 * contradictions surface here with the evidence on both sides and two
 * resolutions: update the canon, or draft a correction to the person
 * responsible. the operator: its own tab under the Knowledge Visualizer, not a
 * section inside it (2026-09-01).
 *
 * Two trees, one read (glados-ui SPEC X5, S05 F05.40 to F05.43).
 */
export default function DriftPage() {
  const insights = readDriftInsights();
  if (treeFor(getAppearance(), '/drift') === 'glados') {
    const open = insights.filter((i) => i.state !== 'resolved').length;
    return (
      <GPage className="kg-page">
        <GSectionHeader
          size="page"
          title="Drift"
          caption="Claims from calls and threads, checked against the canon. A contradiction that repeats across independent sources shows here with the evidence on both sides."
          action={insights.length > 0 ? <GTag tone={open > 0 ? 'warn' : 'ok'}>{open} open</GTag> : undefined}
        />
        <DriftG insights={insights} />
      </GPage>
    );
  }
  return (
    <div>
      <PageHeader eyebrow="Knowledge layer" title="Drift" />
      <DriftRail insights={insights} />
    </div>
  );
}
