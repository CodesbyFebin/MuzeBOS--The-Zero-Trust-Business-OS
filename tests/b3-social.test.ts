/** Batch 3 social queue: per-post Jev, nothing published, channels Not connected. */
import { afterEach, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BusinessStore } from '@/lib/metabos/store';
import { channelStatus, listPosts, queuePosts } from '@/lib/metabos/b3/social';
import { queue } from '@/lib/metabos/ai/jev';
const ss: BusinessStore[] = []; const fresh = () => { const s = new BusinessStore(':memory:'); ss.push(s); return s; };
afterEach(() => ss.splice(0).forEach((s) => s.db.close()));
it('empty queue is empty', () => { expect(listPosts(fresh())).toEqual([]); });
it('each post gets its own pending Jev run', () => {
  const s = fresh(); const at = '2026-11-02T04:30:00.000Z';
  const p = queuePosts(s, 'owner', [{ channel: 'linkedin', body: 'We open at 8', scheduledFor: at }, { channel: 'x', body: 'New menu', scheduledFor: at }]);
  expect(p.map((x) => x.status)).toEqual(['pending_jev', 'pending_jev']);
  expect(new Set(p.map((x) => x.jevRunId)).size).toBe(2);
  expect(queue(s).filter((r) => r.status === 'awaiting_approval')).toHaveLength(2);
});
it('rejects bad input before Jev', () => { const s = fresh(); expect(() => queuePosts(s, 'o', [{ channel: 'myspace', body: 'x', scheduledFor: 'now' }])).toThrow(); expect(queue(s)).toHaveLength(0); });
it('channels are Not connected without keys', () => { expect(channelStatus({}).every((c) => c.status.startsWith('Not connected') && !c.connected)).toBe(true); });
it('module has no publish/dispatch path', () => { expect(readFileSync('lib/metabos/b3/social.ts', 'utf8')).not.toMatch(/fetch\(|from '.*dispatch|\.approve\(/); });
