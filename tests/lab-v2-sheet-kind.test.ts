import { expect, test } from 'vitest';
import type { SheetProps } from '@/components/lab/v2/shared/Sheet';
import { SHEET_PRECEDENCE, type SheetKind } from '@/lib/lab/view/shared';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const same: Equal<SheetProps['kind'], SheetKind> = true;

test('the Sheet kind union is exactly 01 SheetKind (one meaning, no second named type)', () => {
  expect(same).toBe(true);
  expect([...SHEET_PRECEDENCE].sort()).toEqual(['ask', 'event', 'idea', 'post', 'script', 'setup', 'test']);
});
