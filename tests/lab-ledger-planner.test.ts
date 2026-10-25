import { describe, expect, test } from 'vitest';
import type { LabQuadrant } from '@/lib/schemas';
import { PLANNER_DIMENSIONS, armPosterior, armPrior, computePlan, isoWeek, planWeek, plannerGate, plannerObservations, plannerView, settlePlannedPosts } from '@/lib/lab/ledger/planner';
import { DAY, addPost, addSource, iso, memStore } from './helpers/lab-ledger-world';

const NOW = Date.parse('2026-10-14T12:00:00.000Z'); // a Wednesday
const HOOKS = PLANNER_DIMENSIONS.hook;

function world(n: number, opts: { clickbait?: string } = {}) {
  const s = memStore();
  addSource(s, 'own');
  for (let i = 0; i < n; i++) {
    const id = `pl${i}`;
    addPost(s, { id, source: 'own', postedAt: NOW - (i + 4) * DAY + (i % 4) * 6 * 3_600_000, durationS: [20, 45, 75, 120][i % 4] });
    const ratio = 0.6 + ((i * 7) % 11) / 5;
    const quadrant: LabQuadrant = opts.clickbait === id ? 'clickbait' : 'ideal';
    s.measures.upsert({ postId: id, depth: null, breakout: ratio, breakoutLo: null, breakoutHi: null, baselineN: 10, baselineConfidence: 'ok', reach: null, velocity: null, trajectory: null, quadrant, isBreakout: false, computedAt: iso(NOW), ages: { 72: { y: null, ratio, lo: null, hi: null, z: null, n: 10, how: 'interpolated' } } });
    s.dissections.upsert({ postId: id, format: 'talking_head', hookForm: HOOKS[i % HOOKS.length], emotionalTrigger: 'curiosity', hookChannel: 'spoken', hookText: '', firstFrameText: '', structureType: 'tutorial', beats: [], pacing: 'punchy', pillar: 'educational', ctaType: 'none', tension: null, confidences: {}, qualityNotes: '', modelId: 'x', promptVersion: 'x', analysedAt: iso(NOW) });
  }
  return s;
}

describe('Thompson planner (06 section 11)', () => {
  test('AC-06-45 closed under 20 posts with 72 h results', () => {
    const s = world(19);
    expect(plannerGate(s)).toMatchObject({ n: 19, open: false, need: 20 });
    expect(planWeek(s, new Date(NOW))).toBeNull();
    expect(plannerView(s, new Date(NOW))).toBeNull();
    const t = world(20);
    expect(plannerGate(t).open).toBe(true);
    expect(planWeek(t, new Date(NOW))!.slots).toBeGreaterThan(0);
    // exogenous posts do not count
    t.posts.flagExo('pl0', 'paid_boost', null, iso(NOW));
    expect(plannerGate(t).open).toBe(false);
  });

  test('AC-06-46 posterior worked example: mean 0.112, var 0.0191', () => {
    const p = armPosterior({ mu0: 0.1, n0: 3, sigma2: 0.09, obs: [{ y: 0.3, ageDays: 0 }, { y: -0.1, ageDays: 30 }] });
    expect(p.mean).toBeCloseTo(0.112, 3);
    expect(p.var).toBeCloseTo(0.0191, 4);
  });

  test('AC-06-47 the plan is identical within an ISO week; propensities sum to 1 per dimension', () => {
    const s = world(24);
    const a = computePlan(s, new Date(NOW))!;
    const b = computePlan(s, new Date(NOW + 2 * DAY))!; // Friday, same week
    expect(isoWeek(new Date(NOW))).toBe(isoWeek(new Date(NOW + 2 * DAY)));
    expect(b.slots).toEqual(a.slots);
    expect(b.propensity).toEqual(a.propensity);
    for (const d of Object.keys(PLANNER_DIMENSIONS) as (keyof typeof PLANNER_DIMENSIONS)[]) {
      expect(Object.values(a.propensity[d]).reduce((x, y) => x + y, 0)).toBeCloseTo(1, 10);
    }
    // stored slots are regenerated only while planned
    planWeek(s, new Date(NOW));
    const rows = s.tests.all({ kind: 'planned_post' });
    expect(rows.length).toBe(a.slots.length);
    s.tests.update(rows[0].id, { status: 'awaiting_result', arms: rows[0].arms.map((x) => ({ ...x, postId: 'pl1' })) });
    planWeek(s, new Date(NOW + DAY));
    expect(s.tests.get(rows[0].id)!.status).toBe('awaiting_result');
    expect(s.tests.all({ kind: 'planned_post' }).length).toBe(a.slots.length);
    expect(settlePlannedPosts(s, new Date(NOW))).toBe(1);
    expect(s.tests.get(rows[0].id)!.status).toBe('done');
    const v = plannerView(s, new Date(NOW))!;
    expect(v.reasons).toHaveLength(4);
    expect(v.n).toBe(24);
    for (const r of v.reasons) expect(r).toMatch(/^Try .+(chance it is your best|never tried, so the Lab cannot rule it out\.)/);
  });

  test('AC-06-48 a clickbait post\'s reward is capped at 0', () => {
    const s = world(20, { clickbait: 'pl3' });
    const o = plannerObservations(s).find((x) => x.postId === 'pl3')!;
    expect(s.measures.get('pl3')!.ages['72'].ratio).toBeGreaterThan(1);
    expect(o.y).toBe(0);
  });

  test('prior from a Playbook lift: mu0 = clamp(0.5 log10 lift), n0 3 when shown', () => {
    const s = world(20);
    s.profiles.insert({ id: 'pf1', formatFamily: 'talking_head', label: 'Talking head', version: 1, windowDays: 90, postsN: 40, breakoutsN: 10, features: [{ feature: 'hook_form', value: 'results_first', total: 20, n: 9, lift: 1.58, lo: 1.1, hi: 2.2, shown: true }], strand: [], stats: { wpm: null, durationS: null }, createdAt: iso(NOW) });
    const p = armPrior(s, 'hook', 'results_first');
    expect(p.mu0).toBeCloseTo(0.0993, 3);
    expect(p.n0).toBe(3);
    expect(armPrior(s, 'format', 'talking_head')).toEqual({ mu0: 0, n0: 1 });
  });
});
