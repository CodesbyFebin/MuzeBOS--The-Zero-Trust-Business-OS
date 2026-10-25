import { describe, expect, test } from 'vitest';
import { firstNumber, normalizeItems, normalizeProfile, parseDuration, parseTimestamp } from '@/lib/lab/normalize';

/** Sample actor items, shaped like each actor's dataset (fictional accounts and ids). */
const IG_REEL = {
  shortCode: 'C0reel01', url: 'https://www.instagram.com/p/C0reel01/', type: 'Video', productType: 'clips',
  caption: 'Stop prompting like this #ai #agents @someone', videoViewCount: 48210, likesCount: 3120, commentsCount: 211,
  timestamp: '2026-09-20T15:04:00.000Z', videoDuration: 42.4, displayUrl: 'https://cdn.example/ig/1.jpg', videoUrl: 'https://cdn.example/ig/1.mp4',
  ownerUsername: 'Fictional.Maker', hashtags: ['ai', 'agents'],
};
const IG_IMAGE = { shortCode: 'C0img02', type: 'Image', caption: 'A still', likesCount: 400, commentsCount: 0, timestamp: 1758380400, displayUrl: 'https://cdn.example/ig/2.jpg' };
const IG_CAROUSEL = { shortCode: 'C0side03', url: 'https://www.instagram.com/p/C0side03/', type: 'Sidecar', caption: 'Five tools', likesCount: 900, commentsCount: 30, timestamp: '2026-09-21T10:00:00Z' };
const TT = {
  id: '7400000000000000001', webVideoUrl: 'https://www.tiktok.com/@fictional.maker/video/7400000000000000001', text: 'I replaced my VA with this agent #ai',
  playCount: 120000, diggCount: 9100, commentCount: 340, shareCount: 0, collectCount: 2210, createTime: 1758380400,
  videoMeta: { duration: 38, coverUrl: 'https://cdn.example/tt/1.jpg' }, mediaUrls: ['https://cdn.example/tt/1.mp4'],
  authorMeta: { name: 'fictional.maker', nickName: 'Fictional Maker', fans: 51000, following: 120, video: 340 }, hashtags: [{ name: 'ai' }],
};
const YT = {
  id: 'abcDEF12345', title: 'I built an AI research agent in 10 minutes', url: 'https://www.youtube.com/watch?v=abcDEF12345', viewCount: 88000, likes: 4100,
  commentsCount: 300, date: '2026-09-18T12:00:00.000Z', duration: '00:10:21', thumbnailUrl: 'https://cdn.example/yt/1.jpg', channelUsername: 'FictionalLabs',
  subtitles: [{ language: 'en', plaintext: 'So I built an agent' }], numberOfSubscribers: 210000,
};
const X = {
  id: '1830000000000000001', url: 'https://x.com/fictional/status/1830000000000000001', fullText: 'Agents are not the product', viewCount: 54000,
  likeCount: 800, replyCount: 40, retweetCount: 120, bookmarkCount: 310, createdAt: 'Fri Sep 19 10:00:00 +0000 2026', author: { userName: 'Fictional', followers: 30000 },
};
const LI = {
  urn: 'urn:li:activity:7300000000000000001', linkedinUrl: 'https://www.linkedin.com/posts/fictional_activity-7300000000000000001', content: 'Three agent patterns',
  engagement: { likes: 420, comments: 31, shares: 12 }, postedAt: { timestamp: 1758380400000 }, author: { publicIdentifier: 'fictional-person', name: 'Fictional Person' },
};

describe('parsers', () => {
  test('firstNumber keeps a real 0 and skips missing values', () => {
    expect(firstNumber(undefined, 0, 5)).toBe(0);
    expect(firstNumber(null, '12', 5)).toBe(12);
    expect(firstNumber(undefined, NaN, '')).toBeNull();
  });
  test('parseDuration reads ISO, clock and seconds; 0 and junk are unknown', () => {
    expect(parseDuration('PT1M5S')).toBe(65);
    expect(parseDuration('00:10:21')).toBe(621);
    expect(parseDuration('2:05')).toBe(125);
    expect(parseDuration(42.4)).toBe(42);
    expect(parseDuration(0)).toBeNull();
    expect(parseDuration('soon')).toBeNull();
  });
  test('parseTimestamp handles seconds, milliseconds and date strings', () => {
    expect(parseTimestamp(1758380400)).toBe('2025-09-20T15:00:00.000Z');
    expect(parseTimestamp(1758380400000)).toBe('2025-09-20T15:00:00.000Z');
    expect(parseTimestamp('1758380400')).toBe('2025-09-20T15:00:00.000Z');
    expect(parseTimestamp('2026-09-20T15:04:00.000Z')).toBe('2026-09-20T15:04:00.000Z');
    expect(parseTimestamp('nope')).toBeNull();
    expect(parseTimestamp(undefined)).toBeNull();
  });
});

describe('normalizeItems per platform', () => {
  test('Instagram reel: views from videoViewCount, saves and shares absent (null, not 0)', () => {
    const [p] = normalizeItems('instagram', [IG_REEL]);
    expect(p).toMatchObject({ platform: 'instagram', externalId: 'C0reel01', contentType: 'reel', durationS: 42, authorHandle: 'fictional.maker', hashtags: ['ai', 'agents'] });
    expect(p.metrics).toEqual({ views: 48210, likes: 3120, comments: 211, shares: null, saves: null });
    expect(p.mediaUrl).toBe('https://cdn.example/ig/1.mp4');
  });

  test('Instagram image: no views → views null (no rate), url built from the shortcode', () => {
    const [p] = normalizeItems('instagram', [IG_IMAGE]);
    expect(p.metrics.views).toBeNull();
    expect(p.url).toBe('https://www.instagram.com/p/C0img02/');
    expect(p.contentType).toBe('image');
    expect(p.metrics.comments).toBe(0); // a real 0 stays 0
  });

  test('Instagram carousel', () => {
    expect(normalizeItems('instagram', [IG_CAROUSEL])[0].contentType).toBe('carousel');
  });

  test('TikTok: play/digg/share/collect, a real 0 share stays 0, the downloaded file is the media url', () => {
    const [p] = normalizeItems('tiktok', [TT]);
    expect(p.metrics).toEqual({ views: 120000, likes: 9100, comments: 340, shares: 0, saves: 2210 });
    expect(p).toMatchObject({ durationS: 38, mediaUrl: 'https://cdn.example/tt/1.mp4', thumbnailUrl: 'https://cdn.example/tt/1.jpg', authorHandle: 'fictional.maker', hashtags: ['ai'] });
    expect(p.postedAt).toBe('2025-09-20T15:00:00.000Z');
  });

  test('YouTube: subtitles become the transcript, saves and shares null', () => {
    const [p] = normalizeItems('youtube', [YT]);
    expect(p).toMatchObject({ externalId: 'abcDEF12345', durationS: 621, contentType: 'video', transcript: 'So I built an agent', authorHandle: 'fictionallabs' });
    expect(p.metrics).toEqual({ views: 88000, likes: 4100, comments: 300, shares: null, saves: null });
  });

  test('X: bookmarks are saves, retweets are shares', () => {
    const [p] = normalizeItems('twitter', [X]);
    expect(p.metrics).toEqual({ views: 54000, likes: 800, comments: 40, shares: 120, saves: 310, quotes: null });
    expect(p.contentType).toBe('text');
  });

  test('AC-04-2: hidden IG likes (-1) are null; X quotes; LinkedIn without views; a /shorts start URL is a Short', () => {
    const [ig] = normalizeItems('instagram', [{ shortCode: 'abc', url: 'https://www.instagram.com/p/abc/', timestamp: '2026-10-01T00:00:00Z', likesCount: -1, commentsCount: 3, ownerUsername: 'someone', type: 'Video', videoPlayCount: 900 }]);
    expect(ig.metrics.likes).toBeNull();
    expect(ig.metrics.comments).toBe(3);
    const [x] = normalizeItems('twitter', [{ ...X, quoteCount: 7 }]);
    expect(x.metrics.quotes).toBe(7);
    const [li] = normalizeItems('linkedin', [{ id: 'li1', linkedinUrl: 'https://www.linkedin.com/posts/x', postedAt: { date: '2026-10-01T00:00:00Z' }, engagement: { likes: 5, comments: 1, shares: 0 } }]);
    expect(li.metrics.views).toBeNull();
    expect(li.metrics.likes).toBe(5);
    const [yt] = normalizeItems('youtube', [{ id: 'v1', url: 'https://www.youtube.com/watch?v=v1', title: 't', date: '2026-10-01T00:00:00Z', viewCount: 10, input: 'https://www.youtube.com/@chan/shorts' }]);
    expect(yt.contentType).toBe('short');
    const [yt2] = normalizeItems('youtube', [{ id: 'v2', url: 'https://www.youtube.com/watch?v=v2', title: 't', date: '2026-10-01T00:00:00Z', viewCount: 10, fromUrl: 'https://www.youtube.com/@chan/videos' }]);
    expect(yt2.contentType).toBe('video');
  });

  test('LinkedIn: no impressions on others’ posts → views null; saves null', () => {
    const [p] = normalizeItems('linkedin', [LI]);
    expect(p.metrics).toEqual({ views: null, likes: 420, comments: 31, shares: 12, saves: null });
    expect(p.authorHandle).toBe('fictional-person');
    expect(p.postedAt).toBe('2025-09-20T15:00:00.000Z');
  });

  test('items without an id are dropped and duplicates collapse', () => {
    expect(normalizeItems('tiktok', [TT, TT, { text: 'no id' }, null, 'junk'])).toHaveLength(1);
  });
});

describe('normalizeProfile', () => {
  test('TikTok author block and Instagram profile items give follower counts', () => {
    expect(normalizeProfile('tiktok', TT)).toMatchObject({ handle: 'fictional.maker', followers: 51000, following: 120, postCount: 340 });
    expect(normalizeProfile('instagram', { username: 'Fictional.Maker', followersCount: 9000, followsCount: 10, postsCount: 120 })).toMatchObject({ handle: 'fictional.maker', followers: 9000 });
    expect(normalizeProfile('youtube', YT)).toMatchObject({ handle: 'fictionallabs', followers: 210000 });
    expect(normalizeProfile('instagram', {})).toBeNull();
  });
});
