import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { LAB_DDL } from '@/lib/db';
import { labStore } from '@/lib/lab/store';
import { invalidateModeCache } from '@/lib/paths';
import { loadPriceBook, recordApifyPlan, refreshPriceBooks, resolveTier } from '@/lib/lab/setup/pricing';
import type { FetchLike } from '@/lib/lab/apify-client';

/** The live GET /v2/acts/apify~instagram-post-scraper shape (09.1.1), trimmed to what the parser reads. */
const IG_POST_ACT = {
  data: {
    id: 'nH2AHrwxeTRJoN5hX',
    name: 'instagram-post-scraper',
    username: 'apify',
    defaultRunOptions: { build: 'latest', timeoutSecs: 604800, memoryMbytes: 1024 },
    pricingInfos: [
      { pricingModel: 'PRICE_PER_DATASET_ITEM', startedAt: '2024-01-01T00:00:00.000Z', pricePerUnitUsd: 0.0023 },
      {
        pricingModel: 'PAY_PER_EVENT',
        startedAt: '2026-10-07T00:00:00.000Z',
        apifyMarginPercentage: 0.2,
        minimalMaxTotalChargeUsd: 0.005,
        pricingPerEvent: {
          actorChargeEvents: {
            post: { eventTitle: 'Post', eventDescription: 'A post', isPrimaryEvent: true, eventTieredPricingUsd: { FREE: { tieredEventPriceUsd: 0.0017 }, BRONZE: { tieredEventPriceUsd: 0.0015 }, SILVER: { tieredEventPriceUsd: 0.0012 }, GOLD: { tieredEventPriceUsd: 0.001 } } },
            'post-details': { eventTitle: 'Post details', eventDescription: 'Detailed data', eventTieredPricingUsd: { FREE: { tieredEventPriceUsd: 0.001 }, BRONZE: { tieredEventPriceUsd: 0.0008 }, GOLD: { tieredEventPriceUsd: 0.0006 } } },
            'music-data': { eventTitle: 'Add-on: music data', eventDescription: 'Music', eventTieredPricingUsd: { FREE: { tieredEventPriceUsd: 0.007 }, BRONZE: { tieredEventPriceUsd: 0.006 }, GOLD: { tieredEventPriceUsd: 0.004 } } },
          },
        },
      },
    ],
  },
};

const fresh = () => {
  const db = new Database(':memory:');
  db.exec(LAB_DDL);
  return labStore(db);
};
const NOW = new Date('2026-10-11T12:00:00.000Z');

const KEYS = ['LAB_DRY', 'GLADOS_ENV_LOCAL', 'GLADOS_MODE_FILE', 'DEMO_MODE'] as const;
let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-pricing-'));
  process.env.GLADOS_ENV_LOCAL = path.join(dir, '.env.local');
  process.env.GLADOS_MODE_FILE = path.join(dir, '.glados-mode');
  process.env.DEMO_MODE = '0';
  invalidateModeCache();
});
afterEach(() => {
  for (const k of KEYS) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]));
  invalidateModeCache();
});

function fakeFetch(calls: string[]): FetchLike {
  return async (url, init) => {
    calls.push(url);
    expect(init?.headers?.Authorization).toBeUndefined(); // no token is ever sent
    if (url.endsWith('/acts/apify~instagram-post-scraper')) return { ok: true, status: 200, json: async () => IG_POST_ACT, text: async () => '' };
    return { ok: false, status: 503, json: async () => ({}), text: async () => '' };
  };
}

describe('AC-09-5: refreshPriceBooks', () => {
  test('writes pricing:apify/instagram-post-scraper with 3 events and minMaxTotalChargeUsd 0.005; failures are listed', async () => {
    const store = fresh();
    const calls: string[] = [];
    const out = await refreshPriceBooks(store, NOW, fakeFetch(calls));
    expect(out.refreshed).toEqual(['apify/instagram-post-scraper']);
    expect(out.failed.length).toBeGreaterThan(0);
    const book = store.priors.get('pricing:apify/instagram-post-scraper')!.value as { events: unknown[]; minMaxTotalChargeUsd: number; source: string; defaultMemoryMb: number };
    expect(book.events).toHaveLength(3);
    expect(book.minMaxTotalChargeUsd).toBe(0.005);
    expect(book.source).toBe('live');
    expect(book.defaultMemoryMb).toBe(1024);
    expect(calls.every((u) => u.startsWith('https://api.apify.com/v2/acts/'))).toBe(true);
  });
  test('a book under 24 h old is not refetched', async () => {
    const store = fresh();
    await refreshPriceBooks(store, NOW, fakeFetch([]));
    const calls: string[] = [];
    await refreshPriceBooks(store, new Date(NOW.getTime() + 3_600_000), fakeFetch(calls));
    expect(calls).not.toContain('https://api.apify.com/v2/acts/apify~instagram-post-scraper');
    const later: string[] = [];
    await refreshPriceBooks(store, new Date(NOW.getTime() + 25 * 3_600_000), fakeFetch(later));
    expect(later).toContain('https://api.apify.com/v2/acts/apify~instagram-post-scraper');
  });
  test('in dry no fetch is called', async () => {
    process.env.LAB_DRY = '1';
    const calls: string[] = [];
    expect(await refreshPriceBooks(fresh(), NOW, fakeFetch(calls))).toEqual({ refreshed: [], failed: [] });
    expect(calls).toEqual([]);
  });
});

describe('loadPriceBook and resolveTier', () => {
  test('recorded before any fetch, live within 24 h, cached after', async () => {
    const store = fresh();
    expect(loadPriceBook(store, 'apify/instagram-post-scraper', NOW).source).toBe('recorded');
    await refreshPriceBooks(store, NOW, fakeFetch([]));
    expect(loadPriceBook(store, 'apify/instagram-post-scraper', NOW).source).toBe('live');
    expect(loadPriceBook(store, 'apify/instagram-post-scraper', new Date(NOW.getTime() + 30 * 3_600_000)).source).toBe('cached');
  });
  test('tier: assumed FREE until users/me is recorded, then the account tier', () => {
    const store = fresh();
    expect(resolveTier(store)).toEqual({ tier: 'FREE', planId: null, source: 'assumed', checkedAt: null });
    recordApifyPlan(store, { data: { id: 'u1', plan: { id: 'STARTER', tier: 'BRONZE', maxConcurrentActorRuns: 32 } } }, NOW);
    expect(resolveTier(store)).toMatchObject({ tier: 'BRONZE', planId: 'STARTER', source: 'account' });
  });
});
