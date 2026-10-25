/**
 * Pure search-filter logic for the /finances hero search bar. No React, no
 * fetch — just matching over the transaction-shaped data the page already
 * has server-side, so it's cheap to unit test (tests/finances-search.test.ts)
 * and cheap to run client-side on every keystroke.
 */

export type SearchableTxn = {
  /** Who the money is with — a brand, contractor, or account label. */
  payee: string;
  description?: string;
  category?: string;
  amountUsd: number;
};

/**
 * True when `query` (trimmed, case-insensitive) matches the item's payee,
 * description, category, or dollar amount. An empty/whitespace query always
 * matches everything — that's what "empty query restores everything" means.
 */
export function matchesQuery(item: SearchableTxn, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const haystack = `${item.payee} ${item.description ?? ''} ${item.category ?? ''}`.toLowerCase();
  if (haystack.includes(q)) return true;
  // Cheap singular/plural tolerance: "deployments" should still find a
  // description that only says "deployment".
  if (q.length > 3 && q.endsWith('s') && haystack.includes(q.slice(0, -1))) return true;

  const digits = q.replace(/[^0-9]/g, '');
  if (digits.length > 0) {
    const amount = String(Math.round(Math.abs(item.amountUsd)));
    if (amount.includes(digits)) return true;
  }
  return false;
}

/** Pure filter over a list of transaction-shaped items. */
export function filterTransactions<T extends SearchableTxn>(items: T[], query: string): T[] {
  return items.filter((item) => matchesQuery(item, query));
}
