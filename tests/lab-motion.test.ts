/**
 * lib/lab/motion.ts (03 section 03.17): AC-03-4, AC-03-5, AC-03-6 (formatter-independent part), AC-03-7,
 * AC-03-8, AC-03-9. COUNT_FORMAT lands with lane V's lib/lab/view/format.ts (U1 adds it and its cases).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as motion from '@/lib/lab/motion';
import {
  INTRO_KEYS, TODAY_INTRO, cornerRadiusAtScale, countUpFrame, countUpValue, flipFrom, introEnd, originUsable, shouldPlayIntro, snapTick,
  type LabIntroScope,
} from '@/lib/lab/motion';

describe('03.3 intro', () => {
  it('AC-03-4 the shipped timeline ends at exactly 700ms', () => {
    expect(introEnd(TODAY_INTRO)).toBe(700);
  });

  it('AC-03-5 shouldPlayIntro follows the truth table for both scopes', () => {
    const store = (v: string | null) => ({ getItem: () => v });
    const throwing = { getItem: () => { throw new Error('blocked'); } };
    for (const scope of ['aurora', 'today'] as LabIntroScope[]) {
      const none = new Set<LabIntroScope>();
      expect(shouldPlayIntro(scope, { reducedMotion: true, hidden: false, storage: store(null), memory: none })).toBe(false);
      expect(shouldPlayIntro(scope, { reducedMotion: false, hidden: true, storage: store(null), memory: none })).toBe(false);
      expect(shouldPlayIntro(scope, { reducedMotion: false, hidden: false, storage: store(null), memory: new Set([scope]) })).toBe(false);
      expect(shouldPlayIntro(scope, { reducedMotion: false, hidden: false, storage: store('1'), memory: none })).toBe(false);
      expect(shouldPlayIntro(scope, { reducedMotion: false, hidden: false, storage: store(null), memory: none })).toBe(true);
      expect(shouldPlayIntro(scope, { reducedMotion: false, hidden: false, storage: throwing, memory: none })).toBe(true);
      expect(shouldPlayIntro(scope, { reducedMotion: false, hidden: false, storage: null, memory: none })).toBe(true);
    }
    expect(INTRO_KEYS).toEqual({ aurora: 'lab.intro.aurora', today: 'lab.intro.today' });
  });
});

describe('03.4 count-up', () => {
  const fmt = (v: number) => `${v.toFixed(1)}x`; // stand-in for 01's fmtRatio in this test only
  it('AC-03-6 the last frame is the resting text and the curve never decreases', () => {
    expect(countUpFrame(0, 1.4, 1, fmt)).toBe('1.4x');
    expect(countUpFrame(0, 1.4, 0.25, fmt)).toBe('0.8x');
    let prev = -Infinity;
    for (let i = 0; i <= 100; i++) {
      const v = countUpValue(0, 1.4, i / 100);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(countUpFrame(441, 655, 1, (v) => String(Math.round(v)))).toBe('655');
  });
  it('AC-03-6 motion.ts exports no formatter', () => {
    expect(Object.keys(motion).filter((k) => /^(fmt|format)/i.test(k))).toEqual([]);
  });
});

describe('03.12 FLIP', () => {
  it('AC-03-7 reproduces the worked example', () => {
    const f = flipFrom({ x: 120, y: 640, w: 184, h: 168 }, { x: 864, y: 16, w: 560, h: 868 });
    expect(f.tx).toBe(-744);
    expect(f.ty).toBe(624);
    expect(f.sx).toBeCloseTo(0.3286, 4);
    expect(f.sy).toBeCloseTo(0.1935, 4);
    expect(cornerRadiusAtScale(24, 0.3286, 0.1935)).toBe('73.0px / 124.0px');
    const vp = { w: 1000, h: 1000 };
    expect(originUsable(null, vp)).toBe(false);
    expect(originUsable({ x: 960, y: 0, w: 100, h: 100 }, vp)).toBe(false); // 40% inside
    expect(originUsable({ x: 940, y: 0, w: 100, h: 100 }, vp)).toBe(true); // 60% inside
  });
});

describe('03.6.2 and 03.7', () => {
  it('AC-03-8 no motion file touches --lab-window-t and there is no windowProgress', () => {
    expect(Object.keys(motion)).not.toContain('windowProgress');
    for (const f of ['lib/lab/motion.ts', 'components/lab/v2/shared/motion/useFlipSheet.ts', 'components/lab/v2/shared/motion/useInViewPause.ts', 'components/lab/v2/shared/motion/useReducedMotion.ts']) {
      expect(readFileSync(join(process.cwd(), f), 'utf8'), f).not.toContain('--lab-window-t');
    }
  });
  it('AC-03-9 snapTick', () => {
    expect(snapTick(130, 48, 7)).toBe(3);
    expect(snapTick(-20, 48, 7)).toBe(0);
    expect(snapTick(9999, 48, 7)).toBe(6);
  });
});
