/**
 * Sheet models: AC-01-21 Post, AC-01-22 Event, AC-01-23 Idea, AC-01-25 Test, AC-01-26 Setup,
 * AC-01-27 Ask (model halves; the component halves belong to the UI lanes).
 */
import { describe, expect, it } from 'vitest';
import { checkpointsFor, platformNote } from '@/lib/lab/view/sheets/post';
import { eventStateText } from '@/lib/lab/view/sheets/event';
import { eventSheetView } from '@/lib/lab/radar/view';
import { recommendAngle, ALL_TAKEN_COPY } from '@/lib/lab/radar/angles';
import { ideaSheetView } from '@/lib/lab/gen/view';
import { setupView } from '@/lib/lab/setup/view';
import { askView } from '@/lib/lab/gen/view';
import { refineHrefFor } from '@/lib/lab/view/sheets/ask';
import { LabTestSchema } from '@/lib/schemas';
import { LAB_COPY } from '@/lib/lab/view/copy';
import { ENV, FIXTURE_IDS, FLAGS, NOW, blankStore, fixtureStore, sheet, walk } from './helpers/lab-v2-v';

const HOUR = 3_600_000;
const posted = new Date(NOW.getTime() - 30 * HOUR).toISOString();
const snapAt = (h: number) => ({ capturedAt: new Date(Date.parse(posted) + h * HOUR).toISOString(), views: 1000 });

describe('AC-01-21 Post sheet', () => {
  it('a post aged 30h with snapshots at 5h and 26h: 6h read, 24h read, 72h pending', () => {
    const cps = checkpointsFor({ postedAt: posted }, [snapAt(5), snapAt(26)], null, NOW);
    expect(cps.map((c) => [c.label, c.state])).toEqual([['6h', 'read'], ['24h', 'read'], ['72h', 'pending'], ['7d', 'pending']]);
  });
  it('24h is missed when the only snapshot is at 40h (40 > 30 = 24 x 1.25)', () => {
    const old = new Date(NOW.getTime() - 50 * HOUR).toISOString();
    const cps = checkpointsFor({ postedAt: old }, [{ capturedAt: new Date(Date.parse(old) + 40 * HOUR).toISOString(), views: 1 }], null, NOW);
    expect(cps.find((c) => c.h === 24)?.state).toBe('missed');
  });
  it('platform notes', () => {
    expect(platformNote({ platform: 'twitter', postedAt: posted, durationS: null })).toBe('X posts stop being read at 48h.');
    expect(platformNote({ platform: 'youtube', postedAt: '2025-01-10T00:00:00Z', durationS: 40 })).toBe('YouTube Shorts before 31 Mar 2025 counted views differently.');
    expect(platformNote({ platform: 'youtube', postedAt: posted, durationS: 40 })).toBeNull();
    expect(platformNote({ platform: 'instagram', postedAt: posted, durationS: 40 })).toBeNull();
  });
  it('owned posts: a hidden prediction carries no digit; comment rows carry no author', async () => {
    const s = fixtureStore();
    let hidden = 0;
    for (const p of s.posts.all().filter((x) => x.isOwned).slice(0, 40)) {
      const sh = await sheet('post', p.id, s, FLAGS.sample);
      const v = sh.kind === 'post' ? sh.view! : null;
      if (!v) continue;
      if (v.prediction.state === 'hidden') {
        hidden++;
        // no prediction value is shown: only 06's hiddenReason line (06 8.3), verbatim
        expect(v.prediction.chip).toMatchObject({ text: null, record: null });
        expect(v.prediction.chip?.hiddenReason).toBeTruthy();
      }
      for (const r of v.comments.rows) {
        expect(Object.keys(r).sort()).toEqual(['byCreator', 'id', 'intent', 'intentLabel', 'likes', 'text']);
      }
    }
    console.log(`[AC-01-21] hidden predictions seen: ${hidden}`);
  });
  it('tracked posts hide the prediction block; frames off and none built -> off state (tab hidden); comments off -> commentsOff', async () => {
    const s = fixtureStore();
    const tracked = s.posts.all().find((p) => !p.isOwned)!;
    const sh = await sheet('post', tracked.id, s, FLAGS.sample);
    const v = sh.kind === 'post' ? sh.view! : null;
    expect(v?.prediction.state).toBe('not_owned');
    if (!v?.frames.src) expect(v?.frames.state.kind).toBe('off');
    expect(v?.comments.state).toMatchObject({ kind: 'off', message: LAB_COPY.layer.commentsOff });
  });
  it('unknown id: view null', async () => {
    expect((await sheet('post', 'nope', fixtureStore(), FLAGS.sample)).view).toBeNull();
  });
});

describe('AC-01-22 Event sheet', () => {
  it('data is eventSheetView unchanged; default angle is 05 recommendAngle', async () => {
    const s = fixtureStore();
    const sh = await sheet('event', FIXTURE_IDS.event, s, FLAGS.sample);
    const v = sh.kind === 'event' ? sh.view! : null;
    const data = eventSheetView(s, FIXTURE_IDS.event, NOW, { sample: true, dry: false })!;
    expect(v?.data).toEqual(data);
    expect(v?.make.defaultAngle).toBe(data.recommendedAngle);
    expect(v?.make.options.some((o) => o.id === ('other' as never))).toBe(false);
    expect(v?.make.disabledReason).toBe(LAB_COPY.readOnly);
    expect(Object.keys(v ?? {})).not.toContain('mute');
  });
  it('all angles taken: first_look with 05 copy', () => {
    const r = recommendAngle({ taken: new Set(['first_look', 'real_examples', 'hours_spent', 'comparison', 'how_to', 'money', 'drama']), windowState: 'open', own: {} });
    expect(r).toMatchObject({ angle: 'first_look', allTaken: true, copy: ALL_TAKEN_COPY });
  });
  it('stateText for open, closing, closed and unconfirmed', () => {
    const cov = { label: '3 of 14 creators' } as never;
    const closesAt = new Date(NOW.getTime() + 63 * HOUR).toISOString();
    expect(eventStateText({ window: { state: 'open', closesAt } as never, coverage: cov }, null, NOW)).toBe('Window open, 2d 15h left');
    expect(eventStateText({ window: { state: 'closing', closesAt } as never, coverage: cov }, null, NOW)).toBe('Closing: 3 of 14 creators covered');
    expect(eventStateText({ window: { state: 'closed', closesAt: new Date(NOW.getTime() - 50 * HOUR).toISOString() } as never, coverage: cov }, null, NOW)).toBe('Closed 2d ago');
    expect(eventStateText({ window: null, coverage: cov }, null, NOW)).toBe('Not confirmed yet');
  });
});

describe('AC-01-23 Idea sheet and no score fields', () => {
  it('data is ideaSheetView unchanged; no virality score', async () => {
    const s = fixtureStore();
    const sh = await sheet('idea', FIXTURE_IDS.idea, s, FLAGS.sample);
    const v = sh.kind === 'idea' ? sh.view! : null;
    expect(v?.data).toEqual(ideaSheetView(s, FIXTURE_IDS.idea, { now: NOW, dry: false, sample: true, readOnly: true }));
    if (v?.prediction.state === 'hidden') expect(v.prediction.chip).toMatchObject({ text: null, record: null });
  });
});

describe('AC-01-25 Test sheet', () => {
  it('new: form with both kinds, 06 hygiene, limits and the post prefill', async () => {
    const s = fixtureStore();
    const ig = s.posts.all().find((p) => p.isOwned && p.platform === 'instagram')!;
    const sh = await sheet('test', 'new', s, FLAGS.sample, { post: ig.id });
    const v = sh.kind === 'test' ? sh.view! : null;
    expect(v?.mode).toBe('new');
    if (v?.mode !== 'new') return;
    expect(v.form.kinds.map((k) => k.id)).toEqual(['trial_reels', 'yt_test_compare']);
    expect(v.form.kinds[0].hygiene).toEqual(['Same body and caption. Change only the hook.', 'Post all trials within 24 hours of each other.', 'Compare trials only with trials.', 'Judged at 72 hours on shares per reach.']);
    expect(v.form.prefillPostId).toBe(ig.id);
    expect(v.form.limits).toEqual({ titleMin: 1, titleMax: 120, hypothesisMax: 500, armsMin: 2, armsMax: 3, variantMax: 500 });
  });
  it('view: 06 worked examples (winner, inconclusive) status labels and sub-lines; the test row is 06 LabTest', async () => {
    const s = fixtureStore();
    const win = await sheet('test', FIXTURE_IDS.test, s, FLAGS.sample);
    const w = win.kind === 'test' && win.view?.mode === 'view' ? win.view.test : null;
    expect(w?.statusLabel).toBe('Winner: Hook A');
    expect(w?.tone).toBe('ok');
    expect(LabTestSchema.safeParse(w?.test).success).toBe(true);
    const inc = await sheet('test', FIXTURE_IDS.testInconclusive, s, FLAGS.sample);
    const i = inc.kind === 'test' && inc.view?.mode === 'view' ? inc.view.test : null;
    expect(i).toMatchObject({ statusLabel: 'Inconclusive', tone: 'neutral', resultSubline: 'Most tests end here. Run it again or test a bigger difference.' });
    expect(Object.keys(i?.actions ?? {})).not.toContain('delete');
  });
});

describe('AC-01-26 Setup sheet', () => {
  it('setup is setupView unchanged; rail order; focus=add', async () => {
    const s = fixtureStore();
    const sh = await sheet('setup', 'sources', s, FLAGS.sample, { focus: 'add' });
    const v = sh.kind === 'setup' ? sh.view : null;
    expect(v?.setup).toEqual(setupView(s, { now: NOW, dry: false, dryLabel: null, sample: true, filming: false, readOnly: true, section: 'sources', env: ENV }));
    expect(v?.rail.map((r) => r.id)).toEqual(['checklist', 'keys', 'sources', 'schedule', 'spend']);
    expect(v?.focusAdd).toBe(true);
  });
  it('?setup=1 resolves to checklist until complete', async () => {
    const sh = await sheet('setup', '1', blankStore(), FLAGS.real);
    expect(sh.id).toBe('checklist');
  });
  it('the serialized sheet never holds a key value', async () => {
    const env = { ...ENV, APIFY_TOKEN: 'apify_api_TESTSECRET123' };
    const { buildSheet } = await import('@/lib/lab/view/build');
    const { labParams } = await import('@/lib/lab/context');
    const sh = await buildSheet('setup', 'keys', fixtureStore(), labParams(() => null), FLAGS.real, NOW, { env });
    expect(JSON.stringify(sh)).not.toMatch(/TESTSECRET/);
  });
});

describe('AC-01-27 Ask sheet', () => {
  it('ask is askView unchanged; chips mirror filters.matched', async () => {
    const s = fixtureStore();
    const q = 'tiktok breakouts this month';
    const sh = await sheet('ask', q, s, FLAGS.sample);
    const v = sh.kind === 'ask' ? sh.view : null;
    const a = await askView(s, q, { now: NOW, dry: false, sample: true, readOnly: true });
    expect(v?.state).toBe('answer');
    expect(v?.ask).toEqual(a);
    expect(v?.chips).toHaveLength(a.filters.matched.length);
    expect(v?.refineHref).toBe('/lab/breakouts?platform=tiktok&window=30&sample=1');
  });
  it('refineHref is null for a 60-day window', () => {
    expect(refineHrefFor({ platforms: ['tiktok'], formats: [], hookForms: [], creators: [], minRatio: null, maxRatio: null, days: 60, owned: 'any', dualHigh: false } as never)).toBeNull();
    expect(refineHrefFor({ platforms: ['tiktok'], formats: [], hookForms: [], creators: [], minRatio: null, maxRatio: null, days: 30, owned: 'any', dualHigh: false } as never)).toBe('/lab/breakouts?platform=tiktok&window=30');
  });
});

describe('AC-01-23 no score field in any page or sheet view (tests/lab-v2-no-score scope)', () => {
  it('walks every sheet view on the fixture world', async () => {
    const s = fixtureStore();
    const ids: [Parameters<typeof sheet>[0], string][] = [['post', FIXTURE_IDS.firstPost], ['event', FIXTURE_IDS.event], ['idea', FIXTURE_IDS.idea], ['script', FIXTURE_IDS.script], ['test', FIXTURE_IDS.test], ['setup', 'keys'], ['ask', 'tiktok breakouts this month']];
    for (const [k, id] of ids) {
      const sh = await sheet(k, id, s, FLAGS.sample);
      walk(sh, (key, path) => {
        if (/score/i.test(key)) expect(['externalScore', 'externalScoreLabel'].includes(key) || /\.(metrics|cells|judge|gate|scores|rules|intent|predictions?)\b/i.test(path) || /\.setup\.sources\./.test(path), `${k}: ${path}`).toBe(true);
      }, (str, path) => expect(str, `${k}: ${path}`).not.toMatch(/virality/i));
    }
  });
});
