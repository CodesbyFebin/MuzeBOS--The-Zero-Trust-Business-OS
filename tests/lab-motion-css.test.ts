/**
 * The Content Lab v2 motion block in app/globals.css (03 section 03.17): AC-03-1, AC-03-2, AC-03-3,
 * AC-03-11, AC-03-12, AC-03-13, AC-03-16.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LAB_DUR, LAB_EASE } from '@/lib/lab/motion';
import { GLOBALS_CSS } from './helpers/theme-css';

const START = '/* ── Content Lab v2 · motion ── */';
const END = '/* ── end Content Lab v2 · motion ── */';
const BLOCK = GLOBALS_CSS.slice(GLOBALS_CSS.indexOf(START), GLOBALS_CSS.indexOf(END));
const CODE = BLOCK.replace(/\/\*[\s\S]*?\*\//g, '');
function splitTop(v: string): string[] {
  const out: string[] = [];
  let d = 0, cur = '';
  for (const c of v) { if (c === '(') d++; if (c === ')') d--; if (c === ',' && d === 0) { out.push(cur); cur = ''; } else cur += c; }
  return [...out, cur];
}
const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Top-level (and one level nested in @media) rule heads with their bodies. */
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

describe('03 motion block', () => {
  it('exists once', () => {
    expect(GLOBALS_CSS.split(START).length).toBe(2);
    expect(BLOCK.length).toBeGreaterThan(200);
  });

  it('AC-03-1 CSS tokens equal LAB_EASE and LAB_DUR', () => {
    const decl = (n: string) => new RegExp(`${n}:\\s*([^;]+);`).exec(CODE)?.[1].trim();
    for (const [k, v] of Object.entries(LAB_EASE)) {
      if (k === 'linear') continue;
      expect(decl(`--lab-ease-${k === 'inOut' ? 'inout' : kebab(k)}`), k).toBe(v);
    }
    for (const [k, v] of Object.entries(LAB_DUR)) {
      const css = decl(`--lab-dur-${kebab(k)}`);
      expect(css, k).toBeDefined();
      const ms = css!.endsWith('ms') ? Number(css!.slice(0, -2)) : Number(css!.slice(0, -1)) * 1000;
      expect(ms, k).toBe(v);
    }
  });

  it('AC-03-2 keyframes animate only opacity and transform; transitions name only allowed properties', () => {
    for (const k of RULES.filter((r) => r.head.startsWith('@keyframes'))) {
      for (const m of k.body.matchAll(/([\w-]+)\s*:/g)) expect(['opacity', 'transform'], `${k.head} ${m[1]}`).toContain(m[1]);
    }
    for (const r of RULES) {
      for (const m of r.body.matchAll(/transition:\s*([^;]+);/g)) {
        for (const part of splitTop(m[1])) {
          const prop = part.trim().split(/\s+/)[0];
          expect(['opacity', 'transform', 'background-color', 'color', 'stroke-dashoffset'], `${r.head}: ${prop}`).toContain(prop);
        }
      }
    }
  });

  it('AC-03-3 reduced-motion block, .lab selectors only, no retired names', () => {
    const reduced = RULES.filter((r) => r.media?.includes('prefers-reduced-motion: reduce'));
    const names = reduced.map((r) => r.head).join(' ');
    for (const s of ['.lab2-narr::before', '.lab2-ring-spin', '.lab2-narr-pulse']) expect(names).toContain(s);
    expect(reduced.some((r) => r.head.includes('.lab2-narr::before') && /animation:\s*none/.test(r.body))).toBe(true);
    for (const r of RULES.filter((x) => !x.head.startsWith('@keyframes'))) {
      for (const sel of r.head.split(',')) expect(sel.trim().startsWith('.lab'), sel).toBe(true);
    }
    for (const bad of ['.lab-v2', '.lab-aurora', '.lab-narrative', '.lab-tile', '.lab-mesh-blob', 'data-lab-origin']) expect(CODE).not.toContain(bad);
  });

  it('AC-03-12 no transition: all', () => {
    expect(CODE).not.toMatch(/transition(-property)?:\s*all/);
  });

  it('AC-03-13 every :hover rule is inside (hover: hover) and (pointer: fine)', () => {
    for (const r of RULES.filter((x) => x.head.includes(':hover'))) expect(r.media, r.head).toContain('(hover: hover) and (pointer: fine)');
  });

  it('AC-03-16 drift stops keep the mesh covering the card', () => {
    const drift = /@keyframes lab2-drift\s*\{([\s\S]*?)\n\}/.exec(CODE)![1];
    for (const m of drift.matchAll(/translate3d\(([-\d.]+)%?,\s*([-\d.]+)%?,\s*0\)\s*scale\(([\d.]+)\)/g)) {
      expect(Math.abs(Number(m[1])) / 100 * 1.4).toBeLessThanOrEqual(0.2);
      expect(Math.abs(Number(m[2])) / 100 * 1.4).toBeLessThanOrEqual(0.2);
      expect(Number(m[3])).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('AC-03-11 no animation library', () => {
  it('package.json and lab sources import none', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const lib of ['framer-motion', 'motion', 'gsap', 'react-spring', '@react-spring/web', 'animejs']) expect(deps[lib], lib).toBeUndefined();
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
    for (const f of [...walk(join(process.cwd(), 'components/lab/v2')), join(process.cwd(), 'lib/lab/motion.ts')]) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/from ['"](framer-motion|motion|gsap|react-spring|@react-spring\/web|animejs)['"]/);
    }
  });
});
