import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { LAB_DDL, migrateLabV2 } from '@/lib/db';
import { labStore } from '@/lib/lab/store';
import { invalidateModeCache } from '@/lib/paths';
import { setLabFetchImpl } from '@/lib/lab/net';
import { seedLabFixtures } from '@/lib/lab/fixtures';
import { setBinProbe } from '@/lib/lab/setup/health';
import { setupView } from '@/lib/lab/setup/view';
import { BRAND } from '@/lib/brand';
import { estimatePlan } from '@/lib/lab/setup/estimate';
import { predictGates } from '@/lib/lab/setup/gates';

const fresh = () => {
  const db = new Database(':memory:');
  db.exec(LAB_DDL);
  migrateLabV2(db);
  return labStore(db);
};
const KEYS = ['LAB_DRY', 'GLADOS_ENV_LOCAL', 'GLADOS_MODE_FILE', 'DEMO_MODE', 'APIFY_API_TOKEN', 'OPENAI_API_KEY', 'GLADOS_AUTOMATION_DIR', 'GLADOS_DATA_DIR', 'LAB_YT_CLIENT_ID', 'LAB_IG_APP_ID', 'PRODUCTHUNT_TOKEN', 'GITHUB_TOKEN', 'LAB_IG_ACCESS_TOKEN', 'LAB_YT_REFRESH_TOKEN', 'LAB_YT_CLIENT_SECRET', 'LAB_IG_APP_SECRET'] as const;
let saved: Record<string, string | undefined>;
let fetchCalls: string[];
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-view-'));
  process.env.GLADOS_ENV_LOCAL = path.join(dir, '.env.local');
  // blank = deliberately unset, so no machine credential file configures anything
  fs.writeFileSync(process.env.GLADOS_ENV_LOCAL, ['APIFY_API_TOKEN', 'OPENAI_API_KEY', 'LAB_YT_CLIENT_ID', 'LAB_YT_CLIENT_SECRET', 'LAB_IG_APP_ID', 'LAB_IG_APP_SECRET', 'LAB_IG_ACCESS_TOKEN', 'LAB_YT_REFRESH_TOKEN', 'PRODUCTHUNT_TOKEN', 'GITHUB_TOKEN'].map((k) => `${k}=`).join('\n') + '\n');
  process.env.GLADOS_MODE_FILE = path.join(dir, '.glados-mode');
  process.env.GLADOS_AUTOMATION_DIR = path.join(dir, 'automation');
  process.env.DEMO_MODE = '0';
  invalidateModeCache();
  fetchCalls = [];
  setLabFetchImpl(async (u) => {
    fetchCalls.push(String(u));
    throw new Error('no network in a page render');
  });
  setBinProbe(() => true);
});
afterEach(() => {
  for (const k of KEYS) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]));
  setLabFetchImpl(null);
  setBinProbe(null);
  invalidateModeCache();
});

const NOW = new Date('2026-10-12T03:00:00.000Z');

describe('AC-08-6: the blank Setup view', () => {
  test('no keys: step 1 todo, every key row not_configured or needs_connect (claude_cli connected or error), meters at $0.00', () => {
    const v = setupView(fresh(), { now: NOW, dry: false });
    expect(v.checklist.steps[0]).toMatchObject({ id: 'key_apify', state: 'todo' });
    expect(v.checklist.complete).toBe(false);
    for (const k of v.keys) {
      if (k.id === 'claude_cli') expect(['connected', 'error']).toContain(k.state);
      else expect(['not_configured', 'needs_connect'], k.id).toContain(k.state);
    }
    for (const p of v.spend.providers) {
      expect(`$${(p.spent + p.reserved).toFixed(2)}`).toBe('$0.00');
      for (const l of p.lines) expect(`$${(l.spent + l.reserved).toFixed(2)}`).toBe('$0.00');
    }
    expect(v.spend.monthTotal).toBe(0);
    expect(v.focus).toBe('checklist');
    // vitest runs as the default brand (the FounderOS client build): no agent label, the cron line
    if (BRAND.id !== 'glados') expect(v.schedule).toMatchObject({ installed: false, label: 'Runs when lab-sync tick is called. Call it every 15 minutes from cron or launchd.', agentLabel: null });
    else expect(v.schedule).toMatchObject({ installed: false, label: 'Not scheduled yet', agentLabel: 'glados.agent.lab' });
    expect(v.schedule.jobs).toHaveLength(24);
    expect(v.brand).toMatchObject({ name: BRAND.name, isClient: BRAND.id !== 'glados' });
  });

  test('AC-08-1: not_configured rows carry Set up; the required Apify row is one of them', () => {
    const v = setupView(fresh(), { now: NOW, dry: false });
    const apify = v.keys.find((k) => k.id === 'apify')!;
    expect(apify).toMatchObject({ required: true, state: 'not_configured', action: { label: 'Set up' } });
    for (const k of v.keys.filter((x) => x.state === 'not_configured')) expect(k.action.label, k.id).toBe('Set up');
  });

  test('AC-08-9 / AC-09-30: a render makes zero fetch calls; with no Apify key the plan prices from RECORDED_PRICES, labelled assumed', () => {
    const store = fresh();
    store.sources.upsert({ id: 't1', kind: 'tracked', platform: 'instagram', handle: 'sample_creator', url: null, displayName: 'Sample', status: 'active', addedAt: '2026-10-01T00:00:00Z', reason: null, score: null });
    const v = setupView(store, { now: NOW, dry: false });
    expect(fetchCalls).toEqual([]);
    expect(v.planner.tier.source).toBe('assumed');
    expect(Object.values(v.planner.books).every((b) => b.source === 'recorded')).toBe(true);
    const plan = estimatePlan(v.planner, v.planner.current);
    expect(plan.label).toBe("Free-plan prices. Paste your Apify key to use your plan's prices.");
    expect(plan.month.point).toBeGreaterThan(0);
    // the browser recomputes the gates from the same inputs
    expect(predictGates(v.planner.rates, v.planner.current, { casesTopFamily: 0, casesWithTopValue: 0, pairs24h: { instagram: 0, tiktok: 0, youtube: 0, linkedin: 0, twitter: 0 }, matchedPerCreator: {}, activeTracked: 0 }, NOW, null).length).toBeGreaterThan(0);
  });

  test('the sample world builds every section, shows sample key rows and no network', () => {
    const store = fresh();
    seedLabFixtures(store, NOW);
    const v = setupView(store, { now: NOW, sample: true, readOnly: true });
    expect(fetchCalls).toEqual([]);
    expect(v.mode).toMatchObject({ sample: true, readOnly: true });
    expect(v.checklist.steps.every((s) => s.state === 'skipped')).toBe(true);
    expect(v.keys.find((k) => k.id === 'apify')!.state).toBe('connected');
    expect(v.schedule.jobs.every((j) => j.state === 'sample')).toBe(true);
    expect(v.sources.watch).toHaveLength(12);
    expect(v.spend.providers.find((p) => p.provider === 'apify')!.spent).toBeGreaterThan(0);
    expect(v.forecastRecord.n.runCost).toBeGreaterThanOrEqual(5);
    expect(JSON.stringify(v)).not.toMatch(/apify_api_[A-Za-z0-9]{6,}/);
  });
});
