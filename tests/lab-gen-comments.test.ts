import { afterEach, describe, expect, test, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { LabComment } from '@/lib/schemas';
import { LAB_DDL } from '@/lib/db';
import { labStore } from '@/lib/lab/store';
import { seedLabFixtures } from '@/lib/lab/fixtures';
import { COMMENTER_HANDLES } from '@/lib/lab/fixtures/text';
import { COMMENT_PREVIEW_PRICE_PER_1000, audienceOverlap, authorHash, classifyIntent, commentSeeds, intentScore, normalizeComment, overlap, postKeyword, previewCommentsUsd, runComments, seedIdOf } from '@/lib/lab/gen/comments';
import { CapError } from '@/lib/lab/spend';
import { T, addPost, addSource, baseWorld } from './lab-gen-helpers';

vi.mock('@/lib/lab/apify-client', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/lab/apify-client')>();
  return { ...real, createApifyClient: vi.fn(real.createApifyClient) };
});
const apify = await import('@/lib/lab/apify-client');

/**
 * The comments layer (07 7.13): AC-07-40 to AC-07-47. Off by default (cap 0); no Apify client is
 * ever built here; the dry run uses fictional handles that must never reach a stored row.
 */

afterEach(() => {
  delete process.env.LAB_DRY;
  delete process.env.LAB_COMMENTS;
  delete process.env.LAB_COMMENTS_CAP_USD;
  vi.mocked(apify.createApifyClient).mockClear();
});

const SALT = 'test-salt-a';
const comment = (over: Partial<LabComment>): LabComment => ({ id: `tiktok:${Math.random().toString(36).slice(2)}`, postId: 'p1', platform: 'tiktok', authorHash: authorHash('tiktok', 'someone', SALT), text: 'nice', likes: 0, replies: 0, isReply: false, byCreator: false, creatorHeart: null, postedAt: new Date(T.getTime() - 86_400_000).toISOString(), capturedAt: T.toISOString(), intent: 'other', intentRule: null, runId: null, ...over });

describe('the switch and the cap (7.13.2; AC-07-40, AC-07-47)', () => {
  test('AC-07-40: with the cap unset or 0, run answers 402 and no Apify client is constructed', async () => {
    const s = baseWorld();
    addPost(s, { id: 'p1', source: 'src-own', owned: true, ratio: 1, ageH: 100 });
    await expect(runComments(s, { now: T })).rejects.toBeInstanceOf(CapError);
    process.env.LAB_COMMENTS = '1';
    process.env.LAB_COMMENTS_CAP_USD = '0';
    const err = await runComments(s, { now: T, override: true }).catch((e) => e);
    expect(err).toBeInstanceOf(CapError);
    expect(err.reason).toBe('off');
    expect(apify.createApifyClient).not.toHaveBeenCalled();
    const { POST } = await import('@/app/api/lab/comments/route');
    const res = await POST(new Request('http://localhost/api/lab/comments', { method: 'POST', body: JSON.stringify({ action: 'run' }) }));
    expect(res.status).toBe(402);
    expect(((await res.json()) as { capAsk: string }).capAsk).toBe('Comments are off. Set a monthly cap in Setup > Spend to turn them on.');
    expect(apify.createApifyClient).not.toHaveBeenCalled();
  });

  test('AC-07-47: the gate preview uses the highest listed price per actor', () => {
    expect(COMMENT_PREVIEW_PRICE_PER_1000).toEqual({ instagram: 2.6, tiktok: 5.0, youtube: 2.0 });
    expect(previewCommentsUsd('tiktok', 1000)).toBe(5);
    expect(previewCommentsUsd('instagram', 400)).toBe(1.04);
    expect(previewCommentsUsd('youtube', 40)).toBe(0.08);
  });
});

describe('hashing and the dry run (7.13.3; AC-07-41, AC-07-42)', () => {
  test('AC-07-42: authorHash is stable for a salt and differs across salts; by_creator marks the creator', () => {
    expect(authorHash('tiktok', '@Fan_01', SALT)).toBe(authorHash('tiktok', 'fan_01', SALT));
    expect(authorHash('tiktok', 'fan_01', SALT)).toMatch(/^[0-9a-f]{32}$/);
    expect(authorHash('tiktok', 'fan_01', SALT)).not.toBe(authorHash('tiktok', 'fan_01', 'another-salt'));
    const ctx = { postId: 'p1', salt: SALT, creatorHandle: 'the_creator', runId: null, capturedAt: T.toISOString(), keyword: null };
    const own = normalizeComment('tiktok', { cid: '1', text: 'thanks all', uniqueId: 'The_Creator' }, ctx)!;
    const fan = normalizeComment('tiktok', { cid: '2', text: 'thanks @the_creator', uniqueId: 'fan_02' }, ctx)!;
    expect(own.byCreator).toBe(true);
    expect(fan.byCreator).toBe(false);
    expect(fan.text).toBe('thanks @someone');
    expect(JSON.stringify([own, fan])).not.toMatch(/fan_02|the_creator/i);
    const yt = normalizeComment('youtube', { cid: '3', comment: 'great', author: '@chan', authorIsChannelOwner: true, hasCreatorHeart: true }, ctx)!;
    expect(yt).toMatchObject({ byCreator: true, creatorHeart: true });
  });

  test('AC-07-41: after a dry run on fixtures no fixture handle appears in any lab_comments column, and mentions read @someone', async () => {
    process.env.LAB_DRY = '1';
    const db = new Database(':memory:');
    db.exec(LAB_DDL);
    const s = labStore(db);
    seedLabFixtures(s, T);
    const before = s.comments.count();
    const owned = s.posts.all().filter((p) => p.isOwned && p.platform !== 'linkedin' && p.platform !== 'twitter').slice(0, 6).map((p) => p.id);
    const r = await runComments(s, { postIds: owned, now: T });
    expect(r.comments).toBeGreaterThan(0);
    expect(s.comments.count()).toBe(before + r.comments);
    expect(apify.createApifyClient).not.toHaveBeenCalled();
    const raw = db.prepare('SELECT * FROM lab_comments').all() as Record<string, unknown>[];
    const blob = JSON.stringify(raw).toLowerCase();
    for (const h of COMMENTER_HANDLES) expect(blob.includes(h.toLowerCase()), h).toBe(false);
    expect(blob).not.toMatch(/fan_\d\d_sample/);
    expect(raw.some((row) => String(row.text).includes('@someone'))).toBe(true);
    expect(raw.every((row) => !/@(?!someone)\w/.test(String(row.text)))).toBe(true);
  });
});

describe('intent (7.13.4; AC-07-43, AC-07-44)', () => {
  test('AC-07-43: each example is labelled by the first matching rule', () => {
    const cases: [string, string, string | null][] = [
      ['What tool is that in the second clip?', 'request', 'what-tool'],
      ['which app do you use', 'request', 'what-tool'],
      ['link please', 'request', 'link'],
      ['where can I get the template', 'request', 'link'],
      ['how did you make the captions', 'request', 'how-to'],
      ['full tutorial when', 'request', 'how-to'],
      ['can you make one for excel', 'request', 'make-one'],
      ['part 2 please', 'request', 'make-one'],
      ['is this free?', 'question', 'question'],
      ['this is clickbait', 'objection', 'objection'],
      ['doesnt work on mac', 'objection', 'objection'],
      ['love this', 'praise', 'praise'],
      ['thanks, helpful', 'praise', 'praise'],
      ['first', 'other', null],
    ];
    for (const [text, intent, rule] of cases) expect(classifyIntent(text), text).toEqual({ intent, rule });
    expect(classifyIntent('LFG')).toEqual({ intent: 'bait', rule: 'keyword-echo' });
  });

  test('AC-07-43: a keyword echo on a "comment AGENT" post is bait, not request', () => {
    const kw = postKeyword('Comment AGENT and I will send the setup');
    expect(kw).toBe('AGENT');
    expect(classifyIntent('agent', { keyword: kw })).toEqual({ intent: 'bait', rule: 'keyword-echo' });
    expect(classifyIntent('AGENT', { keyword: kw }).intent).toBe('bait');
    expect(classifyIntent('what tool is the agent using', { keyword: kw }).intent).toBe('request');
  });

  test('AC-07-44: the intent ratio reads not enough yet under 20 comments or under 5 comparison posts', () => {
    const s = baseWorld();
    const posts = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'];
    for (const id of posts) addPost(s, { id, source: 'src-c1', ratio: 1, views: 10_000 });
    const fill = (postId: string, n: number, requests: number) => {
      for (let i = 0; i < n; i++) s.comments.upsert(comment({ id: `tiktok:${postId}-${i}`, postId, intent: i < requests ? 'request' : 'praise' }));
    };
    fill('p0', 19, 6);
    for (const id of posts.slice(1)) fill(id, 10, 2);
    expect(intentScore(s, 'p0')).toMatchObject({ shown: false, text: 'not enough yet', n: 19 });
    fill('p0', 20, 6);
    const shown = intentScore(s, 'p0');
    expect(shown).toMatchObject({ shown: true, n: 20, comparison: 5, ratio: 3 });
    expect(shown.text).toBe("6 requests per 10k views, 3.0x this creator's usual (n 5). Untested as a predictor.");
    s.comments.upsert(comment({ id: 'x' })); // unrelated
    // only 4 comparison posts
    const t = baseWorld();
    for (const id of posts.slice(0, 5)) addPost(t, { id, source: 'src-c1', ratio: 1, views: 10_000 });
    for (let i = 0; i < 25; i++) t.comments.upsert(comment({ id: `tiktok:a${i}`, postId: 'p0', intent: 'request' }));
    for (const id of posts.slice(1, 5)) t.comments.upsert(comment({ id: `tiktok:${id}`, postId: id, intent: 'request' }));
    expect(intentScore(t, 'p0')).toMatchObject({ shown: false, comparison: 4, text: 'not enough yet' });
  });
});

describe('seeds and overlap (7.13.5, 7.13.6; AC-07-45, AC-07-46)', () => {
  test('AC-07-45: a seed needs 3 comments from 2 posts; its id is stable across runs', () => {
    const s = baseWorld();
    for (const id of ['p1', 'p2']) addPost(s, { id, source: 'src-c1', ratio: 1 });
    const ask = 'What tool is that in the second clip?';
    s.comments.upsert(comment({ id: 'tiktok:a', postId: 'p1', text: ask, intent: 'request' }));
    s.comments.upsert(comment({ id: 'tiktok:b', postId: 'p1', text: 'Which tool is that in the second clip?', intent: 'request' }));
    expect(commentSeeds(s, T)).toEqual([]);
    s.comments.upsert(comment({ id: 'tiktok:c', postId: 'p1', text: 'what tool is that in the second clip', intent: 'request' }));
    expect(commentSeeds(s, T)).toEqual([]); // 3 comments, 1 post
    s.comments.upsert(comment({ id: 'tiktok:d', postId: 'p2', text: 'What tool is that, in the second clip?', intent: 'request' }));
    const seeds = commentSeeds(s, T);
    expect(seeds).toHaveLength(1);
    expect(seeds[0]).toMatchObject({ comments: 4, posts: 2, label: 'what tool is that in the second clip', ideaId: null });
    expect(seeds[0].id).toBe(seedIdOf(['tiktok:a', 'tiktok:b', 'tiktok:c', 'tiktok:d']));
    expect(commentSeeds(s, T)[0].id).toBe(seeds[0].id);
  });

  test('AC-07-46: overlap reproduces 3.1% and hides under 50 commenters per side', () => {
    const A = new Set(Array.from({ length: 400 }, (_, i) => `a${i}`));
    const B = new Set([...Array.from({ length: 48 }, (_, i) => `a${i}`), ...Array.from({ length: 1152 }, (_, i) => `b${i}`)]);
    const o = overlap(A, B);
    expect(o.shared).toBe(48);
    expect(o.j).toBeCloseTo(48 / 1552, 6);
    expect(o.text).toBe('Shared commenters 3.1% (n 400 / 1,200)');
    expect(overlap(new Set(['x']), B)).toMatchObject({ j: null, text: 'not enough yet' });
    const s = baseWorld();
    addSource(s, 'src-c9');
    expect(audienceOverlap(s, T).every((r) => r.j === null)).toBe(true);
  });
});
