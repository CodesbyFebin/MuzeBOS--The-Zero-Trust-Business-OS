import { renderLab, type SearchParams } from '../_render';

export const dynamic = 'force-dynamic';

/** Content Lab v2, Creatorverse: every creator the Lab follows as one 3D network, sized by audience. */
export default async function LabCreatorversePage({ searchParams = {} }: { searchParams?: SearchParams }) {
  return renderLab('creatorverse', searchParams);
}
