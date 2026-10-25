/** AC-01-11: the period scrubber (01 6): the worked example, labels and clamping. Local time zone. */
import { describe, expect, it } from 'vitest';
import { periodFor } from '@/lib/lab/view/period';

const NOW = new Date(2026, 9, 11, 15, 0, 0); // Sunday 2026-10-11 15:00 local

describe('AC-01-11 period maths', () => {
  it('week, offset 0: from Monday 2026-10-05 00:00 to now, This week', () => {
    const p = periodFor('w', 0, NOW);
    expect(p.from).toBe(new Date(2026, 9, 5).toISOString());
    expect(p.to).toBe(NOW.toISOString());
    expect(p.label).toBe('This week');
    expect(p.nextHref).toBeNull();
    expect(p.ticks).toHaveLength(13);
    expect(p.ticks.find((t) => t.current)?.offset).toBe(0);
  });
  it('week, offset -2: 2026-09-21 to 2026-09-28, Week of 21 Sep', () => {
    const p = periodFor('w', -2, NOW);
    expect(p.from).toBe(new Date(2026, 8, 21).toISOString());
    expect(p.to).toBe(new Date(2026, 8, 28).toISOString());
    expect(p.label).toBe('Week of 21 Sep');
  });
  it('labels: Last week, This month, Last month, a month name, the year when it differs', () => {
    expect(periodFor('w', -1, NOW).label).toBe('Last week');
    expect(periodFor('m', 0, NOW).label).toBe('This month');
    expect(periodFor('m', -1, NOW).label).toBe('Last month');
    expect(periodFor('m', -2, NOW).label).toBe('August');
    expect(periodFor('m', -10, NOW).label).toBe('December 2025');
  });
  it('offset outside -12..0 clamps', () => {
    expect(periodFor('w', 3, NOW).offset).toBe(0);
    const far = periodFor('w', -40, NOW);
    expect(far.offset).toBe(-12);
    expect(far.prevHref).toBeNull();
    expect(far.nextHref).not.toBeNull();
  });
});
