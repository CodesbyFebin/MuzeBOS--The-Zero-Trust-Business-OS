/**
 * The Content Lab motion polish pass: components/lab/v2/shared/lab-motion.css and the pure helpers it
 * mirrors in lib/lab/motion.ts (LAB_ENTER, LAB_POP, LAB_COUNT, countUpText).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LAB_COUNT, LAB_ENTER, LAB_POP, countUpText, enterEnd, splitNumber } from '@/lib/lab/motion';

const CSS = readFileSync(join(process.cwd(), 'components/lab/v2/shared/lab-motion.css'), 'utf8');
const CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

function rules(src: string): { head: string; body: string; media: string | null }[] {
  const out: { head: string; body: string; media: string | null }[] = [];
  const walk = (s: string, media: string | null) => {
    let depth = 0, start = 0, open = -1;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '{') { if (depth === 0) open = i; depth++; }
      else if (s[i] === '}') {
        if (--depth === 0) {
          const head = s.slice(start, open).trim();
          const body = s.slice(open + 1, i);
          if (head.startsWith('@media')) walk(body, head);
          else out.push({ head, body, media });
          start = i + 1;
        }
      }
    }
  };
  walk(src, null);
  return out;
}
const RULES = rules(CODE);
function splitTop(v: string): string[] {
  const out: string[] = [];
  let d = 0, cur = '';
  for (const c of v) { if (c === '(') d++; if (c === ')') d--; if (c === ',' && d === 0) { out.push(cur); cur = ''; } else cur += c; }
  return [...out, cur];
}
const decl = (n: string) => new RegExp(`${n}:\\s*([^;]+);`).exec(CODE)?.[1].trim();

describe('lab-motion.css', () => {
  it('is loaded by the /lab layout', () => {
    expect(readFileSync(join(process.cwd(), 'app/lab/layout.tsx'), 'utf8')).toContain("lab-motion.css'");
  });

  it('mirrors LAB_ENTER, LAB_POP and LAB_COUNT', () => {
    expect(decl('--lab-enter-dur')).toBe(`${LAB_ENTER.duration}ms`);
    expect(decl('--lab-enter-step')).toBe(`${LAB_ENTER.step}ms`);
    expect(decl('--lab-enter-rise')).toBe(`${LAB_ENTER.rise}px`);
    expect(decl('--lab-pop-in')).toBe(`${LAB_POP.in}ms`);
    expect(decl('--lab-pop-out')).toBe(`${LAB_POP.out}ms`);
    expect(decl('--lab-count-hold')).toBe(`${LAB_COUNT.hideMax}ms`);
    expect(CODE).toContain(`, ${LAB_ENTER.maxIndex}) * var(--lab-enter-step)`);
  });

  it('keeps the whole entrance short', () => {
    expect(enterEnd()).toBeLessThanOrEqual(700);
  });

  it('keyframes animate only opacity and transform', () => {
    const frames = RULES.filter((r) => r.head.startsWith('@keyframes'));
    expect(frames.length).toBeGreaterThan(4);
    for (const k of frames) {
      for (const m of k.body.matchAll(/([\w-]+)\s*:/g)) expect(['opacity', 'transform'], `${k.head} ${m[1]}`).toContain(m[1]);
    }
  });

  it('scopes every selector to the Lab', () => {
    for (const r of RULES.filter((x) => !x.head.startsWith('@keyframes'))) {
      for (const sel of splitTop(r.head)) expect(/^(\.lab\b|:root)/.test(sel.trim()), sel).toBe(true);
    }
  });

  it('puts every :hover inside (hover: hover) and (pointer: fine)', () => {
    for (const r of RULES.filter((x) => x.head.includes(':hover') && !x.media?.includes('reduced-motion'))) {
      expect(r.media, r.head).toContain('(hover: hover) and (pointer: fine)');
    }
  });

  it('never loops, never transitions all, never paints a raw colour', () => {
    expect(CODE).not.toMatch(/infinite/);
    expect(CODE).not.toMatch(/transition(-property)?:\s*all/);
    expect(CODE).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
  });

  it('ends with a reduced-motion block that stops every animation', () => {
    const last = RULES.at(-1)!;
    expect(last.media).toContain('prefers-reduced-motion: reduce');
    const all = RULES.filter((r) => r.media?.includes('prefers-reduced-motion: reduce'));
    expect(all.some((r) => /animation:\s*none\s*!important/.test(r.body))).toBe(true);
  });

  it('page blocks fill backwards only, so nothing keeps a stacking context after the entrance', () => {
    const enter = RULES.filter((r) => /animation:\s*lab2-enter/.test(r.body));
    expect(enter.length).toBeGreaterThan(0);
    for (const r of enter) expect(r.body, r.head).toMatch(/backwards;/);
  });
});

describe('countUpText', () => {
  it('splits the number out of a formatted value', () => {
    expect(splitNumber('$1,204.50')).toEqual({ pre: '$', num: 1204.5, decimals: 2, grouped: true, post: '' });
    expect(splitNumber('+61%')).toEqual({ pre: '+', num: 61, decimals: 0, grouped: false, post: '%' });
    expect(splitNumber('Not enough')).toBeNull();
  });

  it('starts at zero with the same shape and ends on the printed text', () => {
    expect(countUpText('1.2', 0)).toBe('0.0');
    expect(countUpText('$1,204.50', 0)).toBe('$0.00');
    expect(countUpText('17', 1)).toBe('17');
    expect(countUpText('$1,204.50', 1)).toBe('$1,204.50');
    expect(countUpText('Not enough', 0.4)).toBe('Not enough');
  });

  it('moves monotonically and keeps grouping on the way', () => {
    let last = -1;
    for (let p = 0; p < 1; p += 0.05) {
      const v = Number(countUpText('12,400', p).replace(/,/g, ''));
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
    expect(countUpText('12,400', 0.9)).toMatch(/^\d{1,2},\d{3}$/);
  });
});
