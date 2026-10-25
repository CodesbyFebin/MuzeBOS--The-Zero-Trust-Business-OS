import { permanentRedirect } from 'next/navigation';
import { legacyRedirect, renderLab, type SearchParams } from './_render';

export const dynamic = 'force-dynamic';

/**
 * Content Lab v2, Today (01 section 7). v1 `?tab=` links redirect (308) to their v2 route with every
 * other param kept (2.4); `?post= ?idea= ?script=` keep working as sheets.
 */
export default async function LabTodayPage({ searchParams = {} }: { searchParams?: SearchParams }) {
  const to = legacyRedirect(searchParams);
  if (to) permanentRedirect(to);
  return renderLab('today', searchParams);
}
