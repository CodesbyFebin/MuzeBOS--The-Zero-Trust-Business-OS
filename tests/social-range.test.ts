import { afterEach, describe, expect, test } from 'vitest';
import { channelsNetChange, netChange, rangeWindow, seriesWindow, windowPoints, SOCIAL_RANGES } from '@/lib/social-range';
import { growthAllTime, growthOver } from '@/lib/growth';
import { openDb, type GladosDb } from '@/lib/db';
import { audienceGrowthPct, audienceSeries, dmGrowthPct } from '@/lib/social';
import { EmailListSnapshotSchema } from '@/lib/schemas';

const series = [
  { date: '2026-07-01', value: 100 },
  { date: '2026-07-20', value: 120 },
  { date: '2026-08-10', value: 150 },
  { date: '2026-08-24', value: 160 },
];

describe('rangeWindow', () => {
  test('ends on the newest data date, starts N days before it, axis runs to today', () => {
    const w = rangeWindow(30, '2026-08-24', '2026-10-09');
    expect(w.start).toBe('2026-07-25');
    expect(w.end).toBe('2026-08-24');
    expect(w.axisEnd).toBe('2026-10-09');
    expect(w.stale).toBe(true);
  });

  test('fresh data (newer than 48h) is not stale; no data ends today', () => {
    expect(rangeWindow(7, '2026-10-08', '2026-10-09').stale).toBe(false);
    const empty = rangeWindow(7, null, '2026-10-09');
    expect(empty.end).toBe('2026-10-09');
    expect(empty.start).toBe('2026-10-02');
    expect(empty.stale).toBe(false);
  });

  test('"all" starts at the first point; the axis end is never before the data', () => {
    const w = rangeWindow('all', '2026-08-24', '2026-08-01', '2026-07-01');
    expect(w.start).toBe('2026-07-01');
    expect(w.axisEnd).toBe('2026-08-24');
  });
});

describe('netChange', () => {
  test('measures from the value carried in at the window start, with a stale newest date', () => {
    const w = seriesWindow(30, series, '2026-10-09'); // 07-25 .. 08-24
    expect(netChange(series, w)).toEqual({ baseline: 120, current: 160, net: 40, pct: (40 / 120) * 100 });
  });

  test('null when history does not reach the window start or has one point', () => {
    expect(netChange(series, seriesWindow(60, series, '2026-10-09'))).toBeNull(); // starts 06-25
    expect(netChange([series[0]], seriesWindow('all', [series[0]], '2026-10-09'))).toBeNull();
  });

  test('pct is null on a zero baseline, net still reported', () => {
    const z = [
      { date: '2026-07-01', value: 0 },
      { date: '2026-07-10', value: 5 },
    ];
    expect(netChange(z, seriesWindow('all', z, '2026-07-10'))).toMatchObject({ net: 5, pct: null });
  });

  test('agrees with the per-channel growth math for every range', () => {
    const pts = series.map((p) => ({ capturedAt: p.date, value: p.value }));
    for (const range of SOCIAL_RANGES) {
      const want = range === 'all' ? growthAllTime(pts) : growthOver(pts, range);
      expect(netChange(series, seriesWindow(range, series, '2026-10-09'))?.pct ?? null).toBe(want);
    }
  });

  test('windowPoints pins the carried-in baseline to the window start', () => {
    const w = seriesWindow(30, series, '2026-10-09');
    expect(windowPoints(series, w)).toEqual([
      { date: '2026-07-25', value: 120 },
      { date: '2026-08-10', value: 150 },
      { date: '2026-08-24', value: 160 },
    ]);
  });
});

let db: GladosDb | undefined;
afterEach(() => {
  db?.close();
  db = undefined;
});

describe('one helper for the tile and the chart (H18, AC03.6)', () => {
  test('audienceGrowthPct equals the chart net from the same channels, every range', () => {
    const d = openDb(':memory:');
    db = d;
    d.social.upsertAccount({ platform: 'instagram', handle: '@x', url: null, order: 1 });
    for (const [day, v] of [['2026-05-01', 30000], ['2026-07-20', 36000], ['2026-08-24', 40000]] as const) {
      d.social.insertSnapshot({ platform: 'instagram', capturedAt: day, followers: v, source: 'test' });
    }
    for (const [day, v] of [['2026-05-01', 20000], ['2026-08-24', 30000]] as const) {
      d.emailList.insertSnapshot(EmailListSnapshotSchema.parse({ capturedAt: day, subscribers: v, source: 'test' }));
    }
    const channels = audienceSeries(d).channels.map((c) => c.points);
    const today = new Date().toISOString().slice(0, 10);
    for (const range of SOCIAL_RANGES) {
      expect(audienceGrowthPct(d, range)).toBe(channelsNetChange(channels, range, today)?.pct ?? null);
    }
    // 30d window 07-25..08-24: 36000 + 20000 carried in, 70000 at the end
    expect(audienceGrowthPct(d, 30)).toBeCloseTo(((70000 - 56000) / 56000) * 100, 6);
    expect(channelsNetChange(channels, 30, today)?.net).toBe(14000);
  });

  test('a channel connected inside the window is left out of both sides', () => {
    const old = [
      { date: '2026-07-01', value: 100 },
      { date: '2026-08-24', value: 110 },
    ];
    const fresh = [{ date: '2026-08-20', value: 5000 }];
    expect(channelsNetChange([old, fresh], 30, '2026-08-24')).toMatchObject({ baseline: 100, current: 110, net: 10 });
    expect(channelsNetChange([fresh], 30, '2026-08-24')).toBeNull();
  });

  test('dmGrowthPct is null without DM history (honest, not zero)', () => {
    const d = openDb(':memory:');
    db = d;
    expect(dmGrowthPct(d, 30)).toBeNull();
  });
});
