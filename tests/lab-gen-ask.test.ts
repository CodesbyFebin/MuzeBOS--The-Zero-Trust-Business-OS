import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { askSummary, parseAsk, searchAsk, NOTHING_INDEXED, type AskFilters } from '@/lib/lab/gen/ask';
import { askView } from '@/lib/lab/gen/view';
import { embedLocalNow, localEmbedder, type Embedder } from '@/lib/lab/gen/embed';
import { T, addPost, baseWorld, emptyStore } from './lab-gen-helpers';

/**
 * Ask the Lab (07 7.12): AC-07-36 to AC-07-39. The parser is pinned by 20 fixture queries; search
 * compares only vectors of the active model; the summary copy switches at n 5.
 */

const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'lab-ask-queries.json'), 'utf8')) as { handles: Record<string, string>; queries: { q: string; expect: Partial<AskFilters> }[] };

describe('the parser (7.12.1; AC-07-36)', () => {
  test('the 20 fixture queries parse to their expected filters', () => {
    expect(FIX.queries).toHaveLength(20);
    const handles = new Map(Object.entries(FIX.handles));
    for (const { q, expect: want } of FIX.queries) {
      const f = parseAsk(q, { handles });
      for (const [k, v] of Object.entries(want)) expect((f as Record<string, unknown>)[k], `${q} -> ${k}`).toEqual(v);
    }
  });

  test('defaults: niche only, 90 days, no filters; chips name what matched', () => {
    const f = parseAsk('agent memory');
    expect(f).toMatchObject({ platforms: [], formats: [], hookForms: [], minRatio: null, maxRatio: null, days: 90, owned: 'exclude', creators: [], dualHigh: false, semantic: 'agent memory', matched: [] });
    expect(parseAsk('TikTok voice agents').matched).toEqual([{ span: 'TikTok', as: 'platform' }]);
    expect(parseAsk('shorts').formats).not.toContain('long_form');
  });
});

describe('search (7.12.2; AC-07-37)', () => {
  function world() {
    const s = baseWorld();
    addPost(s, { id: 'v1', source: 'src-c1', ratio: 6, hook: 'Voice agents on real support calls', ageH: 40 });
    addPost(s, { id: 'v2', source: 'src-c2', ratio: 1.2, hook: 'Voice agents for sales calls', ageH: 50 });
    addPost(s, { id: 'c1', source: 'src-c3', ratio: 4, hook: 'Cooking pasta in ten minutes', ageH: 60 });
    addPost(s, { id: 'mine', source: 'src-own', owned: true, ratio: 2, hook: 'My voice agent experiment', ageH: 70 });
    embedLocalNow(s, ['post'], T.toISOString());
    return s;
  }

  test('semantic search ranks by similarity within the active model and keeps the filters', async () => {
    const s = world();
    const r = await searchAsk(s, parseAsk('voice agents'), { now: T, embedder: localEmbedder });
    expect(r.model).toBe('local-hash-v1');
    expect(r.indexing).toBe(null);
    expect(r.hits.map((h) => h.post.id)).toEqual(expect.arrayContaining(['v1', 'v2']));
    expect(r.hits.map((h) => h.post.id)).not.toContain('mine');
    expect(r.hits.map((h) => h.post.id)).not.toContain('c1');
    const mine = await searchAsk(s, parseAsk('my voice agent'), { now: T, embedder: localEmbedder });
    expect(mine.hits.map((h) => h.post.id)).toEqual(['mine']);
    const broke = await searchAsk(s, parseAsk('breakouts'), { now: T, embedder: localEmbedder });
    expect(broke.hits.map((h) => h.post.id)).toEqual(['v1', 'c1']);
  });

  test('AC-07-37: with only local rows and OpenAI active, Ask reports indexing and returns no cross-model results', async () => {
    const s = world();
    const openaiLike: Embedder = { model: 'text-embedding-3-small', dim: 1536, paid: false, embed: async (texts) => ({ vecs: texts.map(() => Float32Array.from({ length: 1536 }, (_, i) => (i % 7) / 7)), tokens: 0 }) };
    const r = await searchAsk(s, parseAsk('voice agents'), { now: T, embedder: openaiLike });
    expect(r.model).toBe('text-embedding-3-small');
    expect(r.hits).toEqual([]);
    expect(r.indexing).toEqual({ done: 0, total: 4 });
    const view = await askView(s, 'voice agents', { now: T, embedder: openaiLike });
    expect(view.indexing).toEqual({ done: 0, total: 4 });
    expect(view.cards).toEqual([]);
  });
});

describe('answer copy (7.12.3; AC-07-38, AC-07-39)', () => {
  const rows = (ratios: (number | null)[]) => ratios.map((ratio) => ({ ratio }));
  test('AC-07-38: the summary switches at n 5 exactly; the median shows only with k >= 5', () => {
    expect(askSummary(rows([]), { indexed: 10, semantic: true })).toBe('Nothing matches. Try fewer filters.');
    expect(askSummary(rows([1, 2, 3, 4]), { indexed: 10, semantic: true })).toBe('4 posts match. Not enough to say more.');
    expect(askSummary(rows([1, 2, 3, 4, 5]), { indexed: 10, semantic: true })).toBe("5 posts match. 3 broke out (3x or more their creator's normal). Median 3.0x, n 5.");
    expect(askSummary(rows([1, 2, 3, 4, null]), { indexed: 10, semantic: true })).toBe("5 posts match. 2 broke out (3x or more their creator's normal). Median not enough yet (n 4).");
    expect(askSummary(rows([0.5, 1.5, 12.62, 3, 4, 5]), { indexed: 10, semantic: false })).toContain('Median 3.5x, n 6.');
  });

  test('AC-07-39: a blank install answers 200 with n 0 and the Nothing indexed yet state', async () => {
    const view = await askView(emptyStore(), 'results-first hooks that broke out', { now: T });
    expect(view.n).toBe(0);
    expect(view.summary).toBe(NOTHING_INDEXED);
    const { GET } = await import('@/app/api/lab/ask/route');
    const res = await GET(new Request('http://localhost/api/lab/ask?q=voice%20agents'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; ask: { n: number; summary: string } };
    expect(body.ok).toBe(true);
    expect(body.ask.n).toBe(0);
    expect(body.ask.summary).toBe('Nothing indexed yet. The Lab indexes posts after each sync.');
    expect((await GET(new Request('http://localhost/api/lab/ask?q='))).status).toBe(400);
  });

  test('cards carry the 01 PostCardView and a match label', async () => {
    const s = baseWorld();
    addPost(s, { id: 'v1', source: 'src-c1', ratio: 6, hook: 'Voice agents on real support calls', ageH: 40 });
    embedLocalNow(s, ['post'], T.toISOString());
    const v = await askView(s, 'voice agents support calls', { now: T, embedder: localEmbedder });
    expect(v.cards).toHaveLength(1);
    expect(v.cards[0]).toMatchObject({ postId: 'v1', match: 'close' });
    expect(v.cards[0].card).toMatchObject({ postId: 'v1', dualHigh: false, exogenous: false });
    // the measure layer is built (lane D merged); this fixture post has no age-matched baseline
    expect(v.cards[0].card.read.state).toBe('no_baseline');
    const f = await askView(s, 'breakouts', { now: T, embedder: localEmbedder });
    expect(f.cards[0].match).toBe('filter');
  });
});
