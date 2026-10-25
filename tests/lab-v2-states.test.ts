/**
 * AC-01-5 (state matrix payloads) and AC-01-7 (section error isolation), plus AC-01-2's builder half:
 * every page builds in the real-empty, not-configured, thin, sample and Filming worlds.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { LAB_PAGES } from '@/lib/lab/view/shared';
import { LAB_COPY } from '@/lib/lab/view/copy';
import { SECTION_FAULTS } from '@/lib/lab/view/section';
import { seedLabFixtures } from '@/lib/lab/fixtures';
import { FLAGS, NOW, blankStore, fixtureStore, page } from './helpers/lab-v2-v';

const thinStore = () => {
  const s = blankStore();
  seedLabFixtures(s, NOW, 'thin');
  return s;
};

describe('AC-01-5 state matrix', () => {
  it('not_configured: frame and empty card only, no section payloads', async () => {
    for (const p of LAB_PAGES) {
      const v = (await page(p.id, blankStore(), FLAGS.notConfigured)) as Record<string, unknown> & { frame: { mode: { state: string }; emptyCard: unknown; quickActions: { id: string; disabledReason: string | null }[] } };
      expect(v.frame.mode.state, p.id).toBe('not_configured');
      expect(v.frame.emptyCard, p.id).toMatchObject({ title: 'Content Lab needs an Apify key', setupHref: '?setup=keys', sampleHref: '?sample=1' });
      const disabled = v.frame.quickActions.filter((a) => a.id !== 'add_source').map((a) => a.disabledReason);
      expect(disabled.every((d) => d === LAB_COPY.needsKey), p.id).toBe(true);
      // no section carries rows
      const json = JSON.stringify({ ...v, frame: null });
      expect(json, p.id).not.toMatch(/"(tiles|rows|items|lanes)":\[\{/);
    }
  });
  it('empty: Today carries the checklist and no post tiles; the banner asks for accounts', async () => {
    const v = await page('today', blankStore(), FLAGS.real);
    expect(v.frame.mode.state).toBe('empty');
    expect(v.checklist).not.toBeNull();
    expect(v.yourPosts.tiles).toHaveLength(0);
    expect(v.frame.banner?.text).toBe('Add your accounts to start. The first run reads your last 30 posts per account.');
  });
  it('thin: warn banner', async () => {
    const v = await page('today', thinStore(), FLAGS.real);
    expect(v.frame.mode.state).toBe('thin');
    expect(v.frame.banner).toMatchObject({ tone: 'warn' });
  });
  it('sample: read-only on every page', async () => {
    for (const p of LAB_PAGES) {
      const v = await page(p.id, fixtureStore(), FLAGS.sample);
      expect(v.frame.readOnly, p.id).toBe(LAB_COPY.readOnly);
      expect(v.frame.mode.sample).toBe(true);
    }
  });
  it('Filming: dry chip, not read-only', async () => {
    const v = await page('today', fixtureStore(), FLAGS.filming);
    expect(v.frame.mode.filming).toBe(true);
    expect(v.frame.readOnly).toBeNull();
    expect(v.frame.run.dryLine).toBe('Filming · no charges');
  });
});

describe('AC-01-7 one section throwing leaves the page standing', () => {
  afterEach(() => SECTION_FAULTS.clear());
  it('Today with an injected fault in yourPosts', async () => {
    SECTION_FAULTS.add('today.yourPosts');
    const v = await page('today', fixtureStore(), FLAGS.sample);
    expect(v.yourPosts.state.kind).toBe('error');
    expect(v.yourPosts.state.message).toMatch(/^This section did not load: /);
    expect(v.launchRadar.state.kind).not.toBe('error');
    expect(v.nextToMake.rows.length).toBeGreaterThan(0);
  });
});
