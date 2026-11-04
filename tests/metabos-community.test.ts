import { describe, expect, it } from 'vitest';
import { BusinessStore } from '@/lib/metabos/store';
import * as cs from '@/lib/metabos/community/store';
import { museReview, isMuseDispatch } from '@/lib/metabos/bos/muse-gate';
import { dispatch } from '@/lib/metabos/dispatch/service';
import type { Member } from '@/lib/metabos/biz/members';
const mk = (id: string, role: Member['role']): Member => ({ id, name: id, role, department: 'operations' as Member['department'], createdAt: '' });
const owner = mk('olive', 'owner'), mgr = mk('manu', 'manager'), mem = mk('mira', 'member');
const setup = () => { const s = new BusinessStore(':memory:'); const sv = cs.createServer(s, owner, { name: 'Shop' }); return { s, sv,
  text: cs.createChannel(s, owner, { serverId: sv.id, name: 'general' }), forum: cs.createChannel(s, mgr, { serverId: sv.id, name: 'ideas', kind: 'forum' }), ann: cs.createChannel(s, owner, { serverId: sv.id, name: 'news', kind: 'announcement' }) }; };
describe('community server', () => {
  it('maps roles and limits server/channel creation to staff', () => {
    expect([owner, mgr, mem].map(cs.roleOf)).toEqual(['admin', 'moderator', 'guest']);
    const { s, sv } = setup();
    expect(() => cs.createServer(s, mem, { name: 'x' })).toThrow(/owners and managers/);
    expect(() => cs.createChannel(s, mem, { serverId: sv.id, name: 'x' })).toThrow(/owners and managers/);
    expect(() => cs.createChannel(s, owner, { serverId: sv.id, name: 'general' })).toThrow(/already exists/);
  });
  it('empty store has no servers', () => { const s = new BusinessStore(':memory:'); expect(cs.snapshot(s).servers).toEqual([]); expect(cs.communityVersion(s)).toBe(0); });
  it('forum needs threads, announcements are staff-only, version bumps', () => {
    const { s, text, forum, ann } = setup(); const v = cs.communityVersion(s);
    expect(() => cs.post(s, mem, { channelId: forum.id, body: 'hi' })).toThrow(/inside a thread/);
    expect(() => cs.post(s, mem, { channelId: ann.id, body: 'hi' })).toThrow(/announcement/);
    cs.post(s, owner, { channelId: ann.id, body: 'sale' });
    const t = cs.createThread(s, mem, { channelId: forum.id, title: 'Idea', body: 'first' });
    cs.post(s, mgr, { channelId: forum.id, threadId: t.id, body: 'reply' });
    expect(() => cs.post(s, mem, { channelId: text.id, threadId: t.id, body: 'x' })).toThrow(/not in this channel/);
    const snap = cs.snapshot(s, forum.id, t.id); expect(snap.messages.map((m) => m.body)).toEqual(['first', 'reply']);
    expect(cs.snapshot(s, forum.id).threads[0]).toMatchObject({ title: 'Idea', replies: 2 });
    expect(cs.communityVersion(s)).toBeGreaterThan(v);
  });
  it('edit own only; delete by author or staff (soft)', () => {
    const { s, text } = setup(); const m = cs.post(s, mem, { channelId: text.id, body: 'hello' });
    expect(() => cs.edit(s, owner, { id: m.id, body: 'x' })).toThrow(/own messages/);
    expect(cs.edit(s, mem, { id: m.id, body: 'hello!' }).editedAt).toBeTruthy();
    const o = cs.post(s, owner, { channelId: text.id, body: 'mine' });
    expect(() => cs.remove(s, mem, { id: o.id })).toThrow(/author/);
    cs.remove(s, mgr, { id: m.id });
    expect(cs.snapshot(s, text.id).messages.find((x) => x.id === m.id)!.body).toBe('This message has been deleted.');
  });
  it('uses member IDs even when display names match or change', () => {
    const { s, text } = setup();
    const author = { ...mem, name: 'Same name' };
    const other = { ...mem, id: 'other-member', name: 'Same name' };
    const m = cs.post(s, author, { channelId: text.id, body: 'private authorship' });
    expect(() => cs.edit(s, other, { id: m.id, body: 'stolen' })).toThrow(/own messages/);
    expect(() => cs.remove(s, other, { id: m.id })).toThrow(/author/);
    expect(cs.edit(s, { ...author, name: 'Renamed' }, { id: m.id, body: 'mine' }).body).toBe('mine');
  });
  it('members cannot open announcement threads', () => {
    const { s, ann } = setup();
    expect(() => cs.createThread(s, mem, { channelId: ann.id, title: 'Bypass', body: 'x' })).toThrow(/announcement/);
  });
  it('agent posts carry the agent role and record who posted them', () => {
    const { s, text } = setup(); const m = cs.agentPost(s, owner, { channelId: text.id, body: 'Stock low', agent: 'Ledger' });
    expect(m).toMatchObject({ authorKind: 'agent', role: 'agent', author: 'Ledger' });
    const ev = s.evidence().find((e) => e.action === 'community.agent.post')!; expect(JSON.stringify(ev)).toContain('olive');
  });
  it('Meta send: internal marker dispatch, one reviewer cannot approve, two can, dispatch is dry run', async () => {
    const env = { MUZEBOS_WHATSAPP_CLOUD_ACCESS_TOKEN: 'test-only', MUZEBOS_WHATSAPP_PHONE_NUMBER_ID: '1' };
    const { s, text } = setup(); const m = cs.post(s, mem, { channelId: text.id, body: 'Order ready' });
    const { dispatch: d, note } = cs.proposeMeta(s, mem, { messageId: m.id, channel: 'whatsapp', to: '+919999999999' });
    expect(d.payload).toEqual({ to: '+919999999999', body: 'Order ready' }); expect(d.marker).toBe('muse'); expect(d.status).toBe('pending'); expect(isMuseDispatch(s, d.id)).toBe(true); expect(note).toMatchObject({ authorKind: 'system', dispatchId: d.id });
    expect(museReview(s, 'olive', { dispatchId: d.id, payloadHash: d.payloadHash, approve: true }).dispatch.status).toBe('pending');
    expect(() => museReview(s, 'olive', { dispatchId: d.id, payloadHash: d.payloadHash, approve: true })).toThrow(/different reviewer/);
    expect(museReview(s, 'manu', { dispatchId: d.id, payloadHash: d.payloadHash, approve: true }).dispatch.status).toBe('approved');
    let called = false;
    await expect(dispatch(s, d.id, d.payloadHash, crypto.randomUUID(), { env, fetch: async () => { called = true; return new Response('{}'); } })).rejects.toThrow(/Dry run/);
    expect(called).toBe(false);
    const acts = s.evidence().map((e) => e.action);
    expect(acts).toEqual(expect.arrayContaining(['community.server.create', 'community.channel.create', 'community.message.post', 'community.meta.proposed', 'dispatch.proposed', 'dispatch.dry-run']));
    expect(s.verifyAudit()).toBeTruthy();
  });
});
