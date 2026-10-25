/**
 * A tiny hand-built Lab world for lane G's tests (fictional creators only): tracked and owned
 * posts with measures and dissections, and one launch event with coverage rows, so grounding
 * counts are exact and nothing depends on the fixture world's random draws.
 */
import Database from 'better-sqlite3';
import { LAB_DDL } from '@/lib/db';
import { labStore, type LabStore } from '@/lib/lab/store';
import type { LabEvent, LabFormat, LabHookForm, LabPlatform, LaunchAngle } from '@/lib/schemas';

export const T = new Date('2026-10-10T15:00:00.000Z');
const H = 3_600_000;
export const iso = (ms: number) => new Date(ms).toISOString();

export function emptyStore(): LabStore {
  const db = new Database(':memory:');
  db.exec(LAB_DDL);
  return labStore(db);
}

export function addSource(s: LabStore, id: string, opts: { kind?: 'tracked' | 'owned'; platform?: LabPlatform; handle?: string } = {}) {
  s.sources.upsert({ id, kind: opts.kind ?? 'tracked', platform: opts.platform ?? 'tiktok', handle: opts.handle ?? id.replace(/^src-/, ''), url: null, displayName: id, status: 'active', addedAt: iso(T.getTime() - 90 * 24 * H), reason: null, score: null });
}

export type PostSpec = { id: string; source: string; ratio: number | null; breakout?: boolean; owned?: boolean; ageH?: number; hook?: string; caption?: string; format?: LabFormat; hookForm?: LabHookForm; platform?: LabPlatform; confidence?: 'low' | 'ok' | 'high'; views?: number; durationS?: number | null; structure?: 'news_breakdown' | 'tutorial' };

export function addPost(s: LabStore, p: PostSpec) {
  const posted = T.getTime() - (p.ageH ?? 96) * H;
  s.posts.upsert({ id: p.id, sourceId: p.source, platform: p.platform ?? 'tiktok', externalId: p.id, url: `https://example.invalid/${p.id}`, postedAt: iso(posted), caption: p.caption ?? `${p.hook ?? 'A post'} caption`, contentType: 'video', thumbnailUrl: null, mediaUrl: null, durationS: p.durationS === undefined ? 40 : p.durationS, isOwned: Boolean(p.owned) });
  s.dissections.upsert({ postId: p.id, format: p.format ?? 'tutorial_walkthrough', hookForm: p.hookForm ?? 'results_first', emotionalTrigger: 'curiosity', hookChannel: 'spoken', hookText: p.hook ?? `Hook of ${p.id}`, firstFrameText: '', structureType: p.structure ?? 'tutorial', beats: [], pacing: 'conversational', pillar: 'educational', ctaType: 'follow', tension: null, confidences: {}, qualityNotes: '', modelId: 'test', promptVersion: 'dissect-v1', analysedAt: iso(posted + H) });
  if (p.ratio !== null) {
    s.measures.upsert({ postId: p.id, depth: null, breakout: p.ratio, breakoutLo: p.ratio * 0.8, breakoutHi: p.ratio * 1.2, baselineN: 12, baselineConfidence: p.confidence ?? 'ok', reach: null, velocity: null, trajectory: null, quadrant: null, isBreakout: p.breakout ?? p.ratio >= 3, computedAt: iso(T.getTime()) });
  }
  if (p.views !== undefined) s.metrics.add({ postId: p.id, capturedAt: iso(posted + 72 * H), views: p.views, likes: null, comments: null, shares: null, saves: null });
}

export function addEvent(s: LabStore, id: string, opts: { name?: string; status?: LabEvent['status']; windowState?: LabEvent['windowState']; clusterId?: string | null } = {}) {
  const t0 = T.getTime() - 20 * H;
  s.events.upsert({
    id, key: id, name: opts.name ?? 'Sample Kestrel 3', vendor: 'Sample Vendor', aliases: [], status: opts.status ?? 'confirmed', mergedInto: null, dismissReason: null,
    novelty: 'new_flagship', noveltySource: 'rule', class: 'unknown', classBasis: null,
    classInfo: { peak: null, preMedian: null, baselineShare: null, day7Share: null, decidedAt: null, week5Share: null, classCorrect: null },
    wikiArticle: null, attention: [], t0: iso(t0), t0Rule: 'vendor', t0PingId: null, t0RevisedAt: null, confirmedAt: iso(t0), firstSeenAt: iso(t0), sourceCount: 2, sources: ['vendor', 'hn'],
    waveN: 1, waveStartedAt: null, windowState: opts.windowState === undefined ? 'open' : opts.windowState, windowOpensAt: iso(t0), windowClosingAt: null, windowClosesAt: iso(t0 + 96 * H), windowChangedAt: null, windowReason: null, windowLog: [],
    clusterId: opts.clusterId ?? null, createdAt: iso(t0), updatedAt: iso(T.getTime()),
  });
}

export function cover(s: LabStore, eventId: string, postId: string, angle: LaunchAngle, opts: { breakout?: boolean; owned?: boolean; confidence?: 'high' | 'low'; confirmed?: boolean | null; ratio?: number } = {}) {
  const p = s.posts.get(postId)!;
  s.eventCoverage.upsert({ eventId, postId, sourceId: p.sourceId, platform: p.platform, isOwned: opts.owned ?? p.isOwned, postedAt: p.postedAt!, hoursSinceT0: 4, waveN: 1, wavePosition: 'first', creatorRank: 1, matchRule: 'name', confidence: opts.confidence ?? 'high', confirmed: opts.confirmed === undefined ? true : opts.confirmed, angle, angleSource: 'rule', ratio: opts.ratio ?? s.measures.get(postId)?.breakout ?? null, ratioAgeH: 24, isBreakout: opts.breakout ?? true, computedAt: iso(T.getTime()) });
}

/** Three tracked creators, one owned account, an open event; nothing covered yet. */
export function baseWorld(): LabStore {
  const s = emptyStore();
  for (const c of ['src-c1', 'src-c2', 'src-c3']) addSource(s, c);
  addSource(s, 'src-own', { kind: 'owned' });
  addEvent(s, 'ev1');
  return s;
}
