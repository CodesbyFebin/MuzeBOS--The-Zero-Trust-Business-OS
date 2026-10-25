import { afterEach, describe, expect, test, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

vi.mock('@/lib/lab/ledger/deps', async (importOriginal) => (await import('./helpers/lab-measure-ref')).withMeasureFallback(await importOriginal()));
const google = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@/lib/lab/setup/oauth-google', () => ({
  googleAccessToken: async () => {
    google.calls++;
    return 'ya29.test-token';
  },
}));

import type { LabBeat, LabRetention } from '@/lib/schemas';
import { setLabFetchImpl } from '@/lib/lab/net';
import { seedLabFixtures } from '@/lib/lab/fixtures';
import { awr, beatRetention, retentionByBeatType, retentionByHookForm } from '@/lib/lab/ledger/retention/map';
import { curveQuery, summaryQuery } from '@/lib/lab/ledger/retention/youtube';
import { insightsUrl, parseInsights } from '@/lib/lab/ledger/retention/instagram';
import { dueReads, retentionDue } from '@/lib/lab/ledger/retention/due';
import { runLedgerCycle } from '@/lib/lab/ledger/job';
import { DAY, addPost, addSource, iso, memStore } from './helpers/lab-ledger-world';

const NOW = Date.parse('2026-10-11T12:00:00.000Z');
const ENV = ['LAB_DRY', 'LAB_YT_REFRESH_TOKEN', 'LAB_YT_CHANNEL_ID', 'LAB_IG_ACCESS_TOKEN', 'LAB_IG_USER_ID', 'LAB_IG_TOKEN_EXPIRES_AT'];
afterEach(() => {
  for (const k of ENV) delete process.env[k];
  setLabFetchImpl(null);
  google.calls = 0;
});

const ret = (o: Partial<LabRetention>): LabRetention => ({
  postId: 'p', platform: 'youtube', source: 'fixture', capturedAt: iso(NOW), ageH: 168, partial: false, curve: null, views: null, avgViewDurationS: null, avgViewPct: null,
  reach: null, likes: null, comments: null, saved: null, shares: null, totalInteractions: null, avgWatchTimeMs: null, totalWatchTimeMs: null, skipRate: null, raw: {}, dry: false, ...o,
});

describe('YouTube query (06 9.2)', () => {
  test('AC-06-36 the report query string matches 9.2 exactly', () => {
    expect(curveQuery('dQw4w9WgXcQ', '2026-10-01', '2026-10-11')).toBe(
      'https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=2026-10-01&endDate=2026-10-11&metrics=audienceWatchRatio,relativeRetentionPerformance&dimensions=elapsedVideoTimeRatio&filters=video==dQw4w9WgXcQ',
    );
    expect(summaryQuery('dQw4w9WgXcQ', '2026-10-01', '2026-10-11')).toBe(
      'https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=2026-10-01&endDate=2026-10-11&metrics=views,averageViewDuration,averageViewPercentage&filters=video==dQw4w9WgXcQ',
    );
    expect(insightsUrl('1789')).toBe('https://graph.instagram.com/v25.0/1789/insights?metric=reach,views,likes,comments,saved,shares,total_interactions,ig_reels_avg_watch_time,ig_reels_video_view_total_time,reels_skip_rate');
  });

  test('Instagram insights: absent metrics are null, not 0', () => {
    const i = parseInsights({ data: [{ name: 'reach', values: [{ value: 4200 }] }, { name: 'reels_skip_rate', values: [{ value: 38 }] }] });
    expect(i.reach).toBe(4200);
    expect(i.skipRate).toBe(38);
    expect(i.shares).toBeNull();
  });
});

describe('beat mapping (06 9.3)', () => {
  const curve = [{ x: 0.01, awr: 1.0, rrp: 0.5 }, { x: 0.1, awr: 0.62, rrp: 0.5 }, { x: 0.4, awr: 0.44, rrp: 0.6 }, { x: 1, awr: 0.3, rrp: 0.4 }];
  const beats: LabBeat[] = [{ type: 'hook', startPct: 0, endPct: 10, summary: '' }, { type: 'demo', startPct: 10, endPct: 40, summary: '' }];

  test('AC-06-37 hookHold 0.62, demo keep 0.710, dropPer10 0.06', () => {
    expect(awr(curve, 0)).toBe(1); // under 0.01 uses the 0.01 point
    const r = beatRetention(ret({ curve }), beats, 60);
    expect(r.hookHold).toBeCloseTo(0.62, 10);
    expect(r.beats[1].keep).toBeCloseTo(0.71, 3);
    expect(r.beats[1].dropPer10).toBeCloseTo(0.06, 10);
    expect(r.steepestBeat).toBe(0); // the hook loses 0.38 per tenth
  });

  test('AC-06-38 Instagram skip rate 38 gives hookHold 0.62', () => {
    const r = beatRetention(ret({ platform: 'instagram', skipRate: 38, avgWatchTimeMs: 15_000 }), beats, 30);
    expect(r.hookHold).toBeCloseTo(0.62, 10);
    expect(r.avgPctWatched).toBeCloseTo(0.5, 10);
  });

  test('AC-06-39 retentionByHookForm under n 5 has enough false; at 5 it is enough', () => {
    const s = memStore();
    addSource(s, 'own');
    for (let i = 0; i < 5; i++) {
      addPost(s, { id: `r${i}`, source: 'own', postedAt: NOW - 10 * DAY });
      s.dissections.upsert({ postId: `r${i}`, format: 'talking_head', hookForm: 'results_first', emotionalTrigger: 'curiosity', hookChannel: 'spoken', hookText: '', firstFrameText: '', structureType: 'tutorial', beats, pacing: 'punchy', pillar: 'educational', ctaType: 'none', tension: null, confidences: {}, qualityNotes: '', modelId: 'x', promptVersion: 'x', analysedAt: iso(NOW) });
      s.retention.add(ret({ postId: `r${i}`, platform: 'instagram', skipRate: 30 + i }));
      if (i === 3) {
        const four = retentionByHookForm(s, 'instagram');
        expect(four).toEqual([expect.objectContaining({ hookForm: 'results_first', n: 4, enough: false })]);
      }
    }
    expect(retentionByHookForm(s, 'instagram')[0]).toMatchObject({ n: 5, enough: true, vsAll: 1 });
    expect(retentionByBeatType(s)).toEqual([]); // no YouTube curves
  });
});

describe('retentionDue and the cycle (06 9.2, 7.4, 14)', () => {
  test('AC-06-35 a full runLedgerCycle under LAB_DRY=1 makes no labFetch call and never calls googleAccessToken', async () => {
    process.env.LAB_DRY = '1';
    process.env.LAB_YT_REFRESH_TOKEN = 'refresh';
    process.env.LAB_YT_CHANNEL_ID = 'UCtest';
    process.env.LAB_IG_ACCESS_TOKEN = 'igtoken';
    process.env.LAB_IG_USER_ID = '1';
    const calls: string[] = [];
    setLabFetchImpl(async (url) => {
      calls.push(String(url));
      return new Response('{}');
    });
    const s = memStore();
    seedLabFixtures(s, new Date(NOW));
    const { runs } = await runLedgerCycle(s, { now: new Date(NOW), dry: true });
    expect(calls).toEqual([]);
    expect(google.calls).toBe(0);
    expect(runs.map((r) => r.kind).sort()).toEqual(['backtest', 'grade', 'oauth_refresh', 'retention', 'retention']);
    expect(runs.every((r) => r.dry && r.costUsd === 0)).toBe(true);
    expect(runs.find((r) => r.kind === 'backtest')!.error).toBeNull();
    expect(runs.find((r) => r.kind === 'grade')!.error).toBeNull();
    // dry retention rows are fixtures with dry 1
    expect(s.retention.all().filter((r) => r.source === 'fixture' && r.dry).length).toBeGreaterThan(0);
  });

  test('live Instagram path: reads through labFetch with a bearer header; the token never lands in a row', async () => {
    process.env.LAB_IG_ACCESS_TOKEN = 'IGSECRET123';
    process.env.LAB_IG_USER_ID = '1';
    const s = memStore();
    addSource(s, 'own');
    addPost(s, { id: 'reel1', source: 'own', postedAt: NOW - 4 * DAY });
    const seen: { url: string; auth: string | null }[] = [];
    setLabFetchImpl(async (url, init) => {
      seen.push({ url: String(url), auth: new Headers(init?.headers).get('authorization') });
      if (String(url).includes('/me/media')) return new Response(JSON.stringify({ data: [{ id: '1789', media_product_type: 'REELS', shortcode: 'ext-reel1', timestamp: iso(NOW - 4 * DAY) }] }));
      return new Response(JSON.stringify({ data: [{ name: 'reach', values: [{ value: 4200 }] }, { name: 'shares', values: [{ value: 63 }] }, { name: 'reels_skip_rate', values: [{ value: 38 }] }] }));
    });
    expect(dueReads(s, 'instagram', new Date(NOW)).map((d) => d.post.id)).toEqual(['reel1']);
    const r = await retentionDue(s, new Date(NOW), { dry: false });
    expect(r.instagram).toMatchObject({ state: 'ok', written: 1 });
    expect(r.youtube.state).toBe('skipped');
    expect(seen.every((x) => x.auth === 'Bearer IGSECRET123' && !x.url.includes('IGSECRET123'))).toBe(true);
    const row = s.retention.forPost('reel1')[0];
    expect(row).toMatchObject({ source: 'ig_graph', reach: 4200, shares: 63, skipRate: 38, dry: false });
    expect(JSON.stringify([s.retention.all(), s.runs.recent(50)])).not.toContain('IGSECRET123');
    // the read covers its ages: not due again
    expect(dueReads(s, 'instagram', new Date(NOW))).toEqual([]);
  });

  test('YouTube is skipped when the connected channel is not an owned source', async () => {
    process.env.LAB_YT_REFRESH_TOKEN = 'refresh';
    process.env.LAB_YT_CHANNEL_ID = 'UCnotmine';
    setLabFetchImpl(async () => { throw new Error('no network in tests'); });
    const s = memStore();
    addSource(s, 'yt', { platform: 'youtube' });
    addPost(s, { id: 'v1', source: 'yt', platform: 'youtube', contentType: 'video', postedAt: NOW - 4 * DAY });
    const r = await retentionDue(s, new Date(NOW), { dry: false });
    expect(r.youtube.state).toBe('skipped');
    expect(r.youtube.reason).toBe('Connected channel is not one of your owned YouTube sources. Retention will not match any post.');
    expect(google.calls).toBe(0);
  });
});

describe('no OAuth surface in the ledger lane (AC-06-33)', () => {
  test('no oauth route, cookie or LAB_YT_/LAB_IG_ write; env read only through resolveCred', () => {
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : [path.join(d, f)]));
    const files = [
      ...walk(path.join(process.cwd(), 'lib/lab/ledger')),
      ...['ledger', 'predictions', 'tests', 'planner', 'retention'].flatMap((d) => walk(path.join(process.cwd(), 'app/api/lab', d))),
    ];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/app\/api\/lab\/oauth|lab_oauth_/);
      expect(src, f).not.toMatch(/upsertEnvLocal|removeEnvLocal/);
      expect(src, f).not.toMatch(/process\.env\.LAB_(YT|IG)_/);
      expect(src, f).not.toMatch(/import[^;]*gatedCall/); // the ledger never spends (06 14)
    }
  });
});
