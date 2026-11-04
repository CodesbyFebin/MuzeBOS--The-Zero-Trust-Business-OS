import { afterEach, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { BusinessStore } from '@/lib/metabos/store';
import { conversationFor } from '@/lib/metabos/talk/core';
import { metaBoardState, proposeLeadReply } from '@/lib/metabos/meta/integration';
import { decide, dispatch, listDispatches } from '@/lib/metabos/dispatch/service';
import { isMuseDispatch, museReview } from '@/lib/metabos/bos/muse-gate';
import { receiveWebhook } from '@/lib/metabos/webhooks';

const SECRET = 'unit-test-secret';
const sign = (b: string, k = SECRET) => 'sha256=' + createHmac('sha256', k).update(b).digest('hex');
const stores: BusinessStore[] = [];
const fresh = () => { const s = new BusinessStore(':memory:'); stores.push(s); return s; };
afterEach(() => { stores.splice(0).forEach((s) => s.close()); });
const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { messages: [{ id: 'wamid.p23' }] } }] }] });

describe('webhook signature', () => {
  it('401s a bad X-Hub-Signature-256 and stores nothing', () => {
    const s = fresh();
    expect(receiveWebhook(s, { source: 'whatsapp', raw: Buffer.from(body), signature: sign(body, 'wrong'), secret: SECRET })).toEqual({ status: 401, body: 'invalid_signature' });
    expect(metaBoardState(s, { META_APP_SECRET: SECRET }).webhooks).toMatchObject({ state: 'waiting', deliveries: 0, lastReceivedAt: null });
  });
  it('a signed delivery shows on the webhooks tile', () => {
    const s = fresh();
    expect(receiveWebhook(s, { source: 'whatsapp', raw: Buffer.from(body), signature: sign(body), secret: SECRET }).status).toBe(200);
    const w = metaBoardState(s, { META_APP_SECRET: SECRET }).webhooks;
    expect(w.state).toBe('receiving'); expect(w.deliveries).toBe(1); expect(w.lastReceivedAt).toBeTruthy();
  });
});

describe('board state empty and honest', () => {
  it('no tokens and no secret means empty / not configured, never connected', () => {
    const st = metaBoardState(fresh(), {});
    expect(st.graph).toMatchObject({ state: 'empty', oauthTokens: 0, envToken: false });
    expect(st.webhooks.state).toBe('not configured');
    expect(st.publish).toEqual({ dryRun: true, pending: 0, approved: 0, sent: 0 });
    expect(JSON.stringify(st)).not.toMatch(/secret|EAA/i);
  });
  it('an env token with default DRY_RUN reports dry run, not connected', () => {
    expect(metaBoardState(fresh(), { MUZEBOS_WHATSAPP_CLOUD_ACCESS_TOKEN: 'x' }).graph.state).toBe('dry run');
  });
});

describe('lead reply publish path', () => {
  it('needs two different reviewers, then /api/dispatch stays DRY_RUN with evidence', async () => {
    const s = fresh();
    const c = conversationFor(s, 'whatsapp', '+910000000001', 'Lead');
    const r = proposeLeadReply(s, 'owner', c.id, 'Thanks, we will call you');
    expect(r.review).toBe('two-reviewer'); expect(isMuseDispatch(s, r.dispatchId)).toBe(true);
    const d = listDispatches(s).find((x) => x.id === r.dispatchId)!;
    expect(() => decide(s, 'bypass', d.id, d.payloadHash, true)).toThrow(/two different reviewers/);
    expect(museReview(s, 'rev-a', { dispatchId: d.id, payloadHash: d.payloadHash, approve: true }).dispatch.status).toBe('pending');
    expect(() => museReview(s, 'rev-a', { dispatchId: d.id, payloadHash: d.payloadHash, approve: true })).toThrow(/second, different reviewer/);
    expect(museReview(s, 'rev-b', { dispatchId: d.id, payloadHash: d.payloadHash, approve: true }).dispatch.status).toBe('approved');
    let calls = 0; const f = (async () => { calls++; return new Response('{}'); }) as typeof fetch;
    await expect(dispatch(s, d.id, d.payloadHash, '7d0f6a3e-1b2c-4d5e-8f90-123456789abc', { env: { MUZEBOS_WHATSAPP_CLOUD_ACCESS_TOKEN: 'x', MUZEBOS_WHATSAPP_PHONE_NUMBER_ID: '1' }, fetch: f })).rejects.toThrow(/Dry run/);
    expect(calls).toBe(0);
    const acts = s.evidence().map((e) => e.action);
    for (const a of ['dispatch.proposed', 'dispatch.two-review.required', 'bos.review.signed', 'dispatch.approved', 'dispatch.dry-run']) expect(acts).toContain(a);
    expect(metaBoardState(s, {}).publish.approved).toBe(1);
  });
  it('one reject from either reviewer rejects the lead reply', () => {
    const s = fresh(); const c = conversationFor(s, 'whatsapp', '+910000000002', 'Lead');
    const r = proposeLeadReply(s, 'owner', c.id, 'Hi'); const d = listDispatches(s).find((x) => x.id === r.dispatchId)!;
    museReview(s, 'rev-a', { dispatchId: d.id, payloadHash: d.payloadHash, approve: true });
    expect(museReview(s, 'rev-b', { dispatchId: d.id, payloadHash: d.payloadHash, approve: false }).dispatch.status).toBe('rejected');
  });
});
