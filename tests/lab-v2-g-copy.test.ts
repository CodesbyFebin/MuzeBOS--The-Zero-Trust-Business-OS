/**
 * Lane U1: every LAB_COPY / LAB_UI path the Lab v2 trees read resolves at runtime. LAB_COPY's groups are
 * typed Record<string, string>, so a renamed key typechecks and then renders `undefined` (or throws in
 * fill). This walks the source instead.
 */
import { globSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { LAB_COPY } from '@/lib/lab/view/copy';
import { LAB_UI } from '@/lib/lab/view/ui-copy';

const STRING_METHODS = new Set(['replace', 'replaceAll', 'split', 'toLowerCase', 'toUpperCase', 'slice', 'trim', 'length', 'includes', 'startsWith']);

test('every LAB_COPY / LAB_UI path used by the g tree resolves to a value', () => {
  const missing: string[] = [];
  const files = globSync('components/lab/v2/**/*.{ts,tsx}');
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\b(LAB_COPY|LAB_UI)((?:\.[A-Za-z_][A-Za-z0-9_]*)+)/g)) {
      const root = m[1] === 'LAB_COPY' ? (LAB_COPY as unknown) : (LAB_UI as unknown);
      let v = root as Record<string, unknown> | undefined;
      const keys = m[2].slice(1).split('.');
      if (STRING_METHODS.has(keys[keys.length - 1])) keys.pop();
      for (const k of keys) v = v && typeof v === 'object' ? (v as Record<string, unknown>)[k] as Record<string, unknown> : undefined;
      if (v === undefined) missing.push(`${f}: ${m[1]}${m[2]}`);
    }
  }
  expect([...new Set(missing)]).toEqual([]);
});
