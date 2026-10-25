/** AC-01-1: v1 `?tab=` links redirect (308) to the v2 route with every other param kept (01 2.4). */
import { describe, expect, it } from 'vitest';
import { legacyRedirect } from '@/app/lab/_render';
import { labParams } from '@/lib/lab/context';

describe('AC-01-1 legacy ?tab= redirects', () => {
  const cases: [string, string][] = [
    ['today', '/lab'],
    ['breakouts', '/lab/breakouts'],
    ['profile', '/lab/playbook'],
    ['trends', '/lab/radar'],
    ['ideas', '/lab/studio'],
    ['scripts', '/lab/studio'],
  ];
  it.each(cases)('?tab=%s -> %s, keeping sample, post and script', (tab, path) => {
    const to = legacyRedirect({ tab, sample: '1', post: 'fx-p-0001', script: 'fx-script-1' })!;
    const u = new URL(to, 'http://x');
    expect(u.pathname).toBe(path);
    expect(u.searchParams.get('sample')).toBe('1');
    expect(u.searchParams.get('post')).toBe('fx-p-0001');
    expect(u.searchParams.get('script')).toBe('fx-script-1');
    expect(u.searchParams.has('tab')).toBe(false);
  });
  it('profile&family=x -> /lab/playbook?format=x', () => {
    const u = new URL(legacyRedirect({ tab: 'profile', family: 'tutorial_walkthrough' })!, 'http://x');
    expect(u.pathname).toBe('/lab/playbook');
    expect(u.searchParams.get('format')).toBe('tutorial_walkthrough');
  });
  it('sources -> /lab?setup=sources', () => {
    const u = new URL(legacyRedirect({ tab: 'sources', sample: '1' })!, 'http://x');
    expect(u.pathname).toBe('/lab');
    expect(u.searchParams.get('setup')).toBe('sources');
    expect(u.searchParams.get('sample')).toBe('1');
  });
  it('no tab, no redirect', () => expect(legacyRedirect({ post: 'x' })).toBeNull());
  it('the page server redirects with a 308 before building anything', async () => {
    const { default: Page } = await import('@/app/lab/page');
    let thrown: unknown = null;
    try {
      await Page({ searchParams: { tab: 'trends', sample: '1' } });
    } catch (e) {
      thrown = e;
    }
    expect(String((thrown as { digest?: string })?.digest ?? thrown)).toMatch(/NEXT_REDIRECT;replace;\/lab\/radar\?sample=1;308/);
  });
});

describe('01 2.1 params: unknown values fall back, D4 precedence', () => {
  it('first sheet param in precedence order wins', () => {
    const p = labParams((k) => ({ post: 'p1', script: 's1', setup: 'keys' } as Record<string, string>)[k] ?? null);
    expect(p.sheet).toEqual({ kind: 'script', id: 's1' });
  });
  it('unknown filter values become null or the default', () => {
    const p = labParams((k) => ({ period: 'year', offset: '-40', hp: 'myspace', window: '45', quadrant: 'great', class: 'nope' } as Record<string, string>)[k] ?? null);
    expect(p.period).toBe('w');
    expect(p.offset).toBe(-12);
    expect(p.hp).toBe('all');
    expect(p.window).toBe(30);
    expect(p.quadrant).toBeNull();
    expect(p.eventClass).toBeNull();
  });
});
