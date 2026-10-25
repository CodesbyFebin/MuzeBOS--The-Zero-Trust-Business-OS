import { afterEach, describe, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { LAB_DDL } from '@/lib/db';
import { labStore } from '@/lib/lab/store';
import { seedLabFixtures } from '@/lib/lab/fixtures';
import { backfill, embedTexts, type Embedder } from '@/lib/lab/gen/embed';
import { CapError } from '@/lib/lab/spend';
import { askView, ideaSheetView, scriptSheetView, studioView } from '@/lib/lab/gen/view';
import { askSummary } from '@/lib/lab/gen/ask';
import { intentScore, overlap } from '@/lib/lab/gen/comments';
import { LAB_LAYERS_BUILT } from '@/lib/lab/view/layers';
import { T, addPost, baseWorld } from './lab-gen-helpers';

/**
 * Cross-cutting checks for lane G (07 7.17): AC-07-56 (paid calls only through gatedCall),
 * AC-07-58 (every ratio, rate or median carries n and reads `not enough yet` under n 5), and the
 * copy rules over the built views (no em or en dash, no emoji).
 */

afterEach(() => {
  delete process.env.LAB_DRY;
});

const ROOT = path.resolve(__dirname, '..');
const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : []));

describe('paid calls (AC-07-56)', () => {
  test('no lane G file fetches Apify or OpenAI embeddings directly; every network call goes through labFetch or the Apify client', () => {
    const files = [...walk(path.join(ROOT, 'lib/lab/gen')), ...['ask', 'comments', 'frames', 'embeddings', 'rules', 'ideas', 'scripts', 'script'].map((r) => path.join(ROOT, `app/api/lab/${r}/route.ts`))];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      const rel = path.relative(ROOT, f);
      expect(src, rel).not.toMatch(/(^|[^.\w])fetch\(\s*['"`]https:\/\/api\.apify\.com/);
      expect(src, rel).not.toMatch(/(^|[^.\w])fetch\(\s*['"`]https:\/\/api\.openai\.com\/v1\/embeddings/);
      expect(src, rel).not.toMatch(/globalThis\.fetch|(^|[\s(=])fetch\(/m);
    }
    // the embeddings URL is a constant read only by the OpenAI embedder, whose embed() runs inside gated live branches
    const embed = fs.readFileSync(path.join(ROOT, 'lib/lab/gen/embed.ts'), 'utf8');
    expect(embed.match(/api\.openai\.com\/v1\/embeddings/g)).toHaveLength(1);
  });

  test('a paid embedder with the embed cap at 0 is refused before it is called (backfill and ad hoc)', async () => {
    const s = baseWorld();
    addPost(s, { id: 'p1', source: 'src-c1', ratio: 2, hook: 'Voice agents' });
    const embed = vi.fn(async (texts: string[]) => ({ vecs: texts.map(() => new Float32Array(4)), tokens: 10 }));
    const paid: Embedder = { model: 'text-embedding-3-small', dim: 4, paid: true, embed };
    await expect(backfill(s, { embedder: paid, now: T })).rejects.toBeInstanceOf(CapError);
    await expect(embedTexts(s, ['q'], paid, { now: T })).rejects.toBeInstanceOf(CapError);
    expect(embed).not.toHaveBeenCalled();
    // dry never calls it either
    process.env.LAB_DRY = '1';
    expect(await embedTexts(s, ['q'], paid, { now: T })).toEqual([null]);
    expect(embed).not.toHaveBeenCalled();
  });
});

describe('n on every number (AC-07-58)', () => {
  test('Ask, the Studio diversity line, comment intent and overlap read not enough yet under their n', () => {
    expect(askSummary([{ ratio: 5 }, { ratio: 5 }, { ratio: 5 }, { ratio: 5 }], { indexed: 9, semantic: true })).toBe('4 posts match. Not enough to say more.');
    expect(askSummary(Array.from({ length: 6 }, (_, i) => ({ ratio: i < 4 ? 2 : null })), { indexed: 9, semantic: true })).toContain('Median not enough yet (n 4).');
    expect(askSummary(Array.from({ length: 6 }, () => ({ ratio: 2 })), { indexed: 9, semantic: true })).toMatch(/Median 2\.0x, n 6\.$/);
    const s = baseWorld();
    addPost(s, { id: 'p1', source: 'src-c1', ratio: 1, views: 1000 });
    expect(intentScore(s, 'p1')).toMatchObject({ shown: false, ratio: null, text: 'not enough yet' });
    expect(overlap(new Set(['a']), new Set(['a'])).text).toBe('not enough yet');
    expect(studioView(s, { now: T }).diversity.text).toBe('Spread: not enough yet (n 0).');
  });
});

describe('views over the fixture world', () => {
  const db = new Database(':memory:');
  db.exec(LAB_DDL);
  const s = labStore(db);
  seedLabFixtures(s, T);

  test('studio, idea, script and ask views build, carry no dash or emoji, and the gen layers are flipped', async () => {
    expect(LAB_LAYERS_BUILT).toMatchObject({ gen: true, ask: true, comments: true });
    const studio = studioView(s, { now: T });
    const idea = ideaSheetView(s, 'fx-idea-9', { now: T })!;
    const script = scriptSheetView(s, 'fx-script-1', { now: T })!;
    const ask = await askView(s, 'results-first hooks that broke out on TikTok', { now: T });
    expect(studio.ideas.length).toBe(s.ideas.all().length);
    expect(studio.seeds.length).toBeGreaterThan(0);
    expect(idea.source).toBe('event');
    expect(idea.launchAngle).toBe('first_look');
    expect(script.id).toBe('fx-script-1');
    expect(script.versions.length).toBe(3);
    expect(ask.filters.platforms).toEqual(['tiktok']);
    expect(ask.indexing).toBe(null);
    const text = JSON.stringify([studio.diversity, studio.generate, studio.seeds, idea.variants, script.gate, script.judge, script.prediction, script.skills, ask.summary, ask.filters.matched]);
    expect(text).not.toMatch(/[–—]/);
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(scriptSheetView(s, 'nope', { now: T })).toBe(null);
    expect(ideaSheetView(s, 'nope', { now: T })).toBe(null);
  });
});
