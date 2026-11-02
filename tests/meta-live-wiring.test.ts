/**
 * MOCKED HTTP LAYER: every Graph call goes to an in-test fake fetch. These prove request shape,
 * DRY_RUN default, Jev gating and parsing. They do NOT prove a live send to Meta.
 * Shapes ported from the owner's MeTaPen agent (muze-agentverse 6acfff7).
 */
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { BusinessStore } from '@/lib/metabos/store';
import { decide, dispatch, propose } from '@/lib/metabos/dispatch/service';
import type { Fetch } from '@/lib/metabos/dispatch/adapters';
import { metaDryRun, GRAPH_VERSION } from '@/lib/metabos/meta/graph';
import { liveWiring, metaOverview } from '@/lib/metabos/meta/integration';
import { parseLeadgen, parseMetaWebhook } from '@/lib/metabos/talk/service';
import { demoStatus, realLead } from '@/lib/metabos/demo/judge';

type Call = { url: string; headers: Record<string, string>; body: any };
function fake(responses: unknown[]) { const calls: Call[] = []; let i = 0;
  const f: Fetch = async (url, init) => { calls.push({ url, headers: init.headers, body: JSON.parse(init.body) }); const r = responses[Math.min(i++, responses.length - 1)]; return { status: 200, ok: true, text: async () => JSON.stringify(r) }; };
  return { calls, f }; }
const PAGE = { MUZEBOS_META_PAGE_ID: '1000000001', MUZEBOS_META_PAGE_ACCESS_TOKEN: 'page-token', MUZEBOS_IG_USER_ID: '1789000000' };
const LIVE = { ...PAGE, MUZEBOS_META_DRY_RUN: '0' };
const approved = (s: BusinessStore, channel: Parameters<typeof propose>[2], payload: unknown) => { const d = propose(s, 'm1', channel, payload); return decide(s, 'owner', d.id, d.payloadHash, true); };
const ev = (s: BusinessStore, id: string) => (s.db.prepare('SELECT action FROM mb_audit WHERE target=?').all(id) as { action: string }[]).map((e) => e.action);

describe('DRY_RUN default', () => {
  it('is on unless MUZEBOS_META_DRY_RUN is exactly 0', () => {
    expect(metaDryRun({})).toBe(true); expect(metaDryRun({ MUZEBOS_META_DRY_RUN: 'false' })).toBe(true); expect(metaDryRun({ MUZEBOS_META_DRY_RUN: '0' })).toBe(false);
    expect(GRAPH_VERSION).toMatch(/^v\d{2}\.0$/);
  });
  it('an approved Page post makes no network call, records dispatch.dry-run and stays approved', async () => {
    const s = new BusinessStore(':memory:'); const { calls, f } = fake([{ id: 'x' }]);
    const d = approved(s, 'page-post', { message: 'Open Sunday 10-4' });
    await expect(dispatch(s, d.id, d.payloadHash, randomUUID(), { env: PAGE, fetch: f })).rejects.toThrow(/Dry run/);
    expect(calls).toHaveLength(0); expect(ev(s, d.id)).toContain('dispatch.dry-run');
    expect((s.db.prepare('SELECT status FROM mb_dispatches WHERE id=?').get(d.id) as { status: string }).status).toBe('approved'); s.close();
  });
  it('says Not connected (not dry run) when env is missing', async () => {
    const s = new BusinessStore(':memory:'); const d = approved(s, 'messenger', { to: '24000000001', body: 'Hi' });
    await expect(dispatch(s, d.id, d.payloadHash, randomUUID(), { env: {}, fetch: fake([{}]).f })).rejects.toThrow(/Not connected — add MUZEBOS_META_PAGE_ID/); s.close();
  });
  it('a pending (unapproved) post is refused before anything else', async () => {
    const s = new BusinessStore(':memory:'); const d = propose(s, 'm1', 'page-post', { message: 'x' });
    await expect(dispatch(s, d.id, d.payloadHash, randomUUID(), { env: LIVE, fetch: fake([{}]).f })).rejects.toThrow(/Needs Jev approval/); s.close();
  });
});

describe('[mocked HTTP] Page / Messenger / IG publish with DRY_RUN off', () => {
  it('Page post goes to /{page-id}/feed with the Page token', async () => {
    const s = new BusinessStore(':memory:'); const { calls, f } = fake([{ id: '1000000001_55' }]);
    const d = approved(s, 'page-post', { message: 'Open Sunday', link: 'https://example.com' });
    const out = await dispatch(s, d.id, d.payloadHash, randomUUID(), { env: LIVE, fetch: f });
    expect(calls[0].url).toBe(`https://graph.facebook.com/${GRAPH_VERSION}/1000000001/feed`);
    expect(calls[0].headers.authorization).toBe('Bearer page-token'); expect(calls[0].body).toEqual({ message: 'Open Sunday', link: 'https://example.com' });
    expect(out.status).toBe('sent'); expect(out.providerRef).toBe('1000000001_55'); s.close();
  });
  it('Messenger reply uses messaging_type RESPONSE', async () => {
    const s = new BusinessStore(':memory:'); const { calls, f } = fake([{ recipient_id: '24000000001', message_id: 'm_1' }]);
    const d = approved(s, 'messenger', { to: '24000000001', body: 'Yes, we deliver' });
    const out = await dispatch(s, d.id, d.payloadHash, randomUUID(), { env: LIVE, fetch: f });
    expect(calls[0].url).toBe(`https://graph.facebook.com/${GRAPH_VERSION}/1000000001/messages`);
    expect(calls[0].body).toEqual({ recipient: { id: '24000000001' }, messaging_type: 'RESPONSE', message: { text: 'Yes, we deliver' } });
    expect(out.providerRef).toBe('m_1'); s.close();
  });
  it('IG publish creates a container then publishes it', async () => {
    const s = new BusinessStore(':memory:'); const { calls, f } = fake([{ id: 'c_9' }, { id: 'media_7' }]);
    const d = approved(s, 'ig-publish', { imageUrl: 'https://example.com/a.jpg', caption: 'New stock' });
    const out = await dispatch(s, d.id, d.payloadHash, randomUUID(), { env: LIVE, fetch: f });
    expect(calls.map((c) => c.url)).toEqual([`https://graph.facebook.com/${GRAPH_VERSION}/1789000000/media`, `https://graph.facebook.com/${GRAPH_VERSION}/1789000000/media_publish`]);
    expect(calls[1].body).toEqual({ creation_id: 'c_9' }); expect(out.status).toBe('sent'); expect(out.providerRef).toBe('media_7'); s.close();
  });
  it('rejects a non-https image URL at propose time', () => {
    const s = new BusinessStore(':memory:'); expect(() => propose(s, 'm1', 'ig-publish', { imageUrl: 'http://example.com/a.jpg' })).toThrow(); s.close();
  });
});

describe('status and webhooks', () => {
  it('liveWiring says Not configured with no env and lists missing names only', () => {
    const w = liveWiring({}); expect(w.dryRun).toBe(true);
    for (const c of w.channels) { expect(c.state).toBe('Not configured'); expect(c.missing.length).toBeGreaterThan(0); }
    expect(JSON.stringify(liveWiring(PAGE))).not.toContain('page-token');
    expect(liveWiring(PAGE).channels.find((c) => c.channel === 'page-post')!.state).toBe('Configured · dry run');
    const s = new BusinessStore(':memory:'); expect(metaOverview(s, {}).live.channels).toHaveLength(5); s.close();
  });
  it('parses Messenger DMs (skipping echoes) and Lead Ads ids', () => {
    const body = { object: 'page', entry: [{ messaging: [{ sender: { id: '2400' }, recipient: { id: '1000' }, timestamp: 1767225600000, message: { mid: 'mid.1', text: 'price?' } }, { sender: { id: '1000' }, message: { mid: 'mid.2', text: 'x', is_echo: true } }],
      changes: [{ field: 'leadgen', value: { leadgen_id: '444', form_id: '555', page_id: '1000' } }] }] };
    const m = parseMetaWebhook('messenger', body); expect(m).toHaveLength(1); expect(m[0]).toMatchObject({ channel: 'messenger', from: '2400', externalId: 'mid.1', text: 'price?' });
    expect(parseLeadgen(body)).toEqual([{ leadgenId: '444', formId: '555', pageId: '1000' }]);
  });
  it('demo realLead refuses when no real message exists and reports dry run', () => {
    const s = new BusinessStore(':memory:'); expect(() => realLead(s)).toThrow(/No real WhatsApp message/);
    expect(demoStatus(s, {}).dryRun).toMatch(/DRY_RUN on/); s.close();
  });
});
