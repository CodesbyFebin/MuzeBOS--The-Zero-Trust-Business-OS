import { renderLab, type SearchParams } from '../_render';

export const dynamic = 'force-dynamic';

/** Content Lab v2, Breakouts (01 section 9). */
export default async function LabBreakoutsPage({ searchParams = {} }: { searchParams?: SearchParams }) {
  return renderLab('breakouts', searchParams);
}
