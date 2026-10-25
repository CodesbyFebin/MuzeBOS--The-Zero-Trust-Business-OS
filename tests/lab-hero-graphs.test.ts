/**
 * Today's hero graphs: the creator network (on the Brief card) and the breakout chart (on the Window card).
 * View model shape over the fixture world, the empty and not-configured states, the Breakouts creator
 * filter the network links to, the card's caption render, and tokens-only colour.
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { describe, expect, it } from 'vitest';
import { NarrativeCard } from '@/components/lab/v2/shared';
import { ChartVisual, NetworkVisual } from '@/components/lab/v2/shared/HeroGraphs';
import { HERO_GRAPH_COPY, breakoutChart, creatorNetwork, emptyHeroGraphs, heroGraphs, layout3d } from '@/lib/lab/view/hero-graphs';
import type { TodayPageView } from '@/lib/lab/view/today';
import type { BreakoutsPageView } from '@/lib/lab/view/breakouts';
import { FLAGS, NOW, blankStore, fixtureStore, page } from './helpers/lab-v2-v';
import { renderWithRouter } from './helpers/render-client';

const DAY = 86_400_000;
const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

describe('creator network view model', () => {
  const s = fixtureStore();
  const net = creatorNetwork(s, NOW, true);
  it('one node per active tracked creator, sized by 30-day breakouts', () => {
    const tracked = s.sources.all('tracked').filter((x) => x.status === 'active');
    expect(net.state.kind).toBe('ready');
    expect(net.label).toBe('Creator network');
    expect(net.nodes.map((n) => n.id).sort()).toEqual(tracked.map((x) => x.id).sort());
    expect(net.nodes.some((n) => n.breakouts > 0)).toBe(true);
    expect(net.maxBreakouts).toBe(Math.max(...net.nodes.map((n) => n.breakouts)));
    for (const n of net.nodes) {
      expect(n.href).toBe(`/lab/breakouts?creator=${encodeURIComponent(n.id)}&sample=1`);
      expect(n.handle.startsWith('@')).toBe(true);
      for (const v of [n.x, n.y, n.z]) expect(Math.abs(v)).toBeLessThanOrEqual(1.2);
    }
  });
  it('a node counts exactly its own breakouts posted in the last 30 days', () => {
    const n = [...net.nodes].sort((a, b) => b.breakouts - a.breakouts)[0];
    const own = s.posts.all().filter((p) => p.sourceId === n.id && p.postedAt && NOW.getTime() - Date.parse(p.postedAt) <= 30 * DAY && NOW.getTime() >= Date.parse(p.postedAt) && s.measures.get(p.id)?.isBreakout);
    expect(n.breakouts).toBe(own.length);
  });
  it('edges link valid nodes, launch links outnumber topic links, at most three strongest per creator kept', () => {
    expect(net.edges.length).toBeGreaterThan(0);
    const keys = new Set<string>();
    for (const e of net.edges) {
      expect(e.a).toBeLessThan(e.b);
      expect(e.b).toBeLessThan(net.nodes.length);
      expect(['event', 'topic']).toContain(e.kind);
      expect(e.w).toBeGreaterThan(0);
      expect(e.w).toBeLessThanOrEqual(1);
      keys.add(`${e.a}:${e.b}`);
    }
    expect(keys.size).toBe(net.edges.length);
    expect(net.edges.length).toBeLessThanOrEqual(net.nodes.length * 3);
    expect(net.edges.some((e) => e.kind === 'event')).toBe(true);
  });
  it('the layout is deterministic: the same data draws the same shape', () => {
    expect(creatorNetwork(s, NOW, true)).toEqual(net);
  });
  it('the text summary names the counts', () => {
    expect(net.summary).toMatch(new RegExp(`^${net.nodes.length} tracked creators, \\d+ with breakouts in the last 30 days\\.`));
    expect(net.summary).toMatch(/Most breakouts: @\S+ \(\d+\)\.$/);
  });
  it('layout3d copes with 0, 1 and 2 nodes', () => {
    expect(layout3d(0, [])).toEqual([]);
    expect(layout3d(1, [])).toEqual([{ x: 0, y: 0, z: 0 }]);
    const two = layout3d(2, [{ a: 0, b: 1, w: 1 }]);
    expect(two).toHaveLength(2);
    for (const p of two) for (const v of [p.x, p.y, p.z]) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('breakout chart view model', () => {
  const s = fixtureStore();
  const c = breakoutChart(s, NOW, true);
  it('tracked posts from the last 14 days, by age and ratio, thinned to 160 with every breakout kept', () => {
    expect(c.state.kind).toBe('ready');
    expect(c.label).toBe('Breakouts');
    expect(c.points.length).toBeGreaterThan(20);
    expect(c.points.length).toBeLessThanOrEqual(160);
    const owned = new Set(s.posts.all().filter((p) => p.isOwned).map((p) => p.id));
    for (const p of c.points) {
      expect(owned.has(p.postId)).toBe(false);
      expect(p.ageD).toBeGreaterThanOrEqual(0);
      expect(p.ageD).toBeLessThanOrEqual(14);
      expect(p.ratio).toBeGreaterThan(0);
      expect(p.href).toBe(`?post=${encodeURIComponent(p.postId)}&sample=1`);
      expect(p.thisWeek).toBe(p.breakout && p.ageD <= 7);
      expect(p.ratio).toBeGreaterThanOrEqual(c.yDomain[0]);
    }
    expect(c.points.filter((p) => p.thisWeek)).toHaveLength(c.thisWeek);
    expect(c.points.filter((p) => p.breakout && !p.thisWeek)).toHaveLength(c.lastWeek);
    expect(c.thisWeek).toBeGreaterThan(0);
    expect(c.threshold).toBe(3);
  });
  it('breakouts draw last so they sit on top', () => {
    const firstB = c.points.findIndex((p) => p.breakout);
    expect(c.points.slice(firstB).every((p) => p.breakout)).toBe(true);
  });
  it('summary says this week and last week', () => {
    expect(c.summary).toContain(`${c.thisWeek} broke out this week, ${c.lastWeek} the week before.`);
  });
});

describe('empty and not-configured states', () => {
  it('a blank store: no creators says so and links to adding creators; no posts says so with a next step', () => {
    const g = heroGraphs(blankStore(), NOW, false);
    expect(g.network).toMatchObject({ nodes: [], edges: [], state: { kind: 'empty', message: HERO_GRAPH_COPY.noCreators, action: { label: 'Add creators', href: '?setup=sources&focus=add' } } });
    expect(g.chart).toMatchObject({ points: [], state: { kind: 'empty', message: HERO_GRAPH_COPY.noPosts, action: { label: 'Schedule runs', href: '?setup=schedule' } } });
  });
  it('creators but no posts: nodes without links, and the chart is empty', () => {
    const st = blankStore();
    for (const h2 of ['ana', 'ben']) st.sources.upsert({ id: `s-${h2}`, kind: 'tracked', platform: 'tiktok', handle: h2, url: null, displayName: h2, status: 'active', addedAt: NOW.toISOString(), reason: null, score: null });
    const g = heroGraphs(st, NOW, false);
    expect(g.network.state.kind).toBe('ready');
    expect(g.network.nodes.map((n) => n.breakouts)).toEqual([0, 0]);
    expect(g.network.edges).toEqual([]);
    expect(g.chart.state.kind).toBe('empty');
  });
  it('not configured: Today carries empty graphs and no data (the frame shows the set-up card)', async () => {
    const v = (await page('today', blankStore(), FLAGS.notConfigured)) as TodayPageView;
    expect(v.frame.mode.state).toBe('not_configured');
    expect(v.graphs.network.nodes).toEqual([]);
    expect(v.graphs.chart.points).toEqual([]);
    expect(v.graphs.network.state.kind).toBe('empty');
  });
  it('sample: Today carries both graphs, and Brief and Window stay in the view as the captions', async () => {
    const v = (await page('today', fixtureStore(), FLAGS.sample)) as TodayPageView;
    expect(v.graphs.network.nodes.length).toBeGreaterThan(5);
    expect(v.graphs.chart.points.length).toBeGreaterThan(20);
    expect(v.brief.sentence.length).toBeGreaterThan(0);
    expect(v.window.label).toBe('Window');
  });
  it('a failing graphs builder renders the error state, the rest of Today still builds', () => {
    const e = emptyHeroGraphs({ kind: 'error', message: 'x', action: null });
    expect(e.network.state.kind).toBe('error');
    expect(e.chart.state.kind).toBe('error');
  });
});

describe('Breakouts creator filter (the network links here)', () => {
  it('?creator=<source id> keeps only that creator\'s posts and counts as an applied filter', async () => {
    const s = fixtureStore();
    const net = creatorNetwork(s, NOW, true);
    const n = [...net.nodes].sort((a, b) => b.breakouts - a.breakouts)[0];
    const v = (await page('breakouts', s, FLAGS.sample, { creator: n.id })) as BreakoutsPageView;
    expect(v.applied.creator).toEqual({ id: n.id, label: n.handle });
    expect(v.clearHref).toBe('/lab/breakouts?sample=1');
    expect(v.cards.items.length).toBe(n.breakouts);
    const src = new Map(s.posts.all().map((p) => [p.id, p.sourceId]));
    for (const it2 of v.cards.items) expect(src.get(it2.postId)).toBe(n.id);
  });
  it('an unknown creator id is ignored, not an empty page', async () => {
    const v = (await page('breakouts', fixtureStore(), FLAGS.sample, { creator: 'nope' })) as BreakoutsPageView;
    expect(v.applied.creator).toBeNull();
    expect(v.cards.items.length).toBeGreaterThan(0);
  });
});

describe('NarrativeCard with a graph', () => {
  const s = fixtureStore();
  const g = heroGraphs(s, NOW, true);
  it('label on top, the graph, then the one-line caption with its tag and link, and the action', () => {
    const out = renderWithRouter(h(NarrativeCard, {
      kind: 'window', label: g.chart.label, visual: h(ChartVisual, { view: g.chart }), captionTag: 'Window',
      sentence: 'Astra 2 shipped 9h ago.', href: '?event=e1', state: 'ready', action: { label: 'Make this', onClick: () => undefined },
    }));
    expect(out).toContain('data-visual=""');
    expect(out).toContain('class="lab2-graph lab2-graph-chart"');
    expect(out).toContain('href="?event=e1"');
    const t = text(out);
    expect(t).toContain('Breakouts');
    expect(t).toContain('Window Astra 2 shipped 9h ago.');
    expect(t).toContain('Make this');
    expect(t).toContain(g.chart.summary);
  });
  it('the network graph is one keyboard stop with an accessible summary', () => {
    const out = renderWithRouter(h(NarrativeCard, { kind: 'brief', label: g.network.label, visual: h(NetworkVisual, { view: g.network }), captionTag: 'Brief', sentence: 'Hooks pull 2.0x.', state: 'ready' }));
    expect(out).toMatch(/class="lab2-graph lab2-graph-net" tabindex="0" role="application"/);
    expect(text(out)).toContain(g.network.summary);
    expect(text(out)).toContain('Creator network');
  });
  it('empty graphs show the plain message and the next step', () => {
    const e = heroGraphs(blankStore(), NOW, false);
    const out = text(renderWithRouter(h(NarrativeCard, { kind: 'brief', label: e.network.label, visual: h(NetworkVisual, { view: e.network }), captionTag: 'Brief', sentence: 'Not enough data yet.', state: 'thin' })));
    expect(out).toContain(HERO_GRAPH_COPY.noCreators);
    expect(out).toContain('Add creators');
  });
});

describe('tokens only', () => {
  it('the graph component and view model carry no raw colour; the canvas reads --lab-narr-ink', () => {
    const tsx = readFileSync('components/lab/v2/shared/HeroGraphs.tsx', 'utf8');
    const engine = readFileSync('components/lab/v2/shared/graph3d.ts', 'utf8');
    const ts = readFileSync('lib/lab/view/hero-graphs.ts', 'utf8');
    for (const src of [tsx, engine, ts]) {
      const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(body).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}\b/);
      expect(body).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/);
    }
    expect(tsx).toContain("readInk(el, '--lab-narr-ink', '--lab-narr-paper')");
    expect(engine).toContain('color:var(${inkVar});background-color:var(${paperVar})');
  });
  it('the hero-graph CSS block uses tokens only', () => {
    const css = readFileSync('app/globals.css', 'utf8');
    const start = css.indexOf("/* Today's hero graphs");
    const block = css.slice(start, css.indexOf('/* Tile and TileRow', start)).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(start).toBeGreaterThan(0);
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(block).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/);
  });
  it('prefers-reduced-motion stops the rotation', () => {
    const tsx = readFileSync('components/lab/v2/shared/HeroGraphs.tsx', 'utf8') + readFileSync('components/lab/v2/shared/graph3d.ts', 'utf8');
    expect(tsx).toContain("matchMedia?.('(prefers-reduced-motion: reduce)')");
    expect(tsx).toMatch(/if \(!still && !paused\) st\.current\.yaw \+=/);
  });
});
