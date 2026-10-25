import { describe, expect, test } from 'vitest';
import { cellKey, surfaceOf } from '@/lib/lab/measure/baseline';
import { epochOf, metricBasis, perView, sharesBand, xActionScore } from '@/lib/lab/measure/platform';
import { targetsFor } from '@/lib/lab/measure/scheduler';
import { recomputeMeasuresV2 } from '@/lib/lab/measure/compute';
import { emptyStore, iso, BASE, DAY, HOUR } from './helpers/lab-measure-world';

/** 04 3.8 platform corrections (AC-04-10). */
describe('platform corrections', () => {
  test('a Short posted 2025-03-30 and one posted 2025-04-02 by the same source get different cells', () => {
    const a = { sourceId: 's', platform: 'youtube' as const, contentType: 'short', postedAt: '2025-03-30T12:00:00Z' };
    const b = { ...a, postedAt: '2025-04-02T12:00:00Z' };
    expect(epochOf(a)).toBe('yt_shorts_pre_2025_03_31');
    expect(epochOf(b)).toBe('current');
    expect(cellKey(a)).not.toBe(cellKey(b));
    expect(epochOf({ ...a, contentType: 'video' })).toBe('current');
    expect(surfaceOf({ platform: 'youtube', contentType: 'video' })).toBe('long');
  });
  test('X action score 0.5 likes + reposts + 5 replies + 5 quotes = 90; X keeps views when present', () => {
    expect(xActionScore({ likes: 100, shares: 10, comments: 4, quotes: 2 })).toBe(90);
    expect(metricBasis('twitter', { views: null, likes: 100, shares: 10, comments: 4, quotes: 2 })).toEqual({ basis: 'x_action', value: 90 });
    expect(metricBasis('twitter', { views: 5000, likes: 1, shares: 1, comments: 1 })).toEqual({ basis: 'views', value: 5000 });
  });
  test('a LinkedIn row is judged on reactions', () => {
    expect(metricBasis('linkedin', { views: null, likes: 40, comments: 5, shares: 2 })).toEqual({ basis: 'li_reactions', value: 47 });
  });
  test('TikTok shares and saves per view and their bands', () => {
    expect(perView({ views: 1000, shares: 19, saves: 24 })).toEqual({ sharesPerView: 0.019, savesPerView: 0.024 });
    expect(sharesBand(0.019)).toBe('1.5-3%');
  });
  test('the scheduler never plans an X read past 48h', () => {
    expect(Math.max(...targetsFor('twitter'))).toBe(48);
    expect(Math.max(...targetsFor('twitter', true))).toBe(48);
  });
  test('recompute stores the basis and the X action score for an X post without views', () => {
    const { store } = emptyStore();
    store.sources.upsert({ id: 'x', kind: 'tracked', platform: 'twitter', handle: 'x', url: null, displayName: 'x', status: 'active', addedAt: iso(BASE), reason: null, score: null });
    store.posts.upsert({ id: 'tw', sourceId: 'x', platform: 'twitter', externalId: 'tw', url: 'u', postedAt: iso(BASE), caption: '', contentType: 'text', thumbnailUrl: null, mediaUrl: null, durationS: null, isOwned: false });
    store.metrics.add({ postId: 'tw', capturedAt: iso(BASE + 30 * HOUR), views: null, likes: 100, comments: 4, shares: 10, saves: null, quotes: 2 });
    recomputeMeasuresV2(store, { now: new Date(BASE + 3 * DAY) });
    expect(store.measures.get('tw')).toMatchObject({ metricBasis: 'x_action', xActionScore: 90, judgedAgeH: 24 });
  });
});
