import { UsageClassic } from '@/components/usage/UsageClassic';
import { UsageG } from '@/components/usage/UsageG';
import { UsageLegacy } from '@/components/usage/UsageLegacy';
import { getAppearance } from '@/lib/appearance-server';
import { treeFor } from '@/lib/appearance';
import { buildUsagePayload } from '@/lib/usage-payload';

export const dynamic = 'force-dynamic';

/**
 * Usage (pages/usage.md): token burn per plan, model, lane and machine,
 * against official provider gauges only. One server read (the same payload
 * GET /api/usage serves, through the reader's 60 s cache) feeds every tree;
 * the trees then poll the API every 10 s while visible. Off on demo and
 * filming instances, where nothing under the home directory is read.
 */
export default async function UsagePage({ searchParams = {} }: { searchParams?: { range?: string; sample?: string } }) {
  const q = new URLSearchParams();
  if (searchParams.range) q.set('range', searchParams.range);
  if (searchParams.sample) q.set('sample', searchParams.sample);
  const now = Date.now();
  const payload = await buildUsagePayload({
    url: `http://localhost/usage?${q}`,
    now: new Date(now),
  });
  const sample = searchParams.sample === '1';
  // Trees fork on the style (glados-ui SPEC X5), every one on the same payload and view.
  const tree = treeFor(getAppearance(), '/usage');
  if (tree === 'glados') return <UsageG initial={payload} initialNow={now} sample={sample} />;
  if (tree === 'legacy') return <UsageLegacy initial={payload} initialNow={now} sample={sample} />;
  return <UsageClassic initial={payload} initialNow={now} sample={sample} />;
}
