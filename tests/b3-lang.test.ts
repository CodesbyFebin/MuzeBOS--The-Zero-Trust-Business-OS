/** Batch 3: hi/ml/ta strings and the a11y checks. */
import { expect, it } from 'vitest';
import { coverage, langFromCookie, t } from '@/lib/metabos/b3/i18n';
it('translations fall back to English and parse the cookie', () => {
  expect(t('hi', 'orders')).toBe('ऑर्डर'); expect(t('hi', 'customers')).toBe('Customers');
  expect(langFromCookie('a=1; mb_lang=ta')).toBe('ta'); expect(langFromCookie('mb_lang=xx')).toBe('en');
  for (const l of ['hi', 'ml', 'ta'] as const) expect(coverage(l).translated).toBeGreaterThanOrEqual(28);
});
it('no translation leaks the prompt or transliterates Jev', () => {
  for (const l of ['hi', 'ml', 'ta'] as const) for (const k of ['approve', 'pendingJev'] as const) expect(t(l, k)).toContain('Jev');
  for (const l of ['hi', 'ml', 'ta'] as const) expect(Object.values(coverage(l)).join()).not.toMatch(/translate/i);
});
