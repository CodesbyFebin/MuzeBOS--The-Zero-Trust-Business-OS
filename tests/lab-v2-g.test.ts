/**
 * Lane U1: the GladOS Lab tree (components/lab/v2/g) on lane V's page models over the fixture world.
 * Server render of all six pages (AC-03-10, AC-02-38), the intro script (AC-03-14), sheet openers carry
 * data-lab-shared (AC-03-15), the run poller's timing (AC-09-20), and static guards for the GP4 control
 * rule (AC-02-37's source half) and tokens-only styles (AC-02-10 for the tree's CSS).
 */
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { createElement as h, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { PathnameContext, SearchParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { LAB_DDL } from '@/lib/db';
import { labStore } from '@/lib/lab/store';
import { seedLabFixtures } from '@/lib/lab/fixtures';
import { buildPageView } from '@/lib/lab/view/build';
import { labParams } from '@/lib/lab/context';
import { LAB_PAGES, type LabPage } from '@/lib/lab/view/shared';
import * as G from '@/components/lab/v2/g';
import { LAB_INTRO_SCRIPT } from '@/components/lab/v2/shared/motion/LabIntroScript';
import { POLL_MS, RunPoller, pollDelay } from '@/components/lab/v2/shared/runPoller';
import { waveBuckets } from '@/components/lab/v2/g/adapt';
import type { BatchProgress } from '@/lib/lab/setup/progress';

const NOW = new Date('2026-10-11T15:00:00.000Z');
const FLAGS = { configured: true, sample: true, filming: false, dry: false, dryReason: null, dryLabel: null, setupHref: '/lab?setup=keys', fixtureName: 'Sample', agentName: 'Content Lab' } as const;
const ENV = { GLADOS_TZ: 'UTC' };
const ROUTER = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} } as unknown as React.ContextType<typeof AppRouterContext>;

const realError = console.error;
const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
  if (!String(a[0]).includes('useLayoutEffect does nothing on the server')) realError(...a);
});
afterAll(() => spy.mockRestore());

function world() {
  const db = new Database(':memory:');
  db.exec(LAB_DDL);
  const store = labStore(db);
  seedLabFixtures(store, NOW);
  return store;
}

function render(el: ReactElement, path: string): string {
  return renderToStaticMarkup(
    h(AppRouterContext.Provider, { value: ROUTER },
      h(PathnameContext.Provider, { value: path },
        h(SearchParamsContext.Provider, { value: new URLSearchParams('sample=1') as never }, el))),
  );
}

const PAGE_COMPONENT: Record<LabPage, (p: { view: never }) => ReactElement> = {
  today: G.TodayPage as never,
  radar: G.RadarPage as never,
  breakouts: G.BreakoutsPage as never,
  playbook: G.PlaybookPage as never,
  studio: G.StudioPage as never,
  ledger: G.LedgerPage as never,
  creatorverse: G.CreatorversePage as never,
};

describe('the six GladOS pages render on the fixture world (server)', () => {
  const store = world();
  for (const p of LAB_PAGES) {
    it(`${p.id}: renders at rest, one Aurora, no intro marks, no hidden-at-rest content`, async () => {
      const view = await buildPageView(p.id, store, labParams((k) => (k === 'sample' ? '1' : null)), { ...FLAGS }, NOW, { env: ENV });
      const html = render(h(PAGE_COMPONENT[p.id], { view: view as never }), p.path);
      expect(html).toContain('lab2g-page');
      expect(html).toContain(`data-lab-page="${p.id}"`);
      // AC-02-38: the shell wraps itself in LabRoot when no layout root is present; one Aurora either way
      expect(html.split('lab2-aurora').length - 1).toBe(1);
      // AC-03-10: server HTML is at rest
      expect(html).not.toContain('data-lab-intro=');
      expect(html).not.toMatch(/style="[^"]*opacity:\s*0(?![.\d])/);
      // honest text: no template slot or undefined leaked into the page
      expect(html).not.toMatch(/>[^<]*\b(undefined|NaN)\b[^<]*</);
      expect(html).not.toMatch(/>[^<]*\{[a-zA-Z]+\}[^<]*</);
    });
  }

  it('AC-03-10 Today: each hero prints its formatted value in the server HTML', async () => {
    const view = await buildPageView('today', store, labParams((k) => (k === 'sample' ? '1' : null)), { ...FLAGS }, NOW, { env: ENV });
    const html = render(h(G.TodayPage, { view }), '/lab');
    const all = view.heroes.all;
    expect(all).toBeTruthy();
    const texts = [all!.yourNormal.value.text, all!.breakouts.value.text].filter((t): t is string => !!t);
    expect(texts.length).toBeGreaterThan(0);
    // the numeral is drawn without its unit (the unit is a superscript), so match the number part
    for (const t of texts) expect(html).toContain(t.replace(/x$/, ''));
  });
});

describe('AC-03-14 the intro pre-script', () => {
  it('is a constant string guarded by try and touching only the allowed APIs', () => {
    expect(typeof LAB_INTRO_SCRIPT).toBe('string');
    expect(LAB_INTRO_SCRIPT).toContain('try');
    const apis = new Set(LAB_INTRO_SCRIPT.match(/\b(window\.[a-zA-Z]+|document\.[a-zA-Z.]+|sessionStorage|localStorage|performance\.[a-z]+|fetch|eval|setTimeout)\b/g) ?? []);
    for (const a of apis) expect(['window.matchMedia', 'document.documentElement', 'document.visibilityState', 'sessionStorage', 'performance.now']).toContain(a);
  });
});

const G_FILES = globSync('components/lab/v2/g/**/*.tsx');

describe('AC-03-15 every sheet opener in the GladOS tree is a shared-element origin', () => {
  it('each element whose href opens a sheet carries data-lab-shared (or says it opens no sheet)', () => {
    const bad: string[] = [];
    const SHEET_HREF = /href=\{?[`'"][^`'"]*\?(?:[^`'"]*&)?(post|event|idea|script|test|ask)=/;
    for (const f of G_FILES) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/<(a|Link)\b[^>]*?>/gs)) {
        const tag = m[0];
        if (!SHEET_HREF.test(tag)) continue;
        if (!/data-lab-shared=|data-lab-no-sheet/.test(tag)) bad.push(`${f}: ${tag.slice(0, 90)}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('no second origin registry and no second SheetKind', () => {
    for (const f of [...G_FILES, ...globSync('components/lab/v2/shared/**/*.{ts,tsx}')]) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/data-lab-origin|findOrigin|LabSheetKind|type SheetKind\s*=/);
    }
  });
});

describe('AC-02-37 (source half) the GP4 control guard in the GladOS tree', () => {
  it('every raw link, button and disclosure carries a data-g name or a reasoned data-g-exempt', () => {
    const bad: string[] = [];
    for (const f of G_FILES) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/<(a|Link|button|summary)(?=[\s>])([^>]|=>)*?>/gs)) {
        if (/data-g=|\{\.\.\./.test(m[0])) continue;
        bad.push(`${f}: ${m[0].slice(0, 80)}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('no Classic control classes in the tree', () => {
    for (const f of G_FILES) expect(readFileSync(f, 'utf8'), f).not.toMatch(/className="[^"]*\b(c-btn|c-chip|wz-chip|ib-btn|ae-btn)\b/);
  });
});

describe('AC-02-10 the GladOS tree stylesheet', () => {
  const css = readFileSync('components/lab/v2/g/lab-g.css', 'utf8') + readFileSync('app/lab/lab-root.css', 'utf8');
  it('uses tokens only: no raw hex, rgb or hsl colour', () => {
    const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(body).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/);
  });
  it('every :hover rule sits inside (hover: hover) and (pointer: fine)', () => {
    const outside = css.replace(/@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\n\}/g, '');
    expect(outside).not.toMatch(/:hover/);
  });
  it('no transition: all', () => {
    expect(css).not.toMatch(/transition(-property)?:\s*all/);
  });
});

describe('Radar tile wave (frames shape: covering so far, resampled)', () => {
  it('ends on the covered count and never has more than 28 columns', () => {
    const series = Array.from({ length: 200 }, (_, h) => ({ h, creators: Math.min(12, Math.floor(h / 10)) }));
    const b = waveBuckets(series);
    expect(b.length).toBeLessThanOrEqual(28);
    expect(b[0]).toBe(0);
    expect(b[b.length - 1]).toBe(12);
    for (let i = 1; i < b.length; i++) expect(b[i]).toBeGreaterThanOrEqual(b[i - 1]);
  });
  it('a launch covered in its first hour still rises from zero (no flat slab), within 28 columns at any length', () => {
    expect(waveBuckets(Array.from({ length: 10 }, (_, h) => ({ h, creators: 3 })))).toEqual([0, 3, 3, 3]);
    for (const n of [7, 49, 182, 481, 2000]) {
      const b = waveBuckets(Array.from({ length: n }, (_, h) => ({ h, creators: 5 })));
      expect(b.length).toBeLessThanOrEqual(28);
      expect(b[b.length - 1]).toBe(5);
    }
  });
  it('a series too short to draw gives no wave', () => {
    expect(waveBuckets([{ h: 0, creators: 1 }])).toEqual([]);
  });
});

describe('AC-09-20 the run poller', () => {
  const batch = (state: BatchProgress['state'], startedAt: string): BatchProgress => ({ state, startedAt } as unknown as BatchProgress);

  it('waits 4 s, then 8 s once the batch is 2 minutes old, then 15 s after 10 minutes; failures back off to 60 s', () => {
    expect(pollDelay(0, 0)).toBe(POLL_MS.base);
    expect(POLL_MS.base).toBe(4000);
    expect(pollDelay(119_999, 0)).toBe(4000);
    expect(pollDelay(120_000, 0)).toBe(8000);
    expect(pollDelay(600_000, 0)).toBe(15000);
    expect(pollDelay(0, 1)).toBe(8000);
    expect(pollDelay(0, 10)).toBe(60000);
  });

  it('schedules from the batch age, pauses while hidden, polls once on show, stops on a terminal batch', async () => {
    let now = 1_000_000;
    let hidden = false;
    const timers: { fn: () => void; ms: number }[] = [];
    const states: BatchProgress['state'][] = ['running', 'running', 'running', 'done'];
    const fetched: string[] = [];
    let ended: BatchProgress | null | undefined;
    const p = new RunPoller({
      fetchBatch: async (id) => {
        fetched.push(id);
        return batch(states.shift() ?? 'done', new Date(Date.now()).toISOString());
      },
      now: () => now,
      setTimer: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; },
      clearTimer: (t) => { const i = timers.indexOf(t as never); if (i >= 0) timers.splice(i, 1); },
      hidden: () => hidden,
      onUpdate: () => {},
      onEnd: (b) => { ended = b; },
    });
    p.resume('b-1');
    await Promise.resolve(); await Promise.resolve();
    expect(fetched).toEqual(['b-1']);
    expect(timers.at(-1)?.ms).toBe(4000);
    // 2 minutes in: the next wait is 8 s
    now += 130_000;
    timers.shift()!.fn();
    await Promise.resolve(); await Promise.resolve();
    expect(p.delays.at(-1)).toBe(8000);
    // hidden: the pending timer is dropped and nothing polls
    hidden = true;
    p.visibilityChanged();
    expect(timers.length).toBe(0);
    // shown: one immediate poll
    hidden = false;
    p.visibilityChanged();
    await Promise.resolve(); await Promise.resolve();
    expect(fetched.length).toBe(3);
    // resuming the same batch (a page change) does not double-poll
    p.resume('b-1');
    expect(fetched.length).toBe(3);
    timers.shift()!.fn();
    await Promise.resolve(); await Promise.resolve();
    expect(ended?.state).toBe('done');
    expect(p.active).toBeNull();
  });
});
