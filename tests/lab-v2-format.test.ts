/** AC-01-10: the formatters, each 01 5.5 example; no output carries U+2014, U+2013 or an emoji. */
import { describe, expect, it } from 'vitest';
import { fmtAge, fmtClock, fmtCount, fmtDelta, fmtPct, fmtRange, fmtRatio, fmtUsd, nText, MINUS } from '@/lib/lab/view/format';

const outputs: string[] = [];
const check = (got: string, want: string) => {
  outputs.push(got);
  expect(got).toBe(want);
};

describe('AC-01-10 formatters', () => {
  it('fmtRatio', () => {
    check(fmtRatio(0.8), '0.8x');
    check(fmtRatio(1.4), '1.4x');
    check(fmtRatio(12.6), '12.6x');
    check(fmtRatio(100), '99x+');
    check(fmtRatio(2), '2.0x');
  });
  it('fmtRange', () => check(fmtRange(1.6, 3.1), '1.6x to 3.1x'));
  it('fmtCount', () => {
    check(fmtCount(0), '0');
    check(fmtCount(999), '999');
    check(fmtCount(1200), '1.2k');
    check(fmtCount(12000), '12k');
    check(fmtCount(1_400_000), '1.4M');
  });
  it('fmtAge: hours under 48, days under 21, else weeks', () => {
    check(fmtAge(0.5), '<1h');
    check(fmtAge(9), '9h');
    check(fmtAge(47), '47h');
    check(fmtAge(48), '2d');
    check(fmtAge(13 * 24), '13d');
    check(fmtAge(21 * 24), '3w');
  });
  it('fmtUsd', () => {
    check(fmtUsd(0.42), '$0.42');
    check(fmtUsd(8.2), '$8.20');
    check(fmtUsd(30), '$30.00');
  });
  it('fmtPct', () => check(fmtPct(0.62), '62%'));
  it('fmtDelta uses U+2212 for negatives (SPEC.md 3.8)', () => {
    check(fmtDelta(18), '+18%');
    check(fmtDelta(-3), `${MINUS}3%`);
    check(fmtDelta(0), '0%');
    expect(MINUS).toBe('−');
  });
  it('fmtClock in the given zone', () => check(fmtClock('2026-10-11T14:30:00.000Z', 'UTC'), '14:30'));
  it('nText', () => check(nText(41), 'n 41'));
  it('no dash or emoji in any output', () => {
    for (const s of outputs) {
      expect(s).not.toMatch(/[–—]/);
      expect(s).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
