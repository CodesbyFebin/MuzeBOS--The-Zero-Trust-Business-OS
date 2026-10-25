import { describe, expect, test } from 'vitest';
import { areaPath, fieldLayout, logScale, logTicks, nearestPoint, pctTick, quadrantLayout, ratioTick, safeDomain, stackSeries, strandLayout } from '@/lib/lab/geometry';

const beats = [
  { type: 'hook', startPct: 0, endPct: 7.7 },
  { type: 'reveal', startPct: 7.7, endPct: 19.8 },
  { type: 'demo', startPct: 19.8, endPct: 71.8 },
  { type: 'payoff', startPct: 71.8, endPct: 89.8 },
  { type: 'cta', startPct: 89.8, endPct: 100 },
];

describe('strandLayout', () => {
  test('keeps proportions when every beat is wide enough', () => {
    const l = strandLayout(beats, { hook: { startPct: 0, endPct: 7.7 } });
    expect(l.segments.map((s) => s.widthPct)).toEqual([7.7, 12.1, 52, 18, 10.2]);
    expect(l.segments[2].leftPct).toBe(19.8);
    expect(l.hook).toEqual({ leftPct: 0, widthPct: 7.7 });
  });

  test('widens a thin beat to the minimum, pays for it from the wide ones, still sums to 100', () => {
    const b = [{ type: 'hook', startPct: 0, endPct: 0.4 }, { type: 'demo', startPct: 0.4, endPct: 50 }, { type: 'rehook', startPct: 50, endPct: 50.5 }, { type: 'cta', startPct: 50.5, endPct: 100 }];
    const l = strandLayout(b, { hook: { startPct: 0, endPct: 0.4 }, rehookTicks: [50] }, 2);
    expect(l.segments[0].widthPct).toBe(2);
    expect(l.segments[2].widthPct).toBe(2);
    const sum = l.segments.reduce((a, s) => a + s.widthPct, 0);
    expect(sum).toBeCloseTo(100, 2);
    const last = l.segments[l.segments.length - 1];
    expect(last.leftPct + last.widthPct).toBeCloseTo(100, 2);
    // the hook underline and the rehook tick follow their widened segments
    expect(l.hook!.widthPct).toBeCloseTo(2, 2);
    expect(l.ticks[0]).toBeCloseTo(l.segments[2].leftPct, 2);
  });

  test('empty or zero-length input draws nothing', () => {
    expect(strandLayout([])).toEqual({ segments: [], hook: null, ticks: [] });
    expect(strandLayout([{ type: 'hook', startPct: 5, endPct: 5 }]).segments).toEqual([]);
  });
});

describe('log axes', () => {
  test('safeDomain repairs non-positive, reversed and degenerate domains', () => {
    expect(safeDomain([0, 10])).toEqual([0.001, 10]);
    expect(safeDomain([10, 1])).toEqual([1, 10]);
    expect(safeDomain([2, 2])).toEqual([1, 4]);
  });

  test('logScale maps decades evenly, clamps outside the domain, runs downwards for y', () => {
    const x = logScale([0.1, 10], [0, 200]);
    expect(x(0.1)).toBe(0);
    expect(x(1)).toBeCloseTo(100, 6);
    expect(x(10)).toBe(200);
    expect(x(1000)).toBe(200);
    expect(x(-5)).toBe(0);
    const y = logScale([0.01, 1], [300, 0]);
    expect(y(0.1)).toBeCloseTo(150, 6);
  });

  test('logTicks gives 1-2-5 inside the domain, decades when crowded, ends when sparse', () => {
    expect(logTicks([0.04, 21])).toEqual([0.1, 1, 10]);
    expect(logTicks([0.01, 0.44])).toEqual([0.01, 0.02, 0.05, 0.1, 0.2]);
    expect(logTicks([3, 4])).toEqual([3, 4]);
  });

  test('tick labels', () => {
    expect(ratioTick(0.1)).toBe('0.1x');
    expect(ratioTick(10)).toBe('10x');
    expect(pctTick(0.05)).toBe('5%');
    expect(pctTick(0.005)).toBe('0.5%');
  });
});

describe('fieldLayout and quadrants', () => {
  const plot = { x: 40, y: 10, w: 400, h: 200 };
  const domain = { x: [0.1, 10] as [number, number], y: [0.01, 1] as [number, number] };

  test('places points on both log axes with radius from r, biggest first', () => {
    const out = fieldLayout([{ x: 1, y: 0.1, r: 0 }, { x: 10, y: 1, r: 1 }], domain, plot, { min: 2, max: 8 });
    expect(out[0]).toMatchObject({ px: 440, py: 10, pr: 8 });
    expect(out[1]).toMatchObject({ px: 240, py: 110, pr: 2 });
  });

  test('quadrants split at the medians: deep left is loyal, deep right ideal, shallow right clickbait', () => {
    const q = quadrantLayout(domain, { breakout: 1, depth: 0.1 }, plot);
    expect(q.vx).toBe(240);
    expect(q.hy).toBe(110);
    expect(q.quads.loyal).toMatchObject({ x: 40, y: 10, w: 200, h: 100, align: 'start' });
    expect(q.quads.ideal).toMatchObject({ x: 240, y: 10, w: 200, lx: 430, align: 'end' });
    expect(q.quads.clickbait).toMatchObject({ x: 240, y: 110, ly: 200 });
    expect(q.quads.dud).toMatchObject({ x: 40, y: 110 });
  });

  test('missing medians draw no line and split at the centre', () => {
    const q = quadrantLayout(domain, { breakout: null, depth: null }, plot);
    expect(q.vx).toBeNull();
    expect(q.hy).toBeNull();
    expect(q.quads.ideal.x).toBe(240);
  });

  test('nearestPoint finds the closest within range only', () => {
    const pts = [{ px: 10, py: 10, id: 'a' }, { px: 30, py: 10, id: 'b' }];
    expect(nearestPoint(pts, 27, 11)?.id).toBe('b');
    expect(nearestPoint(pts, 100, 100)).toBeNull();
  });
});

describe('tide', () => {
  test('stackSeries stacks bottom to top and ignores negatives', () => {
    const { bands, max } = stackSeries([[1, 2], [3, -1]]);
    expect(bands[0]).toEqual({ lower: [0, 0], upper: [1, 2] });
    expect(bands[1]).toEqual({ lower: [1, 2], upper: [4, 2] });
    expect(max).toBe(4);
  });

  test('areaPath closes a band across the box', () => {
    const { bands, max } = stackSeries([[0, 4]]);
    expect(areaPath(bands[0], max, { x: 0, y: 0, w: 100, h: 50 })).toBe('M0,50 L100,0 L100,50 L0,50 Z');
    expect(areaPath({ lower: [], upper: [] }, 1, { x: 0, y: 0, w: 1, h: 1 })).toBe('');
  });
});
