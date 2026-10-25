/**
 * AC-01-15 Radar, AC-01-16 Breakouts, AC-01-17 Playbook, AC-01-18 Studio, AC-01-19 Ledger: page
 * models over the fixture world, each wrapping its domain view unchanged.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { radarView } from '@/lib/lab/radar/view';
import { isDualHigh } from '@/lib/lab/measure/breakout';
import { testMark } from '@/lib/lab/ledger/tests';
import { studioView } from '@/lib/lab/gen/view';
import { ledgerView } from '@/lib/lab/ledger/view';
import { testStatusLabel, calibrationMeta } from '@/lib/lab/view/ledger';
import { BREAKOUTS_PAGE } from '@/lib/lab/view/breakouts';
import { briefCandidates } from '@/lib/lab/view/today';
import { seedLabFixtures } from '@/lib/lab/fixtures';
import { FLAGS, NOW, blankStore, fixtureStore, page } from './helpers/lab-v2-v';

describe('AC-01-15 Radar', () => {
  it('radar equals radarView unchanged; lanes keep 05 order; state labels', async () => {
    const s = fixtureStore();
    const v = await page('radar', s, FLAGS.sample);
    const r = radarView(s, NOW, { sample: true, dry: false });
    expect(v.radar).toEqual(r);
    expect(v.timeline.lanes.map((l) => l.row.id)).toEqual(r.events.slice(0, 30).map((e) => e.id));
    for (const l of v.timeline.lanes) {
      const want = l.row.window ? { open: 'Window open', closing: 'Closing', closed: 'Closed' }[l.row.window.state] : 'Not confirmed';
      expect(l.stateLabel).toBe(want);
      expect(l.href).toBe(`?event=${l.row.id}&sample=1`);
    }
  });
  it('class and state filters, and the empty-filter copy with Clear filters', async () => {
    const s = fixtureStore();
    const closing = await page('radar', s, FLAGS.sample, { state: 'closing' });
    expect(closing.timeline.lanes.length).toBeGreaterThan(0);
    expect(closing.timeline.lanes.every((l) => l.row.window?.state === 'closing')).toBe(true);
    expect(closing.filters.clearHref).toBe('/lab/radar?sample=1');
    const adopted = await page('radar', s, FLAGS.sample, { class: 'adopted' });
    expect(adopted.timeline.lanes.every((l) => l.row.class === 'adopted')).toBe(true);
    const none = await page('radar', s, FLAGS.sample, { class: 'adopted', state: 'closed' });
    if (none.timeline.lanes.length === 0) expect(none.timeline.state).toMatchObject({ kind: 'empty', message: 'No events match these filters.', action: { label: 'Clear filters' } });
  });
  it('no sponsor section and no SponsorRow import', async () => {
    const v = await page('radar', fixtureStore(), FLAGS.sample);
    expect(Object.keys(v)).not.toContain('sponsors');
    const roots = ['lib/lab/view', 'components/lab/v2', 'app/lab'].map((d) => path.join(process.cwd(), d)).filter(existsSync);
    const scan = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? scan(path.join(d, e.name)) : [path.join(d, e.name)]));
    for (const f of roots.flatMap(scan).filter((f) => /\.(ts|tsx)$/.test(f))) expect(readFileSync(f, 'utf8'), f).not.toMatch(/SponsorRow/);
  });
});

describe('AC-01-16 Breakouts', () => {
  it('Dual-High rule (04 isDualHigh): 3.0 and 3.0 true; 2.9 and 5 false', () => {
    expect(isDualHigh(3.0, 3.0)).toBe(true);
    expect(isDualHigh(2.9, 5)).toBe(false);
  });
  it('filters apply; mine=1 swaps to owned posts newest first', async () => {
    const s = fixtureStore();
    const all = await page('breakouts', s, FLAGS.sample);
    expect(all.cards.items.length).toBeGreaterThan(0);
    const plat = all.filters.platforms[0].id;
    const one = await page('breakouts', s, FLAGS.sample, { platform: plat });
    expect(one.cards.items.every((c) => c.platform === plat)).toBe(true);
    expect(one.applied.platform).toBe(plat);
    expect(one.clearHref).toBe('/lab/breakouts?sample=1');
    const mine = await page('breakouts', s, FLAGS.sample, { mine: '1', window: '90' });
    expect(mine.cards.items.length).toBeGreaterThan(0);
    expect(mine.cards.items.every((c) => c.creator.owned)).toBe(true);
    const dates = mine.cards.items.map((c) => c.postedAt ?? '');
    expect([...dates].sort().reverse()).toEqual(dates);
  });
  it('paging: nextOffset at 61 results, from= continues', async () => {
    const s = fixtureStore();
    const v = await page('breakouts', s, FLAGS.sample, { window: '90' });
    if (v.cards.total > BREAKOUTS_PAGE) {
      expect(v.cards.items).toHaveLength(BREAKOUTS_PAGE);
      expect(v.cards.nextOffset).toBe(BREAKOUTS_PAGE);
      const more = await page('breakouts', s, FLAGS.sample, { window: '90', from: String(BREAKOUTS_PAGE) });
      expect(more.cards.items[0].postId).not.toBe(v.cards.items[0].postId);
    } else {
      expect(v.cards.nextOffset).toBeNull();
    }
  });
});

describe('AC-01-17 Playbook', () => {
  it('default format is the one with most breakouts; only shown rows; hiddenCount; marks are 06 testMark labels', async () => {
    const s = fixtureStore();
    const v = await page('playbook', s, FLAGS.sample);
    const max = Math.max(...v.formats.map((f) => f.breakoutsN));
    expect(v.formats.find((f) => f.id === v.format)?.breakoutsN).toBe(max);
    const prof = s.profiles.latest().find((p) => p.formatFamily === v.format)!;
    const shown = prof.features.filter((f) => f.shown && f.lift !== null && f.lo !== null && f.hi !== null);
    expect(v.lifts.rows.map((r) => r.id).sort()).toEqual(shown.map((f) => `lift-${f.feature}-${f.value}`).sort());
    expect(v.lifts.hiddenCount).toBe(prof.features.filter((f) => f.lift !== null && !f.shown && f.n >= 8).length);
    if (v.lifts.hiddenCount) expect(v.lifts.hiddenText).toBe(`${v.lifts.hiddenCount} more hidden: the interval crosses 1 or the false-discovery check failed.`);
    for (const r of v.lifts.rows) {
      const tm = testMark(s, `${r.feature}:${r.value}`, r.estimate >= 1 ? 1 : -1);
      expect(r.mark).toBe(tm.mark);
      expect(r.markLabel).toBe(tm.label);
    }
  });
  it('a contradicted row stays listed, with 06 label and a test link, and never feeds the Brief', async () => {
    const s = blankStore();
    seedLabFixtures(s, NOW);
    const first = await page('playbook', s, FLAGS.sample);
    const row = first.lifts.rows[0];
    const base = s.tests.get('fx-test-1')!;
    const key = `${row.feature}:${row.value}`;
    const sign = row.estimate >= 1 ? -1 : 1;
    for (const id of ['fx-x-1', 'fx-x-2']) s.tests.create({ ...base, id, featureKey: key, observedSign: sign, createdAt: NOW.toISOString() });
    const v = await page('playbook', s, FLAGS.sample);
    const c = v.lifts.rows.find((r) => r.id === row.id)!;
    expect(c.mark).toBe('contradicted');
    expect(c.markLabel).toBe(testMark(s, key, row.estimate >= 1 ? 1 : -1).label);
    expect(c.markLabel).toBe('contradicted by test (2 of 2)');
    expect(c.testHref).toMatch(/^\?test=fx-x-\d&sample=1$/);
    expect(briefCandidates(s).some((b) => b.feature === row.feature && b.value === row.value)).toBe(false);
  });
});

describe('AC-01-18 Studio', () => {
  it('studio equals studioView unchanged; grouping; default selection; diversity line', async () => {
    const s = fixtureStore();
    const v = await page('studio', s, FLAGS.sample);
    expect(v.studio).toEqual(studioView(s, { now: NOW, sample: true, dry: false }));
    expect(v.groups.map((g) => g.id)).toEqual(expect.arrayContaining(['open_window', 'used', 'dismissed']));
    expect(v.groups.find((g) => g.id === 'used')?.collapsed).toBe(true);
    const firstOpen = v.groups.filter((g) => !['used', 'dismissed'].includes(g.id)).flatMap((g) => g.items)[0];
    expect(v.selected?.data.id).toBe(firstOpen.id);
    expect(v.diversity.text).toBe(v.studio.diversity.text);
    expect(v.generate.state).toBe('read_only');
  });
  it('?idea= selects instead of opening a sheet (D5)', async () => {
    const s = fixtureStore();
    const id = s.ideas.all('open')[1].id;
    const v = await page('studio', s, FLAGS.sample, { idea: id });
    expect(v.selected?.data.id).toBe(id);
    expect(v.sheet).toBeNull();
  });
  it('seeds: comments off shows the commentsOff copy with Set up', async () => {
    const v = await page('studio', fixtureStore(), FLAGS.sample);
    expect(v.seeds.state).toMatchObject({ kind: 'off', message: 'Comments are off. Turn them on in Setup > Spend.' });
  });
});

describe('AC-01-19 Ledger', () => {
  it('ledger equals ledgerView unchanged; calibration sentence is 06 hero sentence', async () => {
    const s = fixtureStore();
    const v = await page('ledger', s, FLAGS.sample);
    const l = ledgerView(s, { now: NOW, dry: false, filming: false, sample: true });
    expect(v.ledger).toEqual(l);
    expect(v.calibration.sentence).toBe(l.hero.sentence);
    expect(v.forecasts.record).toEqual(l.forecastRecord);
    expect(v.predictorOptions[0].id).toBe('all');
  });
  it('meta by n: 0, 3 (no k of n), 9 and 25', () => {
    const card = { id: 'brody', metrics: { pairwise: { display: '62% (n 9)' }, coverage: { display: '80%' } } };
    const mk = (n: number) => ({ hero: { n, predictor: 'brody', sentence: '' }, predictors: [card] }) as unknown as Parameters<typeof calibrationMeta>[0];
    expect(calibrationMeta(mk(0))).toBe('n 0');
    const m3 = calibrationMeta(mk(3));
    expect(m3).toBe('3 graded, not enough yet');
    expect(m3).not.toMatch(/\d of /);
    for (const n of [9, 25]) expect(calibrationMeta(mk(n))).toMatch(/^pairwise .+ · coverage .+$/);
  });
  it('status labels and tones', async () => {
    expect(testStatusLabel({ status: 'planned', result: null, resultLabel: null } as never)).toBe('Planned');
    expect(testStatusLabel({ status: 'running', result: null, resultLabel: null } as never)).toBe('Running');
    expect(testStatusLabel({ status: 'awaiting_result', result: null, resultLabel: null } as never)).toBe('Waiting for the result');
    expect(testStatusLabel({ status: 'done', result: 'winner', resultLabel: 'Winner: Hook A' } as never)).toBe('Winner: Hook A');
    expect(testStatusLabel({ status: 'done', result: 'performed_same', resultLabel: null } as never)).toBe('Performed the same');
    expect(testStatusLabel({ status: 'done', result: 'inconclusive', resultLabel: null } as never)).toBe('Inconclusive');
    expect(testStatusLabel({ status: 'abandoned', result: null, resultLabel: null } as never)).toBe('Stopped');
    const v = await page('ledger', fixtureStore(), FLAGS.sample);
    for (const t of v.tests.rows) expect(t.tone).toBe(t.row.result === 'winner' ? 'ok' : 'neutral');
  });
  it('predictor filter keeps that predictor rows only', async () => {
    const s = fixtureStore();
    const v = await page('ledger', s, FLAGS.sample, { predictor: 'brody' });
    const label = v.ledger!.predictors.find((p) => p.id === 'brody')!.label;
    expect(v.predictions.rows.length).toBeGreaterThan(0);
    expect(v.predictions.rows.every((r) => r.predictorLabel === label)).toBe(true);
  });
});
