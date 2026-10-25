/**
 * Content Lab under Bennett Legacy (founderos-ui pages/lab.md; lane fo/l-lab). The Lab's own Legacy tree
 * (components/lab/v2/legacy) for the six pages, Creatorverse and the seven sheets.
 *
 * LB-1  The Legacy tree renders from the same page models: the route hands each tree the identical
 *       buildPageView output (deep-equal across GladOS, Classic and Legacy, and to a direct build), and
 *       every page and sheet renders from the fixture world's models with no adapter of its own.
 * Plus: no GladOS kit marker or class in the Legacy DOM, every Classic action exists in the Legacy tree,
 * honest text (no template slot or undefined), the registry (L_READY, slab), and the source rules.
 * LB-2 (the frames gate under Legacy) is browser-side: scripts/lab-frames.mjs --legacy.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement as h, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { PathnameContext, SearchParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { LAB_PAGES, type LabPage } from '@/lib/lab/view/shared';
import type { SheetPayload } from '@/lib/lab/view/index';
import { L_NO_SLAB, L_READY, isLReady, isLegacyWorkspace } from '@/lib/l-ready';
import { FIXTURE_IDS, FLAGS, NOW, fixtureStore, page, sheet } from './helpers/lab-v2-v';

const APPEARANCE = vi.hoisted(() => ({ ui: 'legacy' as 'legacy' | 'glados' | 'classic' }));
const CTX = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('@/lib/appearance-server', () => ({
  getAppearance: () => ({ ui: APPEARANCE.ui, accent: 'ice', mode: 'dark', theme: APPEARANCE.ui === 'legacy' ? 'monolith' : 'console' }),
}));
vi.mock('@/lib/lab/context', async (orig) => {
  const real = await orig<typeof import('@/lib/lab/context')>();
  return { ...real, resolveLab: () => CTX.value };
});

import * as L from '@/components/lab/v2/legacy';
import * as C from '@/components/lab/v2/classic';
import * as G from '@/components/lab/v2/g';
import { renderLab } from '@/app/lab/_render';
import { buildPageView } from '@/lib/lab/view/build';
import { labParamsFrom } from '@/lib/lab/context';
import { SheetHost } from '@/components/lab/v2/legacy/sheets/SheetHost';
import { LabStyleProvider } from '@/components/lab/v2/shared/kitMark';

const ROUTER = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} } as unknown as React.ContextType<typeof AppRouterContext>;
const realError = console.error;
const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
  if (!String(a[0]).includes('useLayoutEffect does nothing on the server')) realError(...a);
});
afterAll(() => spy.mockRestore());

function render(el: ReactElement, path: string, search = 'sample=1'): string {
  return renderToStaticMarkup(
    h(AppRouterContext.Provider, { value: ROUTER },
      h(PathnameContext.Provider, { value: path },
        h(SearchParamsContext.Provider, { value: new URLSearchParams(search) as never },
          h(LabStyleProvider, { legacy: true, children: el })))),
  );
}

type Tree = typeof L;
const pageOf = (T: Tree | typeof C | typeof G, p: LabPage) =>
  ({ today: T.TodayPage, radar: T.RadarPage, breakouts: T.BreakoutsPage, playbook: T.PlaybookPage, studio: T.StudioPage, ledger: T.LedgerPage, creatorverse: T.CreatorversePage })[p] as unknown as (props: { view: never }) => ReactElement;

/**
 * What a page lets you do: every link by its destination, every button by its visible label or
 * aria-label (lower-cased). Links are compared by href because the trees word the same link differently.
 */
function actions(html: string): Set<string> {
  const out = new Set<string>();
  const dec = (t: string) => t.replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');
  for (const m of html.matchAll(/<a\b([^>]*)>/g)) {
    const href = /href="([^"]+)"/.exec(m[1])?.[1];
    if (!href) continue;
    // one query param once (Classic appends sample=1 to hrefs that already carry it)
    const [path, q = ''] = dec(href).split('?');
    const seen = new URLSearchParams();
    for (const [k, v] of new URLSearchParams(q)) if (!seen.has(k)) seen.set(k, v);
    out.add(`link ${path}${seen.toString() ? `?${seen}` : ''}`);
  }
  for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const aria = /aria-label="([^"]+)"/.exec(m[1])?.[1];
    const label = dec(aria ?? m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().toLowerCase();
    // the same words in any order (the trees lay a row's parts out differently)
    if (label) out.add(`button ${label.split(' ').sort().join(' ')}`);
  }
  return out;
}

describe('LB-1 the Legacy tree renders from the same page models', () => {
  beforeAll(() => {
    CTX.value = { store: fixtureStore(), readOnly: true, flags: FLAGS.sample }; vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); });
  afterAll(() => vi.useRealTimers());

  for (const p of LAB_PAGES) {
    it(`${p.id}: the route hands GladOS, Classic and Legacy the identical page model`, async () => {
      const sp = { sample: '1' };
      APPEARANCE.ui = 'legacy';
      const l = (await renderLab(p.id, sp)) as ReactElement<{ view: unknown }>;
      APPEARANCE.ui = 'classic';
      const c = (await renderLab(p.id, sp)) as ReactElement<{ view: unknown }>;
      APPEARANCE.ui = 'glados';
      const g = (await renderLab(p.id, sp)) as ReactElement<{ view: unknown }>;
      expect(l.type).toBe(pageOf(L, p.id));
      expect(c.type).toBe(pageOf(C, p.id));
      expect(g.type).toBe(pageOf(G, p.id));
      expect(l.props.view).toEqual(c.props.view);
      expect(l.props.view).toEqual(g.props.view);
      // and to the builder's own output for the same request (no adapter, no extra field)
      const direct = await buildPageView(p.id, fixtureStore(), labParamsFrom(sp), FLAGS.sample, new Date());
      expect(l.props.view).toEqual(direct);
    });
  }

  it('a deep-linked sheet rides through unchanged (post, script, setup)', async () => {
    APPEARANCE.ui = 'legacy';
    for (const sp of [{ sample: '1', post: FIXTURE_IDS.firstPost }, { sample: '1', script: FIXTURE_IDS.script }, { sample: '1', setup: 'spend' }]) {
      const l = (await renderLab('radar', sp)) as ReactElement<{ view: { sheet: SheetPayload | null } }>;
      APPEARANCE.ui = 'classic';
      const c = (await renderLab('radar', sp)) as ReactElement<{ view: { sheet: SheetPayload | null } }>;
      APPEARANCE.ui = 'legacy';
      expect(l.props.view.sheet).not.toBeNull();
      expect(l.props.view.sheet).toEqual(c.props.view.sheet);
    }
  });
});

describe('the seven Legacy pages on the fixture world', () => {
  for (const p of LAB_PAGES) {
    it(`${p.id}: Legacy kit only, honest text, every Classic action present`, async () => {
      const view = await page(p.id, fixtureStore(), FLAGS.sample);
      const html = render(h(pageOf(L, p.id), { view: view as never }), p.path);
      const classic = render(h(pageOf(C, p.id), { view: view as never }), p.path);
      expect(html).toContain('data-lab-tree="legacy"');
      expect(html).toContain(`data-lab-page="${p.id}"`);
      for (const part of ['SlabTitle', ...(p.id === 'creatorverse' ? [] : ['SlabCard']), 'LabPages', 'LabTools', 'LabRun']) expect(html, part).toContain(`data-l="${part}"`);
      expect(html).toContain('// Content Lab · ');
      // AC-6: no GladOS kit marker or class in the Legacy DOM, and none of the other trees' chrome
      expect(html).not.toMatch(/\bdata-g=/);
      expect(html).not.toMatch(/class="[^"]*\bg-[a-z0-9]/);
      expect(html).not.toMatch(/\blab2[cg]-(page|head|tab|panel|btn)\b/);
      // honest text: no template slot, undefined or NaN leaked into the page
      expect(html).not.toMatch(/>[^<]*\b(undefined|NaN|null)\b[^<]*</);
      expect(html).not.toMatch(/>[^<]*\{[a-zA-Z]+\}[^<]*</);
      // every action the Classic tree offers on this page exists in the Legacy tree
      const want = actions(classic);
      const got = actions(html);
      const missing = [...want].filter((a) => !got.has(a) && !LEGACY_RELABELLED.has(a));
      expect(missing, p.id).toEqual([]);
    });
  }

  it('Today: the window BigStat, the Radar DotMatrix, one InsightCard, the ledger line, both graphs, ideas as SlabCards', async () => {
    const view = await page('today', fixtureStore(), FLAGS.sample);
    const html = render(h(L.TodayPage, { view }), '/lab');
    for (const part of ['BigStat', 'DotMatrix', 'InsightCard', 'LabLedgerLine', 'LabScrubber']) expect(html, part).toContain(`data-l="${part}"`);
    expect(html.split('data-l="InsightCard"').length - 1).toBe(1);
    expect(html).toContain('aria-roledescription="graph"');
    expect(html).toContain('aria-roledescription="chart"');
    expect(html).toContain(view.ledgerLine.sentence);
    for (const r of view.nextToMake.rows.slice(0, 3)) expect(html).toContain(r.title.replace(/&/g, '&amp;').replace(/'/g, '&#x27;'));
  });

  it('Radar: the timeline is a scatter of square pings, waves are StepLines, windows a MeterStack', async () => {
    const view = await page('radar', fixtureStore(), FLAGS.sample);
    const html = render(h(L.RadarPage, { view }), '/lab/radar');
    expect(html).toContain('data-l="LabScatter"');
    expect(html).toContain('l-lab-ping');
    expect(html).toContain('data-l="StepLine"');
    expect(html).toContain('data-l="MeterStack"');
    for (const l of view.timeline.lanes.slice(0, 3)) expect(html).toContain(`href="${l.href.replace(/&/g, '&amp;')}"`);
  });

  it('Breakouts: specimen cards with the post frame and the age-matched read as a chip; the Field in squares', async () => {
    const view = await page('breakouts', fixtureStore(), FLAGS.sample);
    const html = render(h(L.BreakoutsPage, { view }), '/lab/breakouts');
    expect(html).toContain('data-l="Field"');
    expect(html.split('data-lab-card="specimen"').length - 1).toBe(view.cards.items.length);
    expect(html.split('data-l="PostFrame"').length - 1).toBe(view.cards.items.length);
  });

  it('Ledger: hidden predictors are greyed with the "does not beat your normal" chip and show no number', async () => {
    const view = await page('ledger', fixtureStore(), FLAGS.sample);
    const html = render(h(L.LedgerPage, { view }), '/lab/ledger');
    const hidden = view.ledger?.predictors.filter((p) => !p.shown) ?? [];
    if (hidden.length) expect(html).toContain('does not beat your normal');
    expect(html.split('data-hidden=""').length - 1).toBe(hidden.length);
  });

  it('a not-configured install shows the err chip and Set up, never a number', async () => {
    const { blankStore } = await import('./helpers/lab-v2-v');
    const view = await page('today', blankStore(), FLAGS.notConfigured);
    const html = render(h(L.TodayPage, { view }), '/lab', '');
    expect(html).toContain('data-lab-empty=""');
    expect(html).toContain('data-l="SetupLink"');
    expect(html).toContain('Not configured');
  });
});

/** Classic labels the Legacy tree draws differently on purpose (same action, FO wording or an icon). */
const LEGACY_RELABELLED = new Set<string>([
  // Classic's skip link target is the same #lab-main; nothing else is relabelled
  'link #lab-main',
]);

describe('the seven Legacy sheets on the fixture world', () => {
  const cases: [Parameters<typeof sheet>[0], string][] = [
    ['post', FIXTURE_IDS.firstPost], ['event', FIXTURE_IDS.event], ['idea', FIXTURE_IDS.idea], ['script', FIXTURE_IDS.script],
    ['test', FIXTURE_IDS.test], ['test', 'new'], ['setup', 'checklist'], ['setup', 'keys'], ['setup', 'sources'], ['setup', 'schedule'], ['setup', 'spend'], ['ask', 'tiktok breakouts this month'],
  ];
  for (const [kind, id] of cases) {
    it(`${kind} ${id}: an FO panel with the sheet body, Legacy kit only`, async () => {
      const payload = await sheet(kind, id, fixtureStore(), FLAGS.sample);
      const view = await page('radar', fixtureStore(), FLAGS.sample);
      const html = render(h(SheetHost, { initial: payload, frame: view.frame }), '/lab/radar', `sample=1&${kind}=${encodeURIComponent(id)}`);
      expect(html).toContain('data-l="LabSheet"');
      expect(html).toContain('data-l="Panel"');
      expect(html).toContain('role="dialog"');
      expect(html).not.toMatch(/\bdata-g=/);
      expect(html).not.toMatch(/class="[^"]*\bg-[a-z0-9]/);
      expect(html).not.toMatch(/>[^<]*\b(undefined|NaN)\b[^<]*</);
      expect(html.length).toBeGreaterThan(800);
    });
  }
});

describe('registry and source rules', () => {
  it('the seven routes are in L_READY and sit on the slab', () => {
    for (const p of LAB_PAGES) {
      expect(isLReady(p.path), p.path).toBe(true);
      expect(isLegacyWorkspace(p.path), p.path).toBe(false);
    }
    expect(L_READY).toContain('/lab/creatorverse');
    expect(L_NO_SLAB).not.toContain('/lab');
  });

  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
  const files = walk(join(process.cwd(), 'components/lab/v2/legacy'));

  it('the tree uses the Legacy kit and its own l-lab classes, never the other trees\' chrome', () => {
    for (const f of files.filter((x) => x.endsWith('.tsx'))) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/className="[^"]*\b(lab2c|lab2g)-/);
      expect(src, f).not.toMatch(/data-g=/);
      expect(src, f).not.toMatch(/from '\.\.\/(g|classic)\/(?!hooks|adapt|geom)/);
    }
  });

  it('every selector in the tree\'s stylesheet is Legacy-scoped (l-lab classes or the legacy root)', () => {
    const css = readFileSync(join(process.cwd(), 'components/lab/v2/legacy/lab-legacy.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const selectors = [...css.matchAll(/(^|})\s*([^{}@]+?)\s*{/g)].map((m) => m[2].trim()).filter((s) => !/^(from|to|\d+%)/.test(s));
    for (const group of selectors) {
      for (const sel of group.replace(/:(is|has|not)\([^()]*\)/g, '').split(',').map((s) => s.trim())) {
        expect(/\.l-lab-|data-lab-style='legacy'|\.l-btn-icon-xs|^\.lab\[data-lab-root\]\[data-lab-style='legacy'\]|^html\[data-ui='legacy'\]/.test(sel), sel).toBe(true);
      }
    }
  });
});
