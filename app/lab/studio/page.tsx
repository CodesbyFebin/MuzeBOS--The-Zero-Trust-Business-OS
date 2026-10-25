import { renderLab, type SearchParams } from '../_render';

export const dynamic = 'force-dynamic';

/** Content Lab v2, Studio (01 section 11). */
export default async function LabStudioPage({ searchParams = {} }: { searchParams?: SearchParams }) {
  return renderLab('studio', searchParams);
}
