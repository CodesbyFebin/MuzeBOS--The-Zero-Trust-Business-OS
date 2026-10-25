import { renderLab, type SearchParams } from '../_render';

export const dynamic = 'force-dynamic';

/** Content Lab v2, Radar (01 section 8). */
export default async function LabRadarPage({ searchParams = {} }: { searchParams?: SearchParams }) {
  return renderLab('radar', searchParams);
}
