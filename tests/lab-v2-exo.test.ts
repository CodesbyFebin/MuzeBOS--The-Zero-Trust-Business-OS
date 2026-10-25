import { describe, expect, test } from 'vitest';
import { detectStepJump } from '@/lib/lab/measure/exogenous';
import { recomputeMeasuresV2 } from '@/lib/lab/measure/compute';
import { computeProfile, type FeatureRow } from '@/lib/lab/distill';
import { heroNormal } from '@/lib/lab/measure/view';
import type { LabDissection } from '@/lib/schemas';
import { addCreator, BASE, DAY, emptyStore, HOUR, iso } from './helpers/lab-measure-world';

/** 04 3.10 (AC-04-12). */
describe('the exogenous spike flag', () => {
  test('the worked example is flagged at 96h; a jump before 48h is not', () => {
    expect(detectStepJump([{ ageH: 48, basis: 10_000 }, { ageH: 72, basis: 11_000 }, { ageH: 96, basis: 16_000 }])).toMatchObject({ flagged: true, atH: 96 });
    expect(detectStepJump([{ ageH: 12, basis: 1_000 }, { ageH: 24, basis: 1_100 }, { ageH: 36, basis: 9_000 }]).flagged).toBe(false);
  });

  test('recompute writes exo_auto from the reads', () => {
    const { store } = emptyStore();
    const [p] = addCreator(store, { id: 'jumpy', posts: 1 }, [6, 24], BASE + 10 * DAY);
    const at = (h: number) => iso(BASE + h * HOUR);
    for (const [h, v] of [[48, 10_000], [72, 11_000], [96, 16_000]] as const) store.metrics.add({ postId: p.id, capturedAt: at(h), views: v, likes: 1, comments: 1, shares: null, saves: null });
    recomputeMeasuresV2(store, { now: new Date(BASE + 10 * DAY) });
    expect(store.measures.get(p.id)!.exoAuto).toBe(true);
  });

  test('a flagged post is absent from mining and present in the hero median', () => {
    const dis = (postId: string): LabDissection => ({ postId, format: 'tutorial_walkthrough', hookForm: 'results_first', emotionalTrigger: 'curiosity', hookChannel: 'spoken', hookText: 'x', firstFrameText: '', structureType: 'tutorial', beats: [], pacing: 'punchy', pillar: 'educational', ctaType: 'follow', tension: null, confidences: {}, qualityNotes: '', modelId: 'm', promptVersion: 'v', analysedAt: iso(BASE) });
    const row = (id: string, role: 'case' | 'control', exo: { reason?: 'collab'; auto?: boolean }): FeatureRow => ({
      post: { id, sourceId: 's', platform: 'tiktok', externalId: id, url: 'u', postedAt: iso(BASE), caption: '', contentType: 'video', thumbnailUrl: null, mediaUrl: null, durationS: 40, isOwned: false, exoReason: exo.reason ?? null },
      dissection: dis(id),
      measure: { postId: id, depth: 0.05, breakout: 4, breakoutLo: 3, breakoutHi: 5, baselineN: 10, baselineConfidence: 'ok', reach: null, velocity: null, trajectory: null, quadrant: 'ideal', isBreakout: role === 'case', computedAt: iso(BASE), exoAuto: Boolean(exo.auto) },
      transcript: null,
      clusterId: null,
      role,
      pi: role === 'case' ? 1 : 0.1,
      stratum: 's|2026-06',
    });
    const rows = [row('a', 'case', {}), row('b', 'case', { auto: true }), row('c', 'control', { reason: 'collab' }), row('d', 'control', {})];
    expect(computeProfile(rows, 'tutorial_walkthrough', { version: 1 }).postsN).toBe(2);
    const hero = heroNormal([{ postedAt: iso(BASE), ratio: 4, platform: 'tiktok' }, ...[1, 1.1, 0.9, 1.2].map((r) => ({ postedAt: iso(BASE), ratio: r, platform: 'tiktok' as const }))], { from: iso(BASE - DAY), to: iso(BASE + DAY), prevFrom: iso(BASE - 2 * DAY) }, 'all');
    expect(hero.n).toBe(5);
  });
});
