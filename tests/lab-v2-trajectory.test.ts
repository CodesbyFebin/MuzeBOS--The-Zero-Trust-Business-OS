import { describe, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { dailyCumulative, peakDayShare, trajectoryClass } from '@/lib/lab/measure/trajectory';
import { detectStepJump } from '@/lib/lab/measure/exogenous';

describe('04 3.9 trajectory classes (AC-04-11)', () => {
  test('the worked example: day 1 is 40,000 of 70,000, share 0.571, critical', () => {
    const cum = [40_000, 52_000, 58_000, 61_000, 63_000, 64_500, 65_500, 66_500, 67_300, 68_000, 68_600, 69_200, 69_600, 70_000];
    const snaps = cum.map((v, i) => ({ ageH: (i + 1) * 24, basis: v }));
    const daily = dailyCumulative(snaps)!;
    expect(daily).toEqual(cum);
    expect(peakDayShare(daily)).toBeCloseTo(0.5714, 4);
    expect(trajectoryClass(peakDayShare(daily))).toBe('critical');
    expect(trajectoryClass(0.85)).toBe('burst');
    expect(trajectoryClass(0.1)).toBe('slow');
  });
  test('a 96h gap between reads gives null; a 10-day-old post gives null', () => {
    expect(dailyCumulative([{ ageH: 24, basis: 1 }, { ageH: 72, basis: 2 }, { ageH: 168, basis: 3 }, { ageH: 336, basis: 4 }])).toBeNull();
    expect(dailyCumulative(Array.from({ length: 10 }, (_, i) => ({ ageH: (i + 1) * 24, basis: i + 1 })))).toBeNull();
  });
  test('trajectoryClass is read by no view builder', () => {
    let out = '';
    try {
      out = execFileSync('grep', ['-rn', 'trajectoryClass', 'lib/lab/view'], { encoding: 'utf8' });
    } catch {
      out = '';
    }
    expect(out).toBe('');
  });
});

describe('04 3.10 step-jump detector (AC-04-12, pure part)', () => {
  test('48h 10,000, 72h 11,000, 96h 16,000 is flagged at 96h', () => {
    expect(detectStepJump([{ ageH: 48, basis: 10_000 }, { ageH: 72, basis: 11_000 }, { ageH: 96, basis: 16_000 }])).toEqual({ flagged: true, atH: 96, jump: 5_000 });
  });
  test('a jump before 48h is not flagged; a small or slow rise is not flagged', () => {
    expect(detectStepJump([{ ageH: 6, basis: 1_000 }, { ageH: 24, basis: 1_100 }, { ageH: 30, basis: 9_000 }]).flagged).toBe(false);
    expect(detectStepJump([{ ageH: 48, basis: 10_000 }, { ageH: 72, basis: 11_000 }, { ageH: 96, basis: 11_400 }]).flagged).toBe(false);
    expect(detectStepJump([{ ageH: 48, basis: 100 }, { ageH: 72, basis: 110 }, { ageH: 96, basis: 400 }]).flagged).toBe(false);
  });
});
