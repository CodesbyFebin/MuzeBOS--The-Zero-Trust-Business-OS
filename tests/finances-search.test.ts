import { describe, expect, test } from 'vitest';
import { matchesQuery, filterTransactions, type SearchableTxn } from '@/app/finances/search';

const northwind: SearchableTxn = {
  payee: 'Northwind Logistics',
  description: 'Northwind Logistics — deployment retainer',
  amountUsd: 4_800,
};
const agiAcademy: SearchableTxn = {
  payee: 'Venture B',
  description: 'Venture B — cohort 14 enrollment',
  amountUsd: 1_299,
};
const wiseContractor: SearchableTxn = {
  payee: 'Deployment engineering',
  description: 'Deployment engineering — sprint payment',
  amountUsd: 7_800,
};
const items = [northwind, agiAcademy, wiseContractor];

describe('matchesQuery', () => {
  test('empty or whitespace-only query matches everything', () => {
    expect(matchesQuery(northwind, '')).toBe(true);
    expect(matchesQuery(northwind, '   ')).toBe(true);
  });

  test('matches on payee, case-insensitively', () => {
    expect(matchesQuery(northwind, 'northwind')).toBe(true);
    expect(matchesQuery(northwind, 'NORTHWIND')).toBe(true);
    expect(matchesQuery(agiAcademy, 'northwind')).toBe(false);
  });

  test('matches on description', () => {
    expect(matchesQuery(agiAcademy, 'cohort 14')).toBe(true);
    expect(matchesQuery(agiAcademy, 'enrollment')).toBe(true);
  });

  test('matches on category', () => {
    const item: SearchableTxn = { payee: 'Some Brand', category: 'Contractor payouts', amountUsd: 100 };
    expect(matchesQuery(item, 'contractor')).toBe(true);
  });

  test('matches on a dollar amount substring', () => {
    expect(matchesQuery(northwind, '4800')).toBe(true);
    expect(matchesQuery(northwind, '$4,800')).toBe(true);
    expect(matchesQuery(agiAcademy, '4800')).toBe(false);
  });

  test('tolerates a simple plural query against a singular description', () => {
    expect(matchesQuery(wiseContractor, 'deployments')).toBe(true);
    expect(matchesQuery(northwind, 'deployments')).toBe(true);
  });

  test('no match returns false', () => {
    expect(matchesQuery(northwind, 'zzzznotarealterm')).toBe(false);
  });
});

describe('filterTransactions', () => {
  test('empty query restores every item, in order', () => {
    expect(filterTransactions(items, '')).toEqual(items);
  });

  test('filters down to only matching items', () => {
    const result = filterTransactions(items, 'deployment');
    expect(result).toEqual([northwind, wiseContractor]);
  });

  test('a query matching nothing returns an empty array, not the original list', () => {
    expect(filterTransactions(items, 'zzzznotarealterm')).toEqual([]);
  });
});
