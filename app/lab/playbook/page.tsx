import { renderLab, type SearchParams } from '../_render';

export const dynamic = 'force-dynamic';

/** Content Lab v2, Playbook (01 section 10). */
export default async function LabPlaybookPage({ searchParams = {} }: { searchParams?: SearchParams }) {
  return renderLab('playbook', searchParams);
}
