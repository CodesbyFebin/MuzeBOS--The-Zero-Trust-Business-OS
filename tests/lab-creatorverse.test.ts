/**
 * Creatorverse (/lab/creatorverse): the view model over the fixture world (every creator kind, sizes from
 * the latest follower snapshot, organised by size), the sizing fallback, links, the client filters and
 * search, the states (not configured, no creators, sample), route registration in both trees, the build
 * budget, and tokens-only colour.
 */
import { readFileSync } from 'node:fs';
import { createElement as h, type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { VERSE_COPY, VERSE_K, creatorverse, layoutBySize, shellFor, sizeCreators, type CreatorversePageView, type VerseNode } from '@/lib/lab/view/creatorverse';
import { LAB_PAGES } from '@/lib/lab/view/shared';
import { drawnEdges, platKey, searchCreators, shownMask, toggleFacet } from '@/components/lab/v2/shared/creatorverse-filter';
import * as G from '@/components/lab/v2/g';
import * as C from '@/components/lab/v2/classic';
import { legacyRedirect } from '@/app/lab/_render';
import { FLAGS, NOW, blankStore, fixtureStore, page } from './helpers/lab-v2-v';
import { renderWithRouter } from './helpers/render-client';

const radius = (n: VerseNode) => Math.hypot(n.x, n.y, n.z);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

describe('creatorverse view model on the fixture world', () => {
  const s = fixtureStore();
  const v = creatorverse(s, NOW, true);
  const social = new Set(['instagram', 'tiktok', 'youtube', 'linkedin', 'twitter', 'x']);
  const expected = s.sources.all().filter((x) => ['owned', 'tracked', 'watch', 'suggested'].includes(x.kind) && x.status !== 'dismissed' && social.has(x.platform));

  it('one node per creator of every kind (owned, tracked, watch list, suggested); feeds are not creators', () => {
    expect(v.state.kind).toBe('ready');
    expect(v.nodes.map((n) => n.id).sort()).toEqual(expected.map((x) => x.id).sort());
    expect(v.nodes.some((n) => n.id.includes('feed'))).toBe(false);
    for (const k of ['owned', 'tracked', 'watch', 'suggested'] as const) expect(v.nodes.some((n) => n.kind === k), k).toBe(true);
    expect(v.kinds.reduce((a, k) => a + k.n, 0)).toBe(v.nodes.length);
    expect(v.platforms.reduce((a, p) => a + p.n, 0)).toBe(v.nodes.length);
    expect(v.kinds.map((k) => k.label)).toEqual(['Your accounts', 'Tracked', 'Watch list', 'Suggested']);
  });

  it('size is the latest follower or subscriber count from lab_creator_snapshots', () => {
    const latest = new Map<string, number>();
    for (const sn of s.creatorSnapshots.all()) if (sn.followers) latest.set(sn.sourceId, sn.followers);
    for (const n of v.nodes) {
      if (latest.has(n.id)) {
        expect(n.sizeBasis, n.handle).toBe('followers');
        expect(n.followers).toBe(latest.get(n.id));
        expect(n.sizeText).toMatch(n.platform === 'youtube' ? / subscribers$/ : / followers$/);
      }
    }
    // the fixture's X watch accounts carry no profile read: they are honest unsized nodes, not guesses
    const watch = v.nodes.filter((n) => n.kind === 'watch');
    expect(watch.length).toBeGreaterThan(0);
    for (const n of watch) {
      expect(n.sizeBasis).toBe('none');
      expect(n.followers).toBeNull();
      expect(n.s).toBe(0);
      expect(n.sizeText).toBe(VERSE_COPY.audience.none);
      expect(n.breakoutsHref).toBeNull();
    }
    expect(v.legend.none).toBe(VERSE_COPY.legendNone.replace('{n}', String(watch.length)));
    expect(v.counts.none).toBe(watch.length);
  });

  it('nodes come biggest first, sizes run 0..1, and unsized creators rank last', () => {
    v.nodes.forEach((n, i) => expect(n.rank).toBe(i));
    const sized = v.nodes.filter((n) => n.sizeBasis !== 'none');
    for (let i = 1; i < sized.length; i++) expect(sized[i].followers ?? 0).toBeLessThanOrEqual(sized[i - 1].followers ?? 0);
    expect(sized[0].s).toBe(1);
    expect(Math.min(...sized.map((n) => n.s))).toBe(0);
    expect(Math.min(...v.nodes.filter((n) => n.sizeBasis === 'none').map((n) => n.rank))).toBe(sized.length);
  });

  it('organised by size: bigger creators sit nearer the centre', () => {
    const sized = v.nodes.filter((n) => n.sizeBasis !== 'none');
    const q = Math.floor(sized.length / 4);
    expect(mean(sized.slice(0, q).map(radius))).toBeLessThan(mean(sized.slice(-q).map(radius)));
    expect(mean(sized.map(radius))).toBeLessThan(mean(v.nodes.filter((n) => n.sizeBasis === 'none').map(radius)));
    for (const n of v.nodes) for (const c of [n.x, n.y, n.z]) expect(Math.abs(c)).toBeLessThanOrEqual(1);
  });

  it('links follow the card rules, each creator keeps its strongest k, and watch accounts join their vendor launches', () => {
    expect(v.edges.length).toBeGreaterThan(0);
    for (const e of v.edges) {
      expect(e.a).toBeLessThan(e.b);
      expect(e.b).toBeLessThan(v.nodes.length);
      expect(e.w).toBeGreaterThan(0);
      expect(e.w).toBeLessThanOrEqual(1);
    }
    const strong = v.edges.filter((e) => e.strong);
    expect(strong.length).toBeLessThan(v.edges.length);
    v.nodes.forEach((n, i) => {
      const all = v.edges.filter((e) => e.a === i || e.b === i);
      expect(all.filter((e) => e.strong).length, n.handle).toBeGreaterThanOrEqual(Math.min(VERSE_K, all.length));
      expect(n.degree).toBe(all.length);
    });
    const watchIdx = new Set(v.nodes.map((n, i) => (n.kind === 'watch' ? i : -1)).filter((i) => i >= 0));
    expect(v.edges.some((e) => e.kind === 'event' && (watchIdx.has(e.a) || watchIdx.has(e.b)))).toBe(true);
    expect(v.counts).toMatchObject({ edges: v.edges.length, strong: strong.length, creators: v.nodes.length });
  });

  it('links: breakouts for creators with posts (mine=1 for your accounts), Setup for every source, sample kept', () => {
    for (const n of v.nodes) {
      expect(n.setupHref).toBe('?setup=sources&sample=1');
      if (n.posts > 0) expect(n.breakoutsHref).toBe(`/lab/breakouts?creator=${encodeURIComponent(n.id)}${n.kind === 'owned' ? '&mine=1' : ''}&sample=1`);
      expect(n.title).toContain(n.handle);
      expect(n.title).not.toMatch(/\{|undefined|NaN/);
    }
  });

  it('a text summary names the kinds, sizes and links; the layout is deterministic', () => {
    expect(v.summary).toMatch(/^\d+ creators: \d+ yours, \d+ tracked, \d+ on the watch list, \d+ suggested\./);
    expect(v.summary).toContain('Biggest: ');
    expect(creatorverse(s, NOW, true).nodes.map((n) => [n.x, n.y, n.z])).toEqual(v.nodes.map((n) => [n.x, n.y, n.z]));
  });

  it('?creator=<id> selects a creator in the graph; an unknown id selects nothing', () => {
    const id = v.nodes[3].id;
    expect(creatorverse(s, NOW, true, id).selected).toBe(id);
    expect(creatorverse(s, NOW, true, 'nope').selected).toBeNull();
  });
});

describe('sizing and its fallback', () => {
  it('followers first, then median views, then nothing; a log scale; ranks biggest first and unsized last', () => {
    const out = sizeCreators([
      { followers: 1_000, medianViews: null },
      { followers: null, medianViews: 10_000 },
      { followers: null, medianViews: null },
      { followers: 100_000, medianViews: 50 },
      { followers: 0, medianViews: null },
    ]);
    expect(out.map((o) => o.basis)).toEqual(['followers', 'median_views', 'none', 'followers', 'none']);
    expect(out.map((o) => o.s)).toEqual([0, 0.5, 0, 1, 0]);
    expect(out.map((o) => o.rank)).toEqual([2, 1, 3, 0, 4]);
  });
  it('a creator with posts but no profile read is sized by the median views of its posts and the legend says so', () => {
    const st = blankStore();
    const at = NOW.toISOString();
    const src = (id: string, handle: string) => st.sources.upsert({ id, kind: 'tracked', platform: 'tiktok', handle, url: null, displayName: handle, status: 'active', addedAt: at, reason: null, score: null });
    src('s-big', 'big');
    src('s-views', 'viewsonly');
    src('s-none', 'nothing');
    st.creatorSnapshots.add({ sourceId: 's-big', capturedAt: at, followers: 250_000, following: 10, postCount: 10 });
    [4_000, 9_000, 30_000].forEach((views, i) => {
      const id = `p-${i}`;
      st.posts.upsert({ id, sourceId: 's-views', platform: 'tiktok', externalId: id, url: `https://example.com/${id}`, postedAt: at, caption: '', contentType: 'video', thumbnailUrl: null, mediaUrl: null, durationS: 30, isOwned: false });
      st.metrics.add({ postId: id, capturedAt: at, views, likes: 1, comments: 0, shares: 0, saves: 0 });
    });
    const v = creatorverse(st, NOW, false);
    const by = new Map(v.nodes.map((n) => [n.handle, n]));
    expect(by.get('@big')!.sizeBasis).toBe('followers');
    expect(by.get('@viewsonly')).toMatchObject({ sizeBasis: 'median_views', medianViews: 9_000, followers: null, sizeText: '9k median views' });
    expect(by.get('@nothing')).toMatchObject({ sizeBasis: 'none', s: 0, breakoutsHref: null });
    expect(v.legend.fallback).toBe(VERSE_COPY.legendFallback.replace('{n}', '1'));
    expect(v.legend.none).toBe(VERSE_COPY.legendNone.replace('{n}', '1'));
    expect(v.nodes.map((n) => n.handle)).toEqual(['@big', '@viewsonly', '@nothing']);
  });
  it('shells grow with rank and the unsized sit at the edge; the layout copes with 0, 1 and 2 nodes', () => {
    expect(shellFor(0, 10, true)).toBeLessThan(shellFor(9, 10, true));
    expect(shellFor(9, 10, true)).toBeLessThan(shellFor(0, 10, false));
    expect(layoutBySize(0, [], [])).toEqual([]);
    expect(layoutBySize(1, [], [0.1])).toEqual([{ x: 0, y: 0, z: 0 }]);
    const two = layoutBySize(2, [{ a: 0, b: 1, w: 1 }], [0.1, 0.9]);
    expect(two).toHaveLength(2);
    expect(Math.hypot(two[0].x, two[0].y, two[0].z)).toBeLessThan(Math.hypot(two[1].x, two[1].y, two[1].z));
  });
});

describe('client filters and search', () => {
  const v = creatorverse(fixtureStore(), NOW, true);
  it('hiding a kind or a platform hides its nodes and every edge touching them', () => {
    const shown = shownMask(v.nodes, new Set(['watch']), new Set());
    v.nodes.forEach((n, i) => expect(shown[i]).toBe(n.kind !== 'watch'));
    for (const e of drawnEdges(v.edges, shown, true)) expect(v.nodes[e.a].kind !== 'watch' && v.nodes[e.b].kind !== 'watch').toBe(true);
    const noX = shownMask(v.nodes, new Set(), new Set(['x']));
    v.nodes.forEach((n, i) => expect(noX[i]).toBe(platKey(n.platform) !== 'x'));
  });
  it('strongest links by default, every link on the toggle', () => {
    const all = shownMask(v.nodes, new Set(), new Set());
    expect(drawnEdges(v.edges, all, false)).toEqual(v.edges.filter((e) => e.strong));
    expect(drawnEdges(v.edges, all, true)).toHaveLength(v.edges.length);
  });
  it('a chip toggles, and the last shown value of a facet never hides', () => {
    const ids = ['a', 'b'];
    const one = toggleFacet(new Set<string>(), 'a', ids);
    expect([...one]).toEqual(['a']);
    expect([...toggleFacet(one, 'b', ids)]).toEqual(['a']);
    expect([...toggleFacet(one, 'a', ids)]).toEqual([]);
  });
  it('search matches handle or name, handle prefixes first, then by size, at most six', () => {
    const top = v.nodes[0];
    const q = top.handle.slice(1, 4);
    const hits = searchCreators(v.nodes, `@${q}`);
    expect(hits[0]).toBe(0);
    expect(hits.length).toBeLessThanOrEqual(6);
    expect(searchCreators(v.nodes, '   ')).toEqual([]);
    expect(searchCreators(v.nodes, 'zzzz-no-such-creator')).toEqual([]);
    expect(searchCreators(v.nodes, top.name.toUpperCase())).toContain(0);
  });
});

describe('states', () => {
  it('not configured: the frame carries the set-up card and the graph is empty', async () => {
    const v = (await page('creatorverse', blankStore(), FLAGS.notConfigured)) as CreatorversePageView;
    expect(v.frame.emptyCard).not.toBeNull();
    expect(v.graph.nodes).toEqual([]);
  });
  it('configured with no creators: an honest empty state with Add source', async () => {
    const v = (await page('creatorverse', blankStore(), FLAGS.real)) as CreatorversePageView;
    expect(v.frame.emptyCard).toBeNull();
    expect(v.graph.state).toEqual({ kind: 'empty', message: VERSE_COPY.noCreators, action: { label: 'Add source', href: '?setup=sources&focus=add' } });
  });
  it('sample and Filming: a rich graph', async () => {
    for (const flags of [FLAGS.sample, FLAGS.filming]) {
      const v = (await page('creatorverse', fixtureStore(), flags)) as CreatorversePageView;
      expect(v.graph.state.kind).toBe('ready');
      expect(v.graph.nodes.length).toBeGreaterThan(30);
      expect(v.graph.edges.length).toBeGreaterThan(30);
    }
  });
  it('the server view builds well under 300 ms on the fixture world', async () => {
    const s = fixtureStore();
    await page('creatorverse', s, FLAGS.sample);
    const t0 = performance.now();
    await page('creatorverse', s, FLAGS.sample);
    expect(performance.now() - t0).toBeLessThan(300);
  });
});

describe('route registration and both trees', () => {
  it('Creatorverse is the seventh Lab tab at /lab/creatorverse, and ?tab=creatorverse lands there', () => {
    expect(LAB_PAGES.map((p) => p.id)).toContain('creatorverse');
    expect(LAB_PAGES.find((p) => p.id === 'creatorverse')).toEqual({ id: 'creatorverse', label: 'Creatorverse', path: '/lab/creatorverse' });
    expect(legacyRedirect({ tab: 'creatorverse', sample: '1' })).toBe('/lab/creatorverse?sample=1');
  });
  it('both trees render the page with the graph, its controls and the screen-reader table', async () => {
    const v = (await page('creatorverse', fixtureStore(), FLAGS.sample)) as CreatorversePageView;
    for (const [tree, Page] of [['g', G.CreatorversePage], ['c', C.CreatorversePage]] as const) {
      const html = renderWithRouter(h(Page, { view: v }) as ReactElement);
      expect(html, tree).toContain('data-lab-page="creatorverse"');
      expect(html).toContain(`class="lab2-verse" data-tree="${tree}"`);
      expect(html).toContain('aria-roledescription="graph"');
      expect(html).toContain('Find a creator');
      expect(html).toContain('<caption>');
      expect(html).toContain(tree === 'g' ? 'lab2g-fchip' : 'lab2c-fchip');
      expect(html).toContain('Creatorverse');
      expect(html).not.toMatch(/>[^<]*\b(undefined|NaN)\b[^<]*</);
    }
  });
  it('the routes, scripts and audits list the new page', () => {
    for (const f of ['scripts/audit-lab-v2.mjs', 'scripts/perf-nav.mjs', 'scripts/lab-motion-audit.mjs', 'scripts/g-audit/_lab.mjs']) expect(readFileSync(f, 'utf8'), f).toContain("'/lab/creatorverse'");
  });
});

describe('tokens only', () => {
  it('no raw colour in the view model, the engine, the component, the pages or the stylesheet', () => {
    const files = [
      'lib/lab/view/creatorverse.ts', 'lib/lab/view/creatorverse-copy.ts', 'components/lab/v2/shared/graph3d.ts', 'components/lab/v2/shared/Creatorverse.tsx',
      'components/lab/v2/shared/creatorverse-filter.ts', 'components/lab/v2/g/CreatorversePage.tsx', 'components/lab/v2/classic/CreatorversePage.tsx', 'components/lab/v2/shared/creatorverse.css',
    ];
    for (const f of files) {
      const body = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(body, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b(?![-\w])/);
      expect(body, f).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/);
      expect(body, f).not.toMatch(/:\s*(white|black)\b/);
    }
  });
  it('the canvas colours come from --lab tokens the view names', () => {
    const v = creatorverse(fixtureStore(), NOW, true);
    for (const f of [...v.kinds, ...v.platforms]) expect(f.token).toMatch(/^--lab-cat-\d+$/);
    const tsx = readFileSync('components/lab/v2/shared/Creatorverse.tsx', 'utf8');
    expect(tsx).toContain("readInk(el, '--lab-ink-hero', '--lab-glass-solid')");
    expect(tsx).toContain('resolveColours(el, tokens)');
  });
  it('reduced motion stops the turn; the loop pauses off-screen and in a hidden tab', () => {
    const tsx = readFileSync('components/lab/v2/shared/Creatorverse.tsx', 'utf8');
    expect(tsx).toMatch(/if \(!still && idle\)/);
    expect(tsx).toContain('IntersectionObserver');
    expect(tsx).toContain('document.hidden');
    expect(tsx).toContain('requestAnimationFrame');
  });
});
