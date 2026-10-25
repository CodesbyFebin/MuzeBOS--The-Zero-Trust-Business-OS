import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { audienceChartModel, fmtPct, MAX_MARKS, parseRange, stripValues } from '@/lib/social-view';
import { channelsNetChange } from '@/lib/social-range';

const read = (p: string) => readFileSync(p, 'utf8');

const day = (base: string, n: number) => new Date(Date.parse(`${base}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const series = (start: string, days: number, from: number, step: number) => Array.from({ length: days }, (_, i) => ({ date: day(start, i), value: from + i * step }));

describe('social view model (S03 F4, F5)', () => {
  test('parseRange falls back to 30 days', () => {
    expect(parseRange('7')).toBe(7);
    expect(parseRange('all')).toBe('all');
    expect(parseRange('nope')).toBe(30);
    expect(parseRange(null)).toBe(30);
  });

  test('a stale sync still plots: carried tail, stale flag, net equals the hero helper (AC03.5, AC03.6)', () => {
    const a = series('2026-06-01', 85, 1000, 10); // ends 2026-08-24
    const today = '2026-10-09';
    for (const range of [7, 30, 60, 'all'] as const) {
      const m = audienceChartModel({ audience: a, channels: [a], postDays: [], range, today });
      expect(m.values.some((v) => v != null)).toBe(true);
      expect(m.stale).toBe(true);
      expect(m.carried.at(-1)).toBe(true);
      expect(m.net?.net).toBe(channelsNetChange([a], range, today)?.net);
      expect(m.labels.length).toBeLessThanOrEqual(MAX_MARKS);
    }
  });

  test('long windows bucket by week and keep posts (edge 7)', () => {
    const a = series('2025-01-01', 400, 10, 1);
    const posts = [{ date: '2025-06-02', platforms: ['instagram', 'tiktok'] }];
    const m = audienceChartModel({ audience: a, channels: [a], postDays: posts, range: 'all', today: day('2025-01-01', 399) });
    expect(m.weekly).toBe(true);
    expect(m.labels.length).toBeLessThanOrEqual(MAX_MARKS);
    expect(m.posts.reduce((s, c) => s + (c.instagram ?? 0), 0)).toBe(1);
    expect(m.values.at(-1)).toBe(409);
  });

  test('hero strip caps its ticks and ends on the newest value', () => {
    const a = series('2026-01-01', 200, 0, 1);
    const s = stripValues(a, 'all', day('2026-01-01', 199));
    expect(s.values.length).toBeLessThanOrEqual(60);
    expect(s.values.at(-1)).toBe(199);
    expect(stripValues([], 30, '2026-01-01').values).toEqual([]);
  });

  test('fmtPct', () => {
    expect(fmtPct(7.0123)).toBe('+7.01%');
    expect(fmtPct(-12.34)).toBe('−12.3%');
    expect(fmtPct(null)).toBe('—');
  });
});

describe('/social GladOS tree (S03 F1 to F9)', () => {
  const g = read('components/social/SocialG.tsx');
  test('one range control, the total once, sample posts badged', () => {
    expect(g.match(/<GSegmented/g)?.length).toBe(1);
    expect(g.match(/formatFull\(total\)/g)?.length).toBeGreaterThanOrEqual(1);
    expect(g).toMatch(/kind === 'sample' \? <GSampleBadge/);
  });
  test('status pill comes from zernioStatusPill with a Set up link', () => {
    expect(g).toMatch(/pill\.setupHref && <GButton size="sm" href=\{pill\.setupHref\}/);
  });
  test('no mono, no literal colours in the growth G files', () => {
    for (const f of ['SocialG', 'SocialChartsG', 'SeriesSheetG', 'DmInboxG', 'PostComposerG']) {
      const src = read(`components/social/${f}.tsx`);
      expect(src).not.toMatch(/font-mono|#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    }
  });
});
