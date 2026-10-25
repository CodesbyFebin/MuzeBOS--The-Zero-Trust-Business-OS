import { describe, expect, test } from 'vitest';
import { recomputeMeasuresV2 } from '@/lib/lab/measure/compute';
import { assignVerdicts, CONTROL_SEED_KEY, drawControl } from '@/lib/lab/measure/case-control';
import { followersAsOf } from '@/lib/lab/measure/asof';
import { MeasureEngine } from '@/lib/lab/measure/engine';
import { asOfView } from '@/lib/lab/measure/asof';
import { cellKey } from '@/lib/lab/measure/baseline';
import { computeProfile, featureRows } from '@/lib/lab/distill';
import { heroNormal } from '@/lib/lab/measure/view';
import type { LabDissection } from '@/lib/schemas';
import { buildDissectPrompt } from '@/lib/lab/dissect';
import { addCreator, addReads, BASE, DAY, emptyStore, HOUR, iso } from './helpers/lab-measure-world';

/** 04 6.4: the leakage guards (AC-04-24 to AC-04-32). */
const NOW = new Date(BASE + 70 * DAY);

function world() {
  const w = emptyStore();
  const a = addCreator(w.store, { id: 'cr-a', posts: 30, everyDays: 1.5, scale: 10_000 }, undefined, NOW.getTime());
  const b = addCreator(w.store, { id: 'cr-b', posts: 30, everyDays: 1.5, scale: 30_000, followers: 120_000 }, undefined, NOW.getTime());
  addCreator(w.store, { id: 'cr-c', posts: 30, everyDays: 1.5, scale: 5_000, followers: 20_000 }, undefined, NOW.getTime());
  // one clear breakout per creator so the verdict pass has cases
  for (const [posts, scale] of [[a, 10_000], [b, 30_000]] as const) {
    const p = posts[14];
    w.db.prepare('DELETE FROM lab_post_metrics WHERE post_id = ?').run(p.id);
    addReads(w.store, p, scale * 12, [6, 24, 72, 168, 336]);
  }
  w.store.priors.set({ key: CONTROL_SEED_KEY, value: 'seed-leak', n: 0, supersedesDefault: false, updatedAt: NOW.toISOString() });
  return { ...w, a, b };
}
const snapshot = (rows: unknown) => JSON.stringify(rows);

describe('04 6.4 leakage guards', () => {
  test('AC-04-24: a later post with 10x views in the same cell does not move an earlier post', () => {
    const w = world();
    recomputeMeasuresV2(w.store, { now: NOW });
    const t = w.a[12];
    const before = w.store.measures.get(t.id)!;
    expect(before.breakout).not.toBeNull();
    const late = { ...t, id: 'cr-a-late', externalId: 'cr-a-late', postedAt: iso(Date.parse(t.postedAt!) + 3 * DAY) };
    w.store.posts.upsert(late);
    addReads(w.store, late, 100_000, [6, 24, 72, 168, 336]);
    recomputeMeasuresV2(w.store, { now: NOW });
    const after = w.store.measures.get(t.id)!;
    expect([after.breakout, after.robustZ, after.baselineN]).toEqual([before.breakout, before.robustZ, before.baselineN]);
  });

  test('AC-04-25: a read captured after asOf changes nothing computed as of asOf', () => {
    const w = world();
    const asOf = new Date(BASE + 40 * DAY);
    recomputeMeasuresV2(w.store, { now: NOW, asOf });
    const first = snapshot(w.store.measures.all());
    w.store.metrics.add({ postId: w.a[3].id, capturedAt: iso(asOf.getTime() + HOUR), views: 9_999_999, likes: 1, comments: 1, shares: 1, saves: 1 });
    recomputeMeasuresV2(w.store, { now: NOW, asOf });
    expect(snapshot(w.store.measures.all())).toBe(first);
  });

  test('AC-04-26: followers as of posting; a snapshot 30 days later is not used', () => {
    const t = '2026-06-20T00:00:00.000Z';
    const at = (d: number) => iso(Date.parse(t) + d * DAY);
    expect(followersAsOf([{ capturedAt: at(-10), followers: 10_000 }, { capturedAt: at(3), followers: 50_000 }], t)).toEqual({ followers: 10_000, kind: 'before' });
    expect(followersAsOf([{ capturedAt: at(30), followers: 50_000 }], t)).toBeNull();
    const w = emptyStore();
    const [p] = addCreator(w.store, { id: 'solo', posts: 1, startMs: Date.parse(t) }, undefined, NOW.getTime());
    w.db.prepare('DELETE FROM lab_creator_snapshots').run();
    w.store.creatorSnapshots.add({ sourceId: 'solo', capturedAt: at(30), followers: 50_000, following: 1, postCount: 1 });
    recomputeMeasuresV2(w.store, { now: NOW });
    expect(w.store.measures.get(p.id)!.followersAsOf).toBeNull();
    expect(w.store.measures.get(p.id)!.reach).toBeNull();
  });

  test('AC-04-27: the dissect prompt carries no outcome cue and no metric digits', () => {
    const prompt = buildDissectPrompt({ platform: 'tiktok', contentType: 'video', durationS: 41, caption: 'This blew up, 2.3M views and 40k likes' }, null);
    for (const cue of ['2.3M', '40k', 'blew up', 'views', '2300000', '40000']) expect(prompt).not.toContain(cue);
  });

  test('AC-04-28: changing a dissection format changes no baseline and no ratio', () => {
    const w = world();
    const dis = (postId: string, format: LabDissection['format']): LabDissection => ({ postId, format, hookForm: 'results_first', emotionalTrigger: 'curiosity', hookChannel: 'spoken', hookText: 'x', firstFrameText: '', structureType: 'tutorial', beats: [], pacing: 'punchy', pillar: 'educational', ctaType: 'follow', tension: null, confidences: {}, qualityNotes: '', modelId: 'm', promptVersion: 'v', analysedAt: NOW.toISOString() });
    for (const p of w.a) w.store.dissections.upsert(dis(p.id, 'tutorial_walkthrough'));
    recomputeMeasuresV2(w.store, { now: NOW });
    const first = snapshot(w.store.measures.all());
    for (const p of w.a.slice(0, 10)) w.store.dissections.upsert(dis(p.id, 'talking_head'));
    recomputeMeasuresV2(w.store, { now: NOW });
    expect(snapshot(w.store.measures.all())).toBe(first);
  });

  test('AC-04-29: the control draw reads no content; changing captions, transcripts or dissections leaves lab_controls unchanged', () => {
    expect(drawControl.length).toBe(3);
    const a = world();
    assignVerdicts(a.store, NOW);
    const rowsA = a.store.controls.all();
    expect(rowsA.some((c) => c.role === 'case')).toBe(true);
    expect(rowsA.some((c) => c.role === 'control')).toBe(true);
    const b = world();
    for (const p of [...b.a, ...b.b]) {
      b.store.posts.upsert({ ...p, caption: 'This blew up, 2.3M views' });
      b.store.transcripts.upsert({ postId: p.id, text: 'different words entirely', wordCount: 3, wpm: null, provider: 'whisper-1', costUsd: 0, status: 'done' });
    }
    assignVerdicts(b.store, NOW);
    expect(snapshot(b.store.controls.all())).toBe(snapshot(rowsA));
  });

  test('AC-04-30: reads after verdict age + 24h do not change a role', () => {
    const a = world();
    assignVerdicts(a.store, NOW);
    const b = world();
    for (const p of [...b.a, ...b.b]) b.store.metrics.add({ postId: p.id, capturedAt: iso(Date.parse(p.postedAt!) + 250 * HOUR), views: 5_000_000, likes: 1, comments: 1, shares: 1, saves: 1 });
    assignVerdicts(b.store, NOW);
    expect(snapshot(b.store.controls.all())).toBe(snapshot(a.store.controls.all()));
  });

  test('AC-04-31: an outside push is out of mining and in the hero median', () => {
    const w = world();
    recomputeMeasuresV2(w.store, { now: NOW });
    assignVerdicts(w.store, NOW);
    const cases = w.store.controls.all().filter((c) => c.role === 'case');
    const dis = (postId: string): LabDissection => ({ postId, format: 'tutorial_walkthrough', hookForm: 'results_first', emotionalTrigger: 'curiosity', hookChannel: 'spoken', hookText: 'x', firstFrameText: '', structureType: 'tutorial', beats: [], pacing: 'punchy', pillar: 'educational', ctaType: 'follow', tension: null, confidences: {}, qualityNotes: '', modelId: 'm', promptVersion: 'v', analysedAt: NOW.toISOString() });
    for (const c of w.store.controls.all()) w.store.dissections.upsert(dis(c.postId));
    w.db.prepare("UPDATE lab_measures SET quadrant = 'ideal'").run();
    const rows = featureRows(w.store, { now: NOW });
    const n0 = computeProfile(rows, "tutorial_walkthrough", { version: 1, now: NOW }).postsN;
    w.db.prepare('UPDATE lab_measures SET exo_auto = 1 WHERE post_id = ?').run(cases[0].postId);
    const n1 = computeProfile(featureRows(w.store, { now: NOW }), 'tutorial_walkthrough', { version: 1, now: NOW }).postsN;
    expect(n1).toBe(n0 - 1);
    // owned and flagged by hand: still in "your posts vs your normal"
    const own = addCreator(w.store, { id: 'mine', owned: true, posts: 14 }, undefined, NOW.getTime());
    w.store.posts.flagExo(own[12].id, 'collab', null, NOW.toISOString());
    recomputeMeasuresV2(w.store, { now: NOW });
    const heroRows = own.map((p) => ({ postedAt: p.postedAt!, ratio: w.store.measures.get(p.id)!.breakout, platform: p.platform }));
    expect(heroRows.find((r) => r.postedAt === own[12].postedAt)!.ratio).not.toBeNull();
    const h = heroNormal(heroRows, { from: iso(BASE), to: iso(NOW.getTime()), prevFrom: iso(BASE - 30 * DAY) }, 'all');
    expect(h.n).toBe(heroRows.filter((r) => r.ratio !== null).length);
  });

  test('AC-04-32: a Shorts baseline never crosses the 2025-03-31 epoch', () => {
    const w = emptyStore();
    const start = Date.parse('2025-03-01T12:00:00.000Z');
    const posts = addCreator(w.store, { id: 'yt', platform: 'youtube', contentType: 'short', posts: 30, startMs: start, everyDays: 2 }, undefined, start + 90 * DAY);
    const asOf = iso(start + 90 * DAY);
    const engine = new MeasureEngine(asOfView(w.store, asOf));
    for (const p of posts) {
      const ep = engine.byId.get(p.id)!;
      const epochOf = (id: string) => cellKey(engine.byId.get(id)!.post).split('|')[2];
      const sampleIds = engine.posts.filter((q) => q.cell === ep.cell).map((q) => q.post.id);
      expect(new Set(sampleIds.map(epochOf)).size).toBe(1);
    }
    const pre = posts.find((p) => p.postedAt! < '2025-03-31')!;
    const post = posts.find((p) => p.postedAt! > '2025-04-01')!;
    expect(cellKey(pre)).not.toBe(cellKey(post));
  });
});
