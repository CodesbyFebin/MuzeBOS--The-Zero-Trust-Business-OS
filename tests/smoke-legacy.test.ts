import { beforeAll, describe, expect, test, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import type { ReactElement } from 'react';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { renderWithRouter } from './helpers/render-client';

/**
 * Bennett Legacy smoke (FounderOS ui merge SPEC §2.5, O1): with the appearance
 * cookie on legacy · mono, a sample of Both pages render their Classic tree
 * (under the Legacy skin in the browser) without throwing, the kit specimen
 * renders its Legacy tree, and Settings shows the Legacy picker.
 */
vi.mock('next/headers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/headers')>()),
  cookies: () => {
    const all = [{ name: 'glados-appearance', value: 'legacy.mono.dark' }];
    return { get: (n: string) => all.find((c) => c.name === n), getAll: () => all, has: (n: string) => all.some((c) => c.name === n) };
  },
}));

beforeAll(() => {
  process.env.GLADOS_DB = path.join(mkdtempSync(path.join(tmpdir(), 'glados-smoke-legacy-')), 'test.db');
  process.env.FUNNEL_PROVIDER = 'seed';
  process.env.GBRAIN_BIN = path.join(tmpdir(), 'glados-no-gbrain-cli');
});

const PAGES = [
  { route: '/', load: () => import('@/app/page') },
  { route: '/funnel', load: () => import('@/app/funnel/page') },
  { route: '/brand-deals', load: () => import('@/app/brand-deals/page') },
  { route: '/finances', load: () => import('@/app/finances/page') },
  { route: '/tasks', load: () => import('@/app/tasks/page') },
  { route: '/roadmap', load: () => import('@/app/roadmap/page') },
  { route: '/skills', load: () => import('@/app/skills/page') },
  { route: '/integrations', load: () => import('@/app/integrations/page') },
] as const;

describe('Legacy smoke: Both pages render under legacy · mono', () => {
  test.each(PAGES)('$route renders', async ({ load }) => {
    const Page = (await load()).default as (p?: unknown) => unknown;
    await expect(Promise.resolve(Page({ searchParams: {} }))).resolves.toBeTruthy();
  }, 30_000);

  test('the server reads the Legacy cookie', async () => {
    const { getAppearance } = await import('@/lib/appearance-server');
    expect(getAppearance()).toMatchObject({ ui: 'legacy', theme: 'monolith', mode: 'dark' });
  });

  test('/dev/l-kit renders the Legacy specimen', async () => {
    const { default: Page } = await import('@/app/dev/l-kit/page');
    const html = renderWithRouter(Page() as ReactElement);
    expect(html).toContain('data-l="KitSpecimen"');
  });

  test('/setup shows the Legacy picker: Style, Skin, Mode, no GladOS kit control', async () => {
    const { default: Page } = await import('@/app/setup/page');
    const html = renderWithRouter((await Page()) as ReactElement);
    const i = html.indexOf('data-appearance="legacy"');
    expect(i).toBeGreaterThan(-1);
    const picker = html.slice(i, html.indexOf('Saved on this browser.', i));
    expect(picker).toMatch(/aria-label="Style"/);
    expect(picker).toContain('Bennett Legacy');
    expect(picker).toContain('Monolith');
    expect(picker).toContain('Daylight');
    expect(picker).toMatch(/aria-label="Mode"/);
    expect(picker).not.toMatch(/\bg-seg|data-g=/);
  }, 30_000);
});
