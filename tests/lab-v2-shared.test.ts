/**
 * Static render tests of the Content Lab v2 shared components (02 section 17). Keyboard and focus checks
 * that need a DOM (AC-02-23 arrows, AC-02-26 Escape, AC-02-27, AC-02-28 trap, AC-02-29, AC-02-32) are
 * U1's, against a jsdom or browser harness this repo does not ship yet.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement as h } from 'react';
import { describe, expect, it } from 'vitest';
import {
  ActionPill, ArrowButton, Aurora, DotMatrix, HeroMetric, IconArrowUpRight, IconPlus, IconSearch, NarrativeCard, PeriodScrubber, PlusButton,
  RoundButton, SearchPill, Segmented, Sheet, Tile, TileRow, litCounts, splitUnit, stepWindowT, type HeroMetricProps, type TileProps,
} from '@/components/lab/v2/shared';
import { frameToday } from '@/lib/lab/view/frames';
import { renderWithRouter } from './helpers/render-client';

const d = frameToday('default');
const hero = (o: Partial<HeroMetricProps> = {}): HeroMetricProps => ({ ...d.heroes[0], state: 'ready', ...o });
const tile = (o: Partial<TileProps> = {}): TileProps => ({ ...d.yourPosts[0], ...o });
const html = (el: Parameters<typeof renderWithRouter>[0]) => renderWithRouter(el);
const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('AC-02-11 every shared root carries data-lab and data-g', () => {
  const cases: [string, ReturnType<typeof h>][] = [
    ['Aurora', h(Aurora)],
    ['HeroMetric', h(HeroMetric, hero())],
    ['DotMatrix', h(DotMatrix, { groups: d.heroes[0].groups, label: 'x' })],
    ['NarrativeCard', h(NarrativeCard, d.brief)],
    ['Tile', h(Tile, tile())],
    ['TileRow', h(TileRow, { title: 'Your posts', description: 'x' })],
    ['PeriodScrubber', h(PeriodScrubber, { periods: d.periods })],
    ['Segmented', h(Segmented, { label: 'x', options: d.segmented })],
    ['ActionPill', h(ActionPill, { label: 'Add source', href: '?x=1' })],
    ['PlusButton', h(PlusButton, { label: 'Create', items: d.createMenu })],
    ['RoundButton', h(RoundButton, { label: 'Setup', icon: 'menu', href: '?setup=keys' })],
    ['ArrowButton', h(ArrowButton, { label: 'Open', href: '#' })],
    ['SearchPill', h(SearchPill, {})],
    ['Sheet', h(Sheet, { kind: 'post', open: true, onClose: () => {}, title: 'Post' })],
  ];
  for (const [name, el] of cases) {
    it(name, () => {
      const out = html(el);
      expect(out).toMatch(new RegExp(`data-lab="${name}"`));
      expect(out).toMatch(new RegExp(`data-g="Lab(${name}|Narrative)"`));
    });
  }
});

describe('HeroMetric', () => {
  it('AC-02-12 ready with n 3 renders not enough yet, no numeral, no delta, n 3', () => {
    const out = text(html(h(HeroMetric, hero({ n: 3, nText: 'n 3' }))));
    expect(out).toContain('not enough yet');
    expect(out).not.toContain('1.4');
    expect(out).not.toContain('+18%');
    expect(out).toContain('n 3');
  });
  it('AC-02-13 not configured renders the copy and a SetupLink to the href', () => {
    const out = html(h(HeroMetric, hero({ state: 'not-configured', setupHref: '?setup=keys' })));
    expect(text(out)).toContain('Not configured');
    expect(out).toContain('href="?setup=keys"');
    expect(text(out)).toContain('Set up');
  });
});

describe('DotMatrix', () => {
  it('AC-02-14 lit counts follow dotFill on the worked example', () => {
    const prev = [0.9, 1.1, 1.0, 1.3, 0.8, 1.2, 1.0, 1.1, 1.4, 1.2];
    const cur = [1.3, 1.6, 1.2, 1.9, 1.5, 1.1, 1.4, 1.7, 1.3, 1.6];
    expect(litCounts(cur, 5, 1.9)[3]).toBe(5);
    expect(litCounts(prev, 5, 1.9)[4]).toBe(2);
    expect(litCounts([0.05, 0, null], 5, 1.9)).toEqual([1, 0, 0]);
  });
  it('AC-02-15 renders no group whose values are all null', () => {
    const out = html(h(DotMatrix, { label: 'x', groups: [{ id: 'gone', label: 'gone', values: [null, null], emphasis: 'context' }, ...d.heroes[0].groups] }));
    expect(out).not.toContain('data-group="gone"');
    expect(out).toContain('data-group="cur"');
  });
});

describe('AC-02-17 splitUnit', () => {
  it('splits the 2.5 examples', () => {
    expect(splitUnit('1.4x', 'ratio')).toEqual({ text: '1.4', unit: 'x' });
    expect(splitUnit('12.6x', 'ratio')).toEqual({ text: '12.6', unit: 'x' });
    expect(splitUnit('441', 'count')).toEqual({ text: '441', unit: null });
    expect(splitUnit('12,034', 'count')).toEqual({ text: '12,034', unit: null });
    expect(splitUnit('62%', 'percent')).toEqual({ text: '62', unit: '%' });
    expect(splitUnit('$8.20', 'money')).toEqual({ text: '8.20', unit: '$' });
    expect(splitUnit('9h', 'hours')).toEqual({ text: '9', unit: 'h' });
    expect(splitUnit('2d', 'hours')).toEqual({ text: '2', unit: 'd' });
    expect(splitUnit('not enough yet', 'ratio')).toEqual({ text: 'not enough yet', unit: null });
  });
});

describe('Tile', () => {
  it('AC-02-18 ready with n 4 is thin; too-new shows its copy', () => {
    expect(text(html(h(Tile, tile({ n: 4, nText: 'n 4' }))))).toContain('not enough yet');
    const nw = text(html(h(Tile, d.yourPosts[3])));
    expect(nw).toContain('too new');
    expect(nw).toContain('judged from 6h');
  });
  it('AC-02-19 one link, nothing interactive inside, aria-label carries n', () => {
    const out = html(h(Tile, tile()));
    expect(out.match(/<a\b/g)?.length).toBe(1);
    expect(out).not.toMatch(/<button\b/);
    expect(out).toMatch(/aria-label="[^"]*n 12"/);
  });
});

describe('NarrativeCard', () => {
  it('AC-02-20 window t is stepped to 0.05 and none forces 1', () => {
    expect(stepWindowT(0.137)).toBe(0.15);
    expect(html(h(NarrativeCard, { ...frameToday('window-open').window, windowT: 0.137 }))).toContain('--lab-window-t:0.15');
    expect(html(h(NarrativeCard, { ...frameToday('window-none').window, windowT: 0.2 }))).toContain('--lab-window-t:1');
  });
  it('AC-02-21 copy for thin, none and not configured', () => {
    const thin = text(html(h(NarrativeCard, { kind: 'brief', label: 'Brief', sentence: null, state: 'thin' })));
    expect(thin).toContain('Not enough data yet.');
    expect(thin).toContain('The Brief needs n 8 or more.');
    const none = text(html(h(NarrativeCard, { kind: 'window', label: 'Window', sentence: null, state: 'none', meta: 'Next check 14:30.' })));
    expect(none).toContain('No open windows.');
    expect(none).toContain('Next check 14:30.');
    const nc = html(h(NarrativeCard, { kind: 'window', label: 'Window', sentence: null, state: 'not-configured', setupHref: '?setup=keys' }));
    expect(text(nc)).toContain('Not configured');
    expect(nc).toContain('href="?setup=keys"');
  });
  it('AC-02-22 href and action never nest links', () => {
    const out = html(h(NarrativeCard, frameToday('window-open').window));
    expect(out.match(/<a\b/g)?.length).toBe(2);
    expect(out).not.toMatch(/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<(a|button)\b/);
  });
});

describe('controls', () => {
  it('AC-02-23 Segmented is a tablist with one selected tab', () => {
    const out = html(h(Segmented, { label: 'Today view', options: d.segmented }));
    expect(out).toContain('role="tablist"');
    expect(out.match(/aria-selected="true"/g)?.length).toBe(1);
  });
  it('AC-02-25 PeriodScrubber exposes a slider and disables its end', () => {
    const out = html(h(PeriodScrubber, { periods: d.periods }));
    expect(out).toContain('role="slider"');
    expect(out).toContain('aria-valuenow="3"');
    expect(out).toContain('aria-valuetext="This week"');
    expect(out).toMatch(/aria-label="Next period"[^>]*aria-disabled="true"|aria-disabled="true"[^>]*aria-label="Next period"/);
  });
  it('AC-02-26 PlusButton is a menu button', () => {
    const out = html(h(PlusButton, { label: 'Create', items: d.createMenu }));
    expect(out).toContain('aria-haspopup="menu"');
    expect(out).toContain('aria-expanded="false"');
  });
  it('AC-02-28 Sheet is a modal dialog labelled by its title', () => {
    const out = html(h(Sheet, { kind: 'post', open: true, onClose: () => {}, title: 'Post' }));
    expect(out).toContain('role="dialog"');
    expect(out).toContain('aria-modal="true"');
    expect(out).toMatch(/aria-labelledby="([^"]+)"[\s\S]*id="\1"/);
  });
  it('AC-02-40 icons are inline stroke SVG, aria-hidden', () => {
    for (const I of [IconPlus, IconSearch, IconArrowUpRight]) {
      const out = html(h(I, {}));
      expect(out).toContain('stroke="currentColor"');
      expect(out).toContain('aria-hidden="true"');
      expect(out).toContain('fill="none"');
    }
  });
});

describe('AC-02-46 sheet motion comes from lib/lab/motion.ts', () => {
  it('Sheet.tsx holds no literal duration or easing; the FLIP uses LAB_DUR.m and LAB_EASE.out', () => {
    const sheet = readFileSync(join(process.cwd(), 'components/lab/v2/shared/Sheet.tsx'), 'utf8');
    expect(sheet).not.toMatch(/cubic-bezier|duration:\s*\d|\d+ms/);
    const flip = readFileSync(join(process.cwd(), 'components/lab/v2/shared/motion/useFlipSheet.ts'), 'utf8');
    expect(flip).toContain('duration: LAB_DUR.m, easing: LAB_EASE.out');
    expect(flip).not.toMatch(/cubic-bezier|duration:\s*\d/);
  });
});
