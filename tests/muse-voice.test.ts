import { describe, expect, it } from 'vitest';
import { routeMuseVoice, spokenFor } from '@/lib/metabos/muse/voice';
import { BusinessStore } from '@/lib/metabos/store';
import { decide, dispatch, propose } from '@/lib/metabos/dispatch/service';
import { isMuseDispatch, museReview } from '@/lib/metabos/bos/muse-gate';
import { sanctumReceipts } from '@/lib/metabos/bos/core';
describe('MUSE voice command routing', () => {
  it('local fur commands stay in the browser', () => {
    expect(routeMuseVoice('Boop MuZe')).toEqual({ kind: 'local', command: { kind: 'boop' } });
    expect(routeMuseVoice('flip my coat').kind).toBe('local');
  });
  it('navigation opens a Business Open Server view', () => {
    expect(routeMuseVoice('Open trust stack')).toEqual({ kind: 'view', view: 'trust' });
    expect(routeMuseVoice('show the MCP directory')).toEqual({ kind: 'view', view: 'mcp' });
  });
  it('send-like commands become a send route; instagram picked when named', () => {
    expect(routeMuseVoice('Tell the customer their order is ready')).toMatchObject({ kind: 'send', channel: 'whatsapp' });
    expect(routeMuseVoice('send an instagram dm saying thanks')).toMatchObject({ kind: 'send', channel: 'instagram' });
  });
  it('everything else is a question for the model; blank is empty', () => {
    expect(routeMuseVoice('What is waiting for approval?').kind).toBe('ask');
    expect(routeMuseVoice('   ').kind).toBe('empty');
  });
  it('never invents a reply when no model answered', () => {
    expect(spokenFor({ kind: 'ask', text: 'x' }, null)).toBe('Model not configured. No reply was generated.');
  });
});
describe('MUSE send approval gate', () => {
  const env = { MUZEBOS_WHATSAPP_CLOUD_ACCESS_TOKEN: 'test-only', MUZEBOS_WHATSAPP_PHONE_NUMBER_ID: '1' };
  it('needs two different reviewers before dispatch, and DRY_RUN still blocks the provider', async () => {
    const s = new BusinessStore(':memory:');
    const d = propose(s, 'owner', 'whatsapp', { to: '+919999999999', body: '[MUSE plan] order ready' });
    expect(isMuseDispatch(s, d.id)).toBe(true);
    const a = museReview(s, 'alice', { dispatchId: d.id, payloadHash: d.payloadHash, approve: true });
    expect(a.dispatch.status).toBe('pending'); expect(a.reviewers).toEqual(['alice']);
    expect(() => museReview(s, 'alice', { dispatchId: d.id, payloadHash: d.payloadHash, approve: true })).toThrow(/different reviewer/);
    await expect(dispatch(s, d.id, d.payloadHash, crypto.randomUUID(), { env, fetch: async () => new Response('{}') })).rejects.toThrow();
    const b = museReview(s, 'bob', { dispatchId: d.id, payloadHash: d.payloadHash, approve: true });
    expect(b.dispatch.status).toBe('approved');
    let called = false;
    await expect(dispatch(s, d.id, d.payloadHash, crypto.randomUUID(), { env, fetch: async () => { called = true; return new Response('{}'); } })).rejects.toThrow(/Dry run/);
    expect(called).toBe(false);
    const acts = sanctumReceipts(s, env).evidence.map((e) => e.action);
    expect(acts).toEqual(expect.arrayContaining(['dispatch.proposed', 'bos.review.signed', 'dispatch.approved', 'dispatch.dry-run']));
    expect(acts.filter((x) => x === 'bos.review.signed')).toHaveLength(2);
  });
  it('a reject from either reviewer rejects the send; non-MUSE dispatches are refused', () => {
    const s = new BusinessStore(':memory:');
    const d = propose(s, 'owner', 'whatsapp', { to: '+919999999999', body: '[MUSE plan] hi' });
    expect(museReview(s, 'alice', { dispatchId: d.id, payloadHash: d.payloadHash, approve: false }).dispatch.status).toBe('rejected');
    const o = propose(s, 'owner', 'whatsapp', { to: '+919999999999', body: 'plain' });
    expect(isMuseDispatch(s, o.id)).toBe(false);
    expect(() => museReview(s, 'alice', { dispatchId: o.id, payloadHash: o.payloadHash, approve: true })).toThrow(/Not a MUSE/);
    expect(decide(s, 'owner', o.id, o.payloadHash, true).status).toBe('approved');
  });
});
