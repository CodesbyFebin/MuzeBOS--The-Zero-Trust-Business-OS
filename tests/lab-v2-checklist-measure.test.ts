import { describe, expect, test } from 'vitest';
import type { LabRun, LabSource } from '@/lib/schemas';
import type { LabStore } from '@/lib/lab/store';
import { MEASURE_CHECKLIST, measureChecklist, type MeasureChecklistId } from '@/lib/lab/measure/checklist';
import { recordActorReport, verifyActorFields, ACTOR_FIELD_EXPECTATIONS } from '@/lib/lab/measure/actors';
import { emptyStore } from './helpers/lab-measure-world';

/** 04 2.1 (AC-04-1): each data-and-measure checklist item ticks from the store. */
const NOW = new Date('2026-10-10T12:00:00.000Z');
const ago = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const src = (id: string, kind: LabSource['kind'], platform: LabSource['platform']): LabSource => ({ id, kind, platform, handle: id, url: null, displayName: id, status: 'active', addedAt: ago(1000), reason: null, score: null });
const run = (over: Partial<LabRun>): LabRun => ({ id: `r-${Math.random().toString(36).slice(2, 8)}`, kind: 'scrape', apifyRunId: 'a', datasetId: 'd', actor: 'x', input: {}, status: 'succeeded', items: 1, costUsd: 0.01, dry: false, startedAt: ago(2), finishedAt: ago(1), error: null, ...over });
const ticked = (s: LabStore) => Object.entries(measureChecklist(s, NOW)).filter(([, v]) => v).map(([k]) => k).sort();

const CASES: { id: MeasureChecklistId; also?: MeasureChecklistId[]; build: (s: LabStore) => void }[] = [
  { id: 'key_apify', build: (s) => s.priors.set({ key: 'apify:plan', value: { tier: 'BRONZE' }, n: 0, supersedesDefault: false, updatedAt: NOW.toISOString() }) },
  {
    id: 'verify_actors',
    build: (s) => {
      s.sources.upsert(src('o', 'owned', 'tiktok'));
      const spec = ACTOR_FIELD_EXPECTATIONS.find((x) => x.platform === 'tiktok')!;
      recordActorReport(s, { ...verifyActorFields(spec, [{}], NOW.toISOString()), status: 'ok', missingRequired: [] }, NOW);
    },
  },
  {
    id: 'first_owned',
    build: (s) => {
      s.sources.upsert(src('o', 'owned', 'tiktok'));
      s.runs.insert(run({ input: { platform: 'tiktok', sourceIds: ['o'] } }));
      s.posts.upsert({ id: 'p', sourceId: 'o', platform: 'tiktok', externalId: 'p', url: 'u', postedAt: ago(5), caption: '', contentType: 'video', thumbnailUrl: null, mediaUrl: null, durationS: 10, isOwned: true });
    },
  },
  { id: 'cost_settles', build: (s) => s.spend.add({ runId: null, provider: 'apify', units: 1, estUsd: null, actualUsd: 0.2, dry: false, at: ago(3) }) },
  { id: 'bill_matches', build: (s) => s.priors.set({ key: 'bill_check', value: { ledger: 4.1, console: 4.15, at: NOW.toISOString() }, n: 0, supersedesDefault: false, updatedAt: NOW.toISOString() }) },
  {
    id: 'first_tracked',
    build: (s) => {
      s.sources.upsert(src('t', 'tracked', 'instagram'));
      s.runs.insert(run({ input: { platform: 'instagram', sourceIds: ['t'] } }));
    },
  },
  {
    id: 'stt_price',
    build: (s) => {
      s.priors.set({ key: 'stt_price', value: 0.006, n: 1, supersedesDefault: true, updatedAt: NOW.toISOString() });
      s.posts.upsert({ id: 'p', sourceId: 'o', platform: 'tiktok', externalId: 'p', url: 'u', postedAt: ago(5), caption: '', contentType: 'video', thumbnailUrl: null, mediaUrl: null, durationS: 10, isOwned: false });
      s.transcripts.upsert({ postId: 'p', text: 'words here', wordCount: 2, wpm: null, provider: 'whisper-1', costUsd: 0.001, status: 'done' });
    },
  },
  {
    id: 'dissect_real',
    build: (s) => {
      for (const id of ['a', 'b', 'c']) s.dissections.upsert({ postId: id, format: 'other', hookForm: 'other', emotionalTrigger: 'other', hookChannel: 'spoken', hookText: '', firstFrameText: '', structureType: 'other', beats: [], pacing: 'punchy', pillar: 'educational', ctaType: 'none', tension: null, confidences: {}, qualityNotes: '', modelId: 'claude-cli', promptVersion: 'dissect-v1.1', analysedAt: NOW.toISOString() });
    },
  },
  {
    id: 'feeds_live',
    build: (s) => {
      s.runs.insert(run({ kind: 'search', actor: 'feed:hn' }));
      s.runs.insert(run({ kind: 'search', actor: 'feed:reddit' }));
    },
  },
  { id: 'snap_installed', build: (s) => s.priors.set({ key: 'schedule', value: { label: 'x' }, n: 0, supersedesDefault: false, updatedAt: NOW.toISOString() }) },
  {
    id: 'snap_hit_rate',
    build: (s) => {
      s.sources.upsert(src('o', 'owned', 'instagram'));
      for (let i = 0; i < 3; i++) {
        const posted = NOW.getTime() - (30 + i * 5) * 3_600_000;
        s.posts.upsert({ id: `p${i}`, sourceId: 'o', platform: 'instagram', externalId: `p${i}`, url: 'u', postedAt: new Date(posted).toISOString(), caption: '', contentType: 'reel', thumbnailUrl: null, mediaUrl: null, durationS: 10, isOwned: true });
        for (const h of [1, 3, 6, 12, 24]) s.metrics.add({ postId: `p${i}`, capturedAt: new Date(posted + h * 3_600_000).toISOString(), views: 10, likes: 1, comments: 0, shares: null, saves: null });
      }
    },
  },
  {
    id: 'measures_live',
    also: ['first_tracked'],
    build: (s) => {
      s.sources.upsert(src('t', 'tracked', 'instagram'));
      s.runs.insert(run({ input: { platform: 'instagram', sourceIds: ['t'] } }));
      s.posts.upsert({ id: 'q', sourceId: 't', platform: 'instagram', externalId: 'q', url: 'u', postedAt: ago(50), caption: '', contentType: 'reel', thumbnailUrl: null, mediaUrl: null, durationS: 10, isOwned: false });
      s.measures.upsert({ postId: 'q', depth: null, breakout: 1.2, breakoutLo: 1, breakoutHi: 1.4, baselineN: 6, baselineConfidence: 'low', reach: null, velocity: null, trajectory: null, quadrant: null, isBreakout: false, computedAt: NOW.toISOString(), ages: { '24': { y: 3, ratio: 1.2, lo: 1, hi: 1.4, z: 0.3, n: 6, how: 'nearest' } } });
    },
  },
  {
    id: 'tiktok_download_price',
    build: (s) => s.priors.set({ key: 'pricing:clockworks/tiktok-scraper', value: { actorId: 'clockworks/tiktok-scraper', events: [{ name: 'video-download', title: 'Add-on: video download', flatUsd: null, tiered: { FREE: 0.0013, BRONZE: 0.001 }, primary: false, oneTime: false }] }, n: 0, supersedesDefault: false, updatedAt: NOW.toISOString() }),
  },
];

describe('04 2.1 checklist ticks (AC-04-1)', () => {
  test('an empty store ticks nothing; every item has a case', () => {
    expect(ticked(emptyStore().store)).toEqual([]);
    expect(CASES.map((c) => c.id).sort()).toEqual(MEASURE_CHECKLIST.map((c) => c.id).sort());
  });
  for (const c of CASES) {
    test(`${c.id} ticks from its rows${c.also ? ` (with ${c.also.join(', ')})` : ''}`, () => {
      const { store } = emptyStore();
      c.build(store);
      expect(ticked(store)).toEqual([c.id, ...(c.also ?? [])].sort());
    });
  }
  test('an unsettled live row older than 1 h and a bill 10% off do not tick', () => {
    const { store } = emptyStore();
    store.spend.add({ runId: null, provider: 'apify', units: 1, estUsd: null, actualUsd: null, dry: false, at: ago(3) });
    store.priors.set({ key: 'bill_check', value: { ledger: 4.5, console: 4.0 }, n: 0, supersedesDefault: false, updatedAt: NOW.toISOString() });
    expect(ticked(store)).toEqual([]);
  });
});
