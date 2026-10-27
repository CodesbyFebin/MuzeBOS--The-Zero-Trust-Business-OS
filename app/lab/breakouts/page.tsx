import { renderLab, type SearchParams } from '../_render';

export const dynamic = 'force-dynamic';

/** Content Lab v2, Breakouts (01 section 9). */
export default async function LabBreakoutsPage(props: { searchParams?: Promise<SearchParams> }) {
  const searchParams = (await props.searchParams) ?? {};
  return renderLab('breakouts', searchParams);
}
