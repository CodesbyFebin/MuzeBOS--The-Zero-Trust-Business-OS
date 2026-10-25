/** AC-01-12 heroes, AC-01-13 Brief, AC-01-14 Window card (05's card unchanged, progress only). */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { briefCandidates, briefCard, heroesFor, localDayIndex, type HeroRow } from '@/lib/lab/view/today';
import { windowCardView } from '@/lib/lab/radar/view';
import { LabProfileSchema } from '@/lib/schemas';
import { FLAGS, NOW, blankStore, fixtureStore, page } from './helpers/lab-v2-v';

const DAY = 86_400_000;
const at = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * DAY).toISOString();
const owned = (daysAgo: number, ratio: number): HeroRow => ({ postedAt: at(daysAgo), ratio, platform: 'instagram', owned: true, isBreakout: false, judged: true });

describe('AC-01-12 heroes', () => {
  const C = [0.6, 0.9, 1.1, 1.4, 1.4, 1.8, 2.3].map((r, i) => owned(2 + i, r));
  const P = [1.0, 1.1, 1.19, 1.3, 1.4].map((r, i) => owned(35 + i, r));
  it('worked example: 1.4x, +18%, n 7, tone up', () => {
    const h = heroesFor([...C, ...P], 'all', NOW, true, false).yourNormal;
    expect(h.value.text).toBe('1.4x');
    expect(h.delta).toMatchObject({ value: 18, text: '+18%', tone: 'up' });
    expect(h.nText).toBe('n 7');
    expect(h.dots.curr).toHaveLength(30);
    expect(h.href).toBe('/lab/breakouts?mine=1');
  });
  it('n 4 prints not enough yet (text null, enough false) and no delta', () => {
    const h = heroesFor([...C.slice(0, 4), ...P], 'all', NOW, true, false).yourNormal;
    expect(h.value).toMatchObject({ enough: false, text: null, n: 4 });
    expect(h.delta.text).toBeNull();
  });
  it('measure not built: (not age-matched yet) suffix and no delta', () => {
    const h = heroesFor([...C, ...P], 'all', NOW, false, false);
    expect(h.yourNormal.label).toBe('Your posts vs your normal (not age-matched yet)');
    expect(h.breakouts.label).toMatch(/\(not age-matched yet\)$/);
    expect(h.yourNormal.delta.text).toBeNull();
  });
  it('breakouts hero: signed count delta, of n tracked posts', () => {
    const t = (d: number, b: boolean): HeroRow => ({ postedAt: at(d), ratio: 1, platform: 'tiktok', owned: false, isBreakout: b, judged: true });
    const rows = [t(1, true), t(2, true), t(3, true), t(4, false), t(5, false), t(8, true)];
    const h = heroesFor(rows, 'all', NOW, true, false).breakouts;
    expect(h.value.text).toBe('3');
    expect(h.delta.text).toBe('+2');
    expect(h.sub).toBe('of 5 tracked posts');
    expect(h.dots.prevLabel).toBe('last wk');
  });
});

describe('AC-01-13 Brief', () => {
  function storeWith(lifts: { value: string; lo: number }[]) {
    const s = blankStore();
    s.profiles.insert(LabProfileSchema.parse({
      id: 'pf1', formatFamily: 'tutorial_walkthrough', label: 'AI tool tutorials', version: 1, windowDays: 90, postsN: 200, breakoutsN: 40,
      features: lifts.map((l) => ({ feature: 'hook_form', value: l.value, total: 40, n: 12, lift: l.lo + 1, lo: l.lo, hi: l.lo + 2, shown: true })),
      strand: [], stats: { wpm: null, durationS: null }, createdAt: NOW.toISOString(),
    }));
    return s;
  }
  const seven = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((v, i) => ({ value: `v_${v}`, lo: 1.1 + i * 0.1 }));
  it('top 5 by lower bound; the pick differs on two dates and is stable within a day', () => {
    const s = storeWith([...seven, { value: 'v_crosses', lo: 0.95 }]);
    const cands = briefCandidates(s);
    expect(cands).toHaveLength(5);
    expect(cands.every((c) => c.lo > 1)).toBe(true);
    const d1 = new Date(2026, 9, 11, 9);
    const d1b = new Date(2026, 9, 11, 22);
    const d2 = new Date(2026, 9, 12, 9);
    expect(localDayIndex(d1)).toBe(localDayIndex(d1b));
    const a = briefCard(s, d1, true, false);
    expect(briefCard(s, d1b, true, false).sentence).toBe(a.sentence);
    expect(briefCard(s, d2, true, false).sentence).not.toBe(a.sentence);
    expect(a.state).toBe('finding');
    expect(a.sentence).toMatch(/^.+ hooks pull \d+\.\dx in .+\.$/);
    expect(a.meta).toMatch(/^n 12 · 90% \d+\.\dx to \d+\.\dx · correlation$/);
    expect(a.href).toMatch(/^\/lab\/playbook\?format=tutorial_walkthrough#lift-hook_form-v_/);
  });
  it('a row with lo 0.95 never appears; none at all reads not enough', () => {
    const s = storeWith([{ value: 'v_crosses', lo: 0.95 }]);
    expect(briefCandidates(s)).toHaveLength(0);
    expect(briefCard(s, NOW, true, false)).toMatchObject({ state: 'not_enough', sentence: 'Not enough data yet. The Brief needs 8 breakouts in one format.', href: '/lab/playbook' });
  });
});

describe('AC-01-14 Window card', () => {
  it('fixture: card is exactly windowCardView, meta and makeAngle and href are 01 additions', async () => {
    const s = fixtureStore();
    const v = await page('today', s, FLAGS.sample);
    expect(v.window.layer).toBe('live');
    expect(v.window.card).toEqual(windowCardView(s, NOW, { sample: true, dry: false }));
    const card = v.window.card!;
    if (card.kind === 'open' || card.kind === 'closing') {
      expect(card.progress).toBeGreaterThanOrEqual(0);
      expect(card.progress).toBeLessThanOrEqual(1);
      expect(v.window.makeAngle).not.toBeNull();
      expect(v.window.href).toBe(`?event=${card.eventId}&sample=1`);
      if (v.window.meta) expect(v.window.meta).toMatch(/^First wave so far: \d+\.\dx your normal \(n \d+\)$/);
    }
  });
  it('never run: 05 copy unchanged, no angle', async () => {
    const s = blankStore();
    const v = await page('today', s, FLAGS.real);
    expect(v.window.card).toEqual(windowCardView(s, NOW, { sample: false, dry: false }));
    expect(v.window.card?.kind).toBe('never_run');
    expect(v.window.makeAngle).toBeNull();
    expect(v.window.meta).toBeNull();
  });
  it('no 01 view type has a field named warmth, windowT or windowProgress', () => {
    const dir = path.join(process.cwd(), 'lib/lab/view');
    const files = [...readdirSync(dir).map((f) => path.join(dir, f)), ...readdirSync(path.join(dir, 'sheets')).map((f) => path.join(dir, 'sheets', f))].filter((f) => f.endsWith('.ts') && !f.endsWith('frames.ts'));
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/\b(warmth|windowT|windowProgress)\s*[:?]/);
  });
});
