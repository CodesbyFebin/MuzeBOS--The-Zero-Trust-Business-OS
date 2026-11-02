/**
 * Social post queue (batch 3, idea from Open-Post, rebuilt clean during the event; no Open-Post code).
 * The AI or owner only drafts. Each post is proposed to Jev on its own; nothing publishes from here.
 * Channel drivers report "Not connected" until keys exist, and no verified publishing adapter is wired,
 * so an approved post waits as "approved" (send goes through Jev + /api/dispatch when an adapter lands).
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { BusinessStore } from '../store';
import { propose } from '../ai/jev';
import { WorkflowEngine } from '../workflows';

export const SOCIAL_CHANNELS = {
  bluesky: ['MUZEBOS_BLUESKY_HANDLE', 'MUZEBOS_BLUESKY_APP_PASSWORD'],
  linkedin: ['MUZEBOS_LINKEDIN_ACCESS_TOKEN'],
  x: ['MUZEBOS_X_ACCESS_TOKEN'],
  webhook: ['MUZEBOS_SOCIAL_WEBHOOK_URL'],
} as const;
export type SocialChannel = keyof typeof SOCIAL_CHANNELS;
export const PostInput = z.object({
  channel: z.enum(Object.keys(SOCIAL_CHANNELS) as [SocialChannel, ...SocialChannel[]]),
  body: z.string().trim().min(1).max(3000),
  scheduledFor: z.string().datetime(),
}).strict();
export type SocialPost = { id: string; channel: SocialChannel; body: string; scheduledFor: string; status: 'pending_jev' | 'approved' | 'rejected'; jevRunId: string; createdAt: string };

function ensure(s: BusinessStore) {
  s.db.exec("CREATE TABLE IF NOT EXISTS mb_social_posts(id TEXT PRIMARY KEY, channel TEXT NOT NULL, body TEXT NOT NULL, scheduledFor TEXT NOT NULL, jevRunId TEXT NOT NULL, createdBy TEXT NOT NULL, createdAt TEXT NOT NULL)");
}
export function channelStatus(env: Record<string, string | undefined> = process.env) {
  return (Object.keys(SOCIAL_CHANNELS) as SocialChannel[]).map((c) => {
    const missing = SOCIAL_CHANNELS[c].filter((k) => !env[k]);
    return { channel: c, connected: false, status: missing.length ? `Not connected — add ${missing.join(', ')}` : 'Keys present; no verified publishing adapter yet, so nothing is sent' };
  });
}
/** Queue drafts: one Jev proposal per post. Returns the stored posts. Never publishes. */
export function queuePosts(s: BusinessStore, actor: string, raw: unknown[]): SocialPost[] {
  ensure(s);
  const posts = raw.map((r) => PostInput.parse(r));
  return posts.map((p) => {
    const id = `post_${randomUUID().slice(0, 12)}`;
    const run = propose(s, { taskId: `social-${id}`, role: 'writer', tool: 'reminders.create', args: { title: `Approve ${p.channel} post ${id} for ${p.scheduledFor.slice(0, 16)}: ${p.body.slice(0, 80)}` }, rationale: 'Social post draft; per-post Jev approval', source: 'rule', model: null });
    s.transact(() => { s.db.prepare('INSERT INTO mb_social_posts VALUES(?,?,?,?,?,?,?)').run(id, p.channel, p.body, p.scheduledFor, run.id, actor, new Date().toISOString()); s.appendEvidence('social.post.queued', id, `Jev ${run.id}; not published`); });
    return post(s, id);
  });
}
function post(s: BusinessStore, id: string): SocialPost {
  const r = s.db.prepare('SELECT * FROM mb_social_posts WHERE id=?').get(id) as Omit<SocialPost, 'status'>;
  const st = new WorkflowEngine(s).run(r.jevRunId).status;
  return { ...r, status: st === 'awaiting_approval' ? 'pending_jev' : st === 'cancelled' || st === 'failed' || st === 'timed_out' ? 'rejected' : 'approved' };
}
export function listPosts(s: BusinessStore): SocialPost[] {
  ensure(s); return (s.db.prepare('SELECT id FROM mb_social_posts ORDER BY scheduledFor').all() as { id: string }[]).map((r) => post(s, r.id));
}
