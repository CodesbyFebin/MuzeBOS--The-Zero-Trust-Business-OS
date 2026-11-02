/**
 * MOCKED HTTP LAYER: provider sends go to an in-test fake fetch. Webhook bodies are hand-built in Meta's documented shapes.
 * These prove gating, takeover, opt-out, handoff, follow-up and signed WhatsApp approvals. They do NOT prove a live send.
 */
import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { BusinessStore } from '@/lib/metabos/store';
import { decide, dispatch, propose } from '@/lib/metabos/dispatch/service';
import type { Fetch } from '@/lib/metabos/dispatch/adapters';
import { addMember } from '@/lib/metabos/biz/members';
import { addOptOut, getConversation } from '@/lib/metabos/talk/core';
import { draftFollowUp, followUpCandidates, ingest, listHandoffs, parseMetaWebhook, proposeReply, requestWhatsAppApproval, resume, scoreSentiment, setApproverPhone, closeHandoff, transcribeStatus } from '@/lib/metabos/talk/service';

const SECRET = 'x'.repeat(40);
const ENV = { MUZEBOS_WHATSAPP_CLOUD_ACCESS_TOKEN: 't', MUZEBOS_WHATSAPP_PHONE_NUMBER_ID: '1065', MUZEBOS_INSTAGRAM_ACCESS_TOKEN: 'ig', MUZEBOS_APPROVAL_SIGNING_SECRET: SECRET };
function fake() { const calls: { url: string; body: any }[] = []; const f: Fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { status: 200, ok: true, text: async () => JSON.stringify({ messages: [{ id: `wamid.${calls.length}` }], message_id: `mid.${calls.length}` }) }; }; return { calls, f }; }
const wa = (from: string, text: string, id: string = randomUUID(), ts = Math.floor(Date.now() / 1000)) => ({ entry: [{ changes: [{ value: { contacts: [{ wa_id: from, profile: { name: 'Asha' } }], messages: [{ id, from, timestamp: String(ts), type: 'text', text: { body: text } }] } }] }] });
const inbound = (s: BusinessStore, from: string, text: string, id?: string) => ingest(s, parseMetaWebhook('whatsapp', wa(from, text, id)), ENV);
const conv = (s: BusinessStore) => s.db.prepare('SELECT id FROM mb_conversations LIMIT 1').get() as { id: string };
const send = async (s: BusinessStore, d: { id: string; payloadHash: string }, f: Fetch) => { decide(s, 'owner', d.id, d.payloadHash, true); return dispatch(s, d.id, d.payloadHash, randomUUID(), { env: ENV, fetch: f }); };

describe('webhook ingest', () => {
  it('stores WhatsApp messages once per provider id and parses Instagram DMs', async () => {
    const s = new BusinessStore(':memory:');
    const r1 = await inbound(s, '919876543210', 'hello', 'wamid.A'); const r2 = await inbound(s, '919876543210', 'hello', 'wamid.A');
    expect(r1.stored).toBe(1); expect(r2.duplicates).toBe(1);
    const ig = parseMetaWebhook('instagram', { entry: [{ messaging: [{ sender: { id: '1784' }, recipient: { id: '9' }, timestamp: Date.now(), message: { mid: 'm1', text: 'hi' } }] }] });
    expect(ig[0]).toMatchObject({ channel: 'instagram', from: '1784', text: 'hi', echo: false });
  });
});

describe('human takeover', () => {
  it('pauses the copilot after a human-authored reply is sent and refuses copilot drafts until resumed', async () => {
    const s = new BusinessStore(':memory:'); const { f } = fake();
    await inbound(s, '919876543210', 'price?'); const c = conv(s);
    const d = proposeReply(s, { id: 'owner' }, c.id, { text: 'It is 499', author: 'human' });
    await send(s, d, f);
    expect(getConversation(s, c.id).aiPaused).toBe(1);
    expect(() => proposeReply(s, { id: 'owner' }, c.id, { text: 'x', author: 'copilot' })).toThrow(/paused/);
    resume(s, 'owner', c.id); expect(getConversation(s, c.id).aiPaused).toBe(0);
  });
  it('an Instagram echo from the IG app pauses the copilot', async () => {
    const s = new BusinessStore(':memory:');
    await ingest(s, parseMetaWebhook('instagram', { entry: [{ messaging: [{ sender: { id: '9' }, recipient: { id: '17841' }, timestamp: Date.now(), message: { mid: 'e1', text: 'on it', is_echo: true } }] }] }));
    expect(getConversation(s, conv(s).id).aiPaused).toBe(1);
  });
});

describe('opt-out registry', () => {
  it('STOP opts the sender out and dispatch refuses both propose and send', async () => {
    const s = new BusinessStore(':memory:'); const { calls, f } = fake();
    const d = propose(s, 'owner', 'whatsapp', { to: '+919876543210', body: 'offer' }); decide(s, 'owner', d.id, d.payloadHash, true);
    const r = await inbound(s, '919876543210', 'STOP'); expect(r.optOuts).toBe(1);
    await expect(dispatch(s, d.id, d.payloadHash, randomUUID(), { env: ENV, fetch: f })).rejects.toThrow(/opted out/);
    expect(() => propose(s, 'owner', 'whatsapp', { to: '+919876543210', body: 'again' })).toThrow(/opted out/);
    expect(calls).toHaveLength(0);
    addOptOut(s, 'email', 'A@B.com', 'asked', 'manual');
    expect(() => propose(s, 'owner', 'email', { to: 'a@b.com', subject: 's', body: 'b' })).toThrow(/opted out/);
  });
});

describe('sentiment -> handoff', () => {
  it('lexicon scores and escalation keywords open one handoff with a briefing card and pause the copilot', async () => {
    expect(scoreSentiment('thanks, great service').score).toBe(2);
    expect(scoreSentiment('I want a refund').escalate).toBe('refund');
    const s = new BusinessStore(':memory:');
    const r = await inbound(s, '919876543210', 'worst service, I want a refund'); expect(r.handoffs).toBe(1);
    await inbound(s, '919876543210', 'terrible');
    const h = listHandoffs(s); expect(h).toHaveLength(1);
    expect(h[0].briefing).toMatchObject({ contact: 'Asha', channel: 'whatsapp', trigger: 'Customer mentioned "refund"' });
    expect(h[0].briefing.lastMessages.length).toBeGreaterThan(0);
    expect(getConversation(s, h[0].conversationId)).toMatchObject({ status: 'handover', aiPaused: 1 });
    expect(() => resume(s, 'owner', h[0].conversationId)).toThrow(/handoff/);
    closeHandoff(s, 'owner', h[0].id, 'refunded', true); expect(getConversation(s, h[0].conversationId)).toMatchObject({ status: 'open', aiPaused: 0 });
  });
});

describe('follow-up gate', () => {
  it('needs silence after our last message, proposes once to Jev, and blocks outside 24h', async () => {
    const s = new BusinessStore(':memory:'); const { f } = fake();
    await inbound(s, '919876543210', 'send details'); const c = conv(s);
    await send(s, proposeReply(s, { id: 'owner' }, c.id, { text: 'Details attached', author: 'copilot' }), f);
    const later = Date.now() + 5 * 3_600_000;
    expect(followUpCandidates(s, 4)).toHaveLength(0);
    expect(followUpCandidates(s, 4, later)[0].blocked).toBeNull();
    const d = draftFollowUp(s, { id: 'owner' }, c.id, undefined, 4, later); expect(d.status).toBe('pending');
    expect(() => draftFollowUp(s, { id: 'owner' }, c.id, undefined, 4, later)).toThrow(/already waiting/);
    expect(followUpCandidates(s, 4, Date.now() + 30 * 3_600_000)[0].blocked).toMatch(/24-hour/);
  });
});

describe('voice notes', () => {
  it('reports Not connected without a key and the adapter refusal with one', async () => {
    expect(await transcribeStatus('m', {})).toBe('Not connected — add META_MODEL_API_KEY');
    expect(await transcribeStatus('m', { META_MODEL_API_KEY: 'k' })).toMatch(/^Not transcribed: Muse Voice is not qualified/);
  });
});

describe('approve Jev items from WhatsApp', () => {
  async function setup() {
    const s = new BusinessStore(':memory:'); const { calls, f } = fake();
    const mgr = addMember(s, 'owner', { name: 'Ravi', role: 'manager', department: 'operations' });
    setApproverPhone(s, 'owner', mgr.id, '+91 99999 00000');
    const target = propose(s, 'owner', 'whatsapp', { to: '+919876543210', body: 'Your refund is processed' });
    await requestWhatsAppApproval(s, { id: 'owner', role: 'owner' }, target.id, mgr.id, randomUUID(), { env: ENV, fetch: f });
    const code = /APPROVE ([A-Z2-7]{8})/.exec(calls[0].body.text.body)![1];
    return { s, mgr, target, code, calls };
  }
  const status = (s: BusinessStore, id: string) => (s.db.prepare('SELECT status FROM mb_dispatches WHERE id=?').get(id) as { status: string }).status;
  it('approves once from the registered number, bound to the payload hash', async () => {
    const { s, target, code, calls } = await setup();
    expect(calls[0].body.to).toBe('+919999900000');
    expect((await inbound(s, '919999900000', `APPROVE ${code}`)).approvals[0].outcome).toBe('approved');
    expect(status(s, target.id)).toBe('approved');
    expect((await inbound(s, '919999900000', `APPROVE ${code}`)).approvals[0].outcome).toBe('refused: code already used');
  });
  it('refuses a different number, expiry, a tampered signature and unknown codes', async () => {
    const { s, target, code } = await setup();
    expect((await inbound(s, '918888800000', `APPROVE ${code}`)).approvals[0].outcome).toMatch(/different number/);
    s.db.prepare('UPDATE mb_wa_approvals SET sig=? WHERE code=?').run('00'.repeat(32), code);
    expect((await inbound(s, '919999900000', `APPROVE ${code}`)).approvals[0].outcome).toMatch(/signature/);
    expect((await inbound(s, '919999900000', 'REJECT ZZZZZZZZ')).approvals[0].outcome).toMatch(/unknown/);
    expect(status(s, target.id)).toBe('pending');
    const second = await setup(); const spy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 16 * 60_000);
    try { expect((await inbound(second.s, '919999900000', `REJECT ${second.code}`)).approvals[0].outcome).toMatch(/expired/); } finally { spy.mockRestore(); }
  });
  it('is Not connected without a signing secret and refuses members without jev.decide', async () => {
    const s = new BusinessStore(':memory:'); const { f } = fake();
    const t = propose(s, 'owner', 'whatsapp', { to: '+919876543210', body: 'x' });
    await expect(requestWhatsAppApproval(s, { id: 'owner', role: 'owner' }, t.id, 'owner', randomUUID(), { env: {}, fetch: f })).rejects.toThrow(/Not connected/);
    const m = addMember(s, 'owner', { name: 'Sam', role: 'member', department: 'customers' });
    expect(() => setApproverPhone(s, 'owner', m.id, '919000000000')).toThrow(/cannot decide/);
  });
});

describe('[mocked HTTP] Instagram send', () => {
  it('posts the documented body to graph.instagram.com and enforces 1000 bytes', async () => {
    const s = new BusinessStore(':memory:'); const { calls, f } = fake();
    await send(s, propose(s, 'owner', 'instagram', { to: '1784100', body: 'hi' }), f);
    expect(calls[0]).toEqual({ url: 'https://graph.instagram.com/v25.0/me/messages', body: { recipient: { id: '1784100' }, message: { text: 'hi' } } });
    expect(() => propose(s, 'owner', 'instagram', { to: '1784100', body: 'é'.repeat(501) })).toThrow(/1000 bytes/);
  });
});
