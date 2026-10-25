import { describe, expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { LAB_DDL, openDb } from '@/lib/db';
import { LAB_TABLES, labStore } from '@/lib/lab/store';

const fresh = () => {
  const db = new Database(':memory:');
  db.exec(LAB_DDL);
  return labStore(db);
};
const post = (id: string, externalId: string, extra: Record<string, unknown> = {}) => ({
  id, sourceId: 's1', platform: 'tiktok' as const, externalId, url: `https://example.com/${externalId}`, postedAt: '2026-10-01T10:00:00.000Z',
  caption: 'c', contentType: 'video', thumbnailUrl: null, mediaUrl: null, durationS: 40, isOwned: false, ...extra,
});

describe('lab tables in lib/db.ts', () => {
  test('openDb creates every SPEC §6 table, additively (a second open is a no-op)', () => {
    const db = openDb(':memory:');
    const counts = db.lab.counts();
    expect(Object.keys(counts).sort()).toEqual([...LAB_TABLES].sort());
    // v2: the only row on a fresh database is the schema_version prior migrateLabV2 writes (08.11.2)
    expect(Object.entries(counts).every(([t, n]) => n === (t === 'lab_priors' ? 1 : 0))).toBe(true);
    expect(db.lab.priors.get('schema_version')?.value).toEqual({ v: 2 });
    expect(db.lab.isEmpty()).toBe(true);
    db.close();
  });
});

describe('lab store', () => {
  test('posts upsert on (platform, external_id) and keep the first id', () => {
    const s = fresh();
    expect(s.posts.upsert(post('p1', 'x1'))).toBe('p1');
    expect(s.posts.upsert(post('p2', 'x1', { caption: 'new caption', thumbnailUrl: null }))).toBe('p1');
    expect(s.posts.count()).toBe(1);
    expect(s.posts.get('p1')?.caption).toBe('new caption');
  });

  test('metrics are append-only and the latest read wins; null counters stay null', () => {
    const s = fresh();
    s.posts.upsert(post('p1', 'x1'));
    s.metrics.add({ postId: 'p1', capturedAt: '2026-10-01T12:00:00.000Z', views: 100, likes: 5, comments: 1, shares: null, saves: null });
    s.metrics.add({ postId: 'p1', capturedAt: '2026-10-02T12:00:00.000Z', views: 900, likes: 40, comments: 3, shares: 2, saves: null });
    expect(s.metrics.forPost('p1')).toHaveLength(2);
    const latest = s.metrics.latest().get('p1')!;
    expect(latest.views).toBe(900);
    expect(latest.saves).toBeNull();
  });

  test('sources: upsert, case-insensitive handle lookup, kind and status changes', () => {
    const s = fresh();
    s.sources.upsert({ id: 'a', kind: 'suggested', platform: 'tiktok', handle: 'Maker.One', url: null, displayName: 'M', status: 'active', addedAt: '2026-10-01T00:00:00.000Z', reason: 'r', score: 0.5 });
    expect(s.sources.byHandle('tiktok', 'maker.one')?.id).toBe('a');
    expect(s.sources.setKind('a', 'tracked')).toBe(true);
    expect(s.sources.setStatus('a', 'dismissed')).toBe(true);
    expect(s.sources.get('a')).toMatchObject({ kind: 'tracked', status: 'dismissed' });
    expect(s.isEmpty()).toBe(false);
  });

  test('dissections round-trip beats, tension and confidences as typed values', () => {
    const s = fresh();
    s.dissections.upsert({
      postId: 'p1', format: 'tutorial_walkthrough', hookForm: 'results_first', emotionalTrigger: 'curiosity', hookChannel: 'mixed', hookText: 'h', firstFrameText: 'f',
      structureType: 'demo_reveal', beats: [{ type: 'hook', startPct: 0, endPct: 8, summary: '' }], pacing: 'punchy', pillar: 'educational', ctaType: 'follow',
      tension: { falseBelief: 'a', reframe: 'b' }, confidences: { format: 0.9 }, qualityNotes: '', modelId: 'm', promptVersion: 'v1', analysedAt: '2026-10-01T00:00:00.000Z',
    });
    const d = s.dissections.get('p1')!;
    expect(d.beats[0]).toEqual({ type: 'hook', startPct: 0, endPct: 8, summary: '' });
    expect(d.tension).toEqual({ falseBelief: 'a', reframe: 'b' });
    expect(d.confidences.format).toBe(0.9);
  });

  test('topics keep a Float32 embedding blob', () => {
    const s = fresh();
    s.topics.replaceForPost('p1', [{ postId: 'p1', topic: 'agent memory', angle: 'cost', isPrimary: true, clusterId: 'c1', embedding: new Float32Array([0.25, -1, 3]) }]);
    expect(Array.from(s.topics.embedding('p1', 'agent memory')!)).toEqual([0.25, -1, 3]);
    s.topics.replaceForPost('p1', []);
    expect(s.topics.forPost('p1')).toEqual([]);
  });

  test('profiles are versioned; latest() returns the newest per family', () => {
    const s = fresh();
    const base = { formatFamily: 'tutorial_walkthrough', label: 'T', windowDays: 90, postsN: 10, breakoutsN: 2, features: [], strand: [], stats: { wpm: null, durationS: null }, createdAt: '2026-10-01T00:00:00.000Z' };
    s.profiles.insert({ ...base, id: 'v1', version: 1 });
    s.profiles.insert({ ...base, id: 'v2', version: s.profiles.nextVersion('tutorial_walkthrough') });
    expect(s.profiles.latest().map((p) => p.id)).toEqual(['v2']);
    expect(s.profiles.history('tutorial_walkthrough').map((p) => p.version)).toEqual([2, 1]);
  });

  test('runs update without losing fields; spend settles by run id', () => {
    const s = fresh();
    s.runs.insert({ id: 'r1', kind: 'scrape', apifyRunId: null, datasetId: null, actor: 'a/b', input: { x: 1 }, status: 'running', items: null, costUsd: null, dry: false, startedAt: '2026-10-01T00:00:00.000Z', finishedAt: null, error: null });
    s.spend.add({ runId: 'r1', provider: 'apify', units: 0, estUsd: null, actualUsd: null, dry: false, at: '2026-10-01T00:00:00.000Z' });
    s.runs.update('r1', { status: 'succeeded', items: 12, finishedAt: '2026-10-01T00:05:00.000Z' });
    expect(s.runs.get('r1')).toMatchObject({ actor: 'a/b', input: { x: 1 }, status: 'succeeded', items: 12 });
    expect(s.spend.settle('r1', 0.42, 12)).toBe(true);
    expect(s.spend.all()[0]).toMatchObject({ actualUsd: 0.42, units: 12 });
    expect(s.runs.open()).toEqual([]);
  });

  test('ideas: status changes stamp acted_on_at and keep the dismiss reason', () => {
    const s = fresh();
    s.ideas.upsert({ id: 'i1', title: 't', clusterId: null, angle: 'a', tension: null, formatFamily: 'f', strand: [], hookRecs: [], evidence: [], timing: null, fit: 0.5, thin: true, status: 'open', dismissReason: null, createdAt: '2026-10-01T00:00:00.000Z', actedOnAt: null });
    s.ideas.setStatus('i1', 'dismissed', { reason: 'window closed', at: '2026-10-02T00:00:00.000Z' });
    expect(s.ideas.get('i1')).toMatchObject({ status: 'dismissed', dismissReason: 'window closed', actedOnAt: '2026-10-02T00:00:00.000Z' });
    s.ideas.setStatus('i1', 'open');
    expect(s.ideas.get('i1')).toMatchObject({ status: 'open', dismissReason: null, actedOnAt: null });
  });

  test('clearAll empties every lab table', () => {
    const s = fresh();
    s.posts.upsert(post('p1', 'x1'));
    s.priors.set({ key: 'k', value: { a: 1 }, n: 3, supersedesDefault: false, updatedAt: '2026-10-01T00:00:00.000Z' });
    expect(s.priors.get('k')?.value).toEqual({ a: 1 });
    s.clearAll();
    expect(Object.values(s.counts()).every((n) => n === 0)).toBe(true);
  });
});
