import { renderLab, type SearchParams } from '../_render';

export const dynamic = 'force-dynamic';

/** Content Lab v2, Ledger (01 section 12). */
export default async function LabLedgerPage({ searchParams = {} }: { searchParams?: SearchParams }) {
  return renderLab('ledger', searchParams);
}
