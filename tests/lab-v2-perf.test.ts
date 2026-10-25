/**
 * AC-01-9: each buildPageView on the fixture world under 400 ms. The budget is asserted only on the
 * Mac mini (LAB_PERF_STRICT=1); elsewhere the timings are printed and a loose ceiling guards hangs.
 */
import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { LAB_DDL } from '@/lib/db';
import { labStore } from '@/lib/lab/store';
import { seedLabFixtures } from '@/lib/lab/fixtures';
import { buildPageView, buildSheet } from '@/lib/lab/view/build';
import { labParams } from '@/lib/lab/context';
import { LAB_PAGES, SHEET_PRECEDENCE } from '@/lib/lab/view/shared';
import { FIXTURE_IDS } from '@/lib/lab/fixtures';

const NOW = new Date('2026-10-11T15:00:00.000Z');
const flags = { configured: true, sample: true, filming: false, dry: false, dryReason: null, dryLabel: null, setupHref: '/lab?setup=keys', fixtureName: 'Sample', agentName: 'Content Lab' } as const;
const ENV = { GLADOS_TZ: 'UTC' };

function world() {
  const db = new Database(':memory:');
  db.exec(LAB_DDL);
  const store = labStore(db);
  seedLabFixtures(store, NOW);
  return store;
}

describe('AC-01-9 builder timings on the fixture world', () => {
  const store = world();
  for (const p of LAB_PAGES) {
    it(`${p.id} builds`, async () => {
      await buildPageView(p.id, store, labParams(() => null), { ...flags }, NOW, { env: ENV }); // warm
      const t0 = performance.now();
      const v = await buildPageView(p.id, store, labParams((k) => (k === 'sample' ? '1' : null)), { ...flags }, NOW, { env: ENV });
      const ms = performance.now() - t0;
      console.log(`[lab-v2-perf] ${p.id} ${ms.toFixed(0)} ms`);
      expect(v.frame.page).toBe(p.id);
      expect(ms).toBeLessThan(process.env.LAB_PERF_STRICT === '1' ? 400 : 4000);
    });
  }
  const ids: Record<string, string> = { post: FIXTURE_IDS.firstPost, event: FIXTURE_IDS.event, idea: FIXTURE_IDS.idea, script: FIXTURE_IDS.script, test: FIXTURE_IDS.test, setup: 'checklist', ask: 'tiktok breakouts this month' };
  for (const k of SHEET_PRECEDENCE) {
    it(`sheet ${k} builds`, async () => {
      const sh = await buildSheet(k, ids[k], store, labParams(() => null), { ...flags }, NOW, { env: ENV });
      expect(sh.kind).toBe(k);
      expect(sh.view).not.toBeNull();
    });
  }
});
