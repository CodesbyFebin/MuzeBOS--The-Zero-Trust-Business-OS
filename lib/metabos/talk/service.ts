/**
 * Talk copilot: inbound ingest from signed Meta webhooks, lexicon sentiment -> human handoff with a briefing
 * card, follow-up gate, quick-reply drafts, voice-note transcription through Muse Voice, and WhatsApp replies
 * that decide Jev items. The copilot only drafts: every outbound message is a dispatch proposal that needs Jev.
 * Clean-room implementations of patterns from open-bsp-api (Unlicense), DeskcommCRM (MIT) and oc8 (LGPL, pattern-only).
 */
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { BusinessError, type BusinessStore } from '../store';
import { metaKey, metaTranscribe } from '../ai/meta';
import { can } from '../biz/accounts';
import { listMembers } from '../biz/members';
import { decide, propose, dispatch, type Dispatch } from '../dispatch/service';
import type { Deps } from '../dispatch/adapters';
import { addOptOut, conversationFor, ensureTalk, getConversation, linkDispatch, optOutOf, pauseCopilot, type Conversation, type Message, type TalkChannel } from './core';

type Env = Record<string, string | undefined>;
const iso = (ms = Date.now()) => new Date(ms).toISOString();
const HOUR = 3_600_000;

// ---------- Sentiment (lexicon rule, not a model) ----------
const POS = ['thanks', 'thank you', 'great', 'awesome', 'love', 'perfect', 'happy', 'good', 'excellent', 'dhanyavad', 'shukriya', 'super', 'nice'];
const NEG = ['bad', 'worst', 'terrible', 'angry', 'late', 'delay', 'broken', 'damaged', 'useless', 'disappointed', 'fraud', 'cheat', 'scam', 'horrible', 'bakwas', 'pathetic', 'not working', 'never again'];
const ESCALATE = ['refund', 'complaint', 'consumer court', 'lawyer', 'legal', 'police', 'chargeback', 'cancel my order', 'speak to a human', 'talk to a human', 'manager'];
export function scoreSentiment(text: string): { score: number; escalate: string | null } {
  const t = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ')} `;
  const has = (w: string) => t.includes(` ${w} `);
  const score = POS.filter(has).length - NEG.filter(has).length;
  return { score, escalate: ESCALATE.find(has) ?? null };
}
export const HANDOFF_THRESHOLD = -2;

// ---------- Handoffs with a briefing card ----------
export type Handoff = { id: string; conversationId: string; reason: string; briefing: Briefing; status: 'waiting' | 'taken' | 'closed'; assigneeId: string | null; resolution: string | null; createdAt: string; closedAt: string | null };
export type Briefing = { contact: string; channel: string; trigger: string; sentimentTotal: number; lastMessages: { author: string; body: string; at: string }[]; openInvoices: { number: string; total: number }[]; ask: string };
function ensureHandoffs(s: BusinessStore) {
  ensureTalk(s);
  s.db.exec(`CREATE TABLE IF NOT EXISTS mb_handoffs(id TEXT PRIMARY KEY, conversationId TEXT NOT NULL, reason TEXT NOT NULL, briefing TEXT NOT NULL, status TEXT NOT NULL, assigneeId TEXT, resolution TEXT, createdAt TEXT NOT NULL, closedAt TEXT);
    CREATE TABLE IF NOT EXISTS mb_approver_phones(memberId TEXT PRIMARY KEY, phone TEXT NOT NULL UNIQUE, createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mb_wa_approvals(code TEXT PRIMARY KEY, dispatchId TEXT NOT NULL, payloadHash TEXT NOT NULL, approverId TEXT NOT NULL, phone TEXT NOT NULL, expiresAt INTEGER NOT NULL, sig TEXT NOT NULL, usedAt TEXT, outcome TEXT, createdAt TEXT NOT NULL);`);
}
const messagesOf = (s: BusinessStore, id: string, limit = 200) => (s.db.prepare('SELECT * FROM (SELECT *, rowid AS seq FROM mb_messages WHERE conversationId=? ORDER BY at DESC, rowid DESC LIMIT ?) ORDER BY at, seq').all(id, limit) as Message[]);
function briefingFor(s: BusinessStore, c: Conversation, trigger: string): Briefing {
  const last = messagesOf(s, c.id, 6);
  const name = c.name ?? c.address;
  const open = c.channel === 'email' ? s.invoices().filter((i) => i.payment === 'pending' && i.payload.customer.email.toLowerCase() === c.address) : [];
  const lastIn = [...last].reverse().find((m) => m.direction === 'in');
  return { contact: name, channel: c.channel, trigger, sentimentTotal: c.sentiment, lastMessages: last.map((m) => ({ author: m.author, body: m.body.slice(0, 280), at: m.at })), openInvoices: open.map((i) => ({ number: i.number, total: i.payload.total })), ask: lastIn ? lastIn.body.slice(0, 280) : 'No inbound message yet' };
}
export function openHandoff(s: BusinessStore, conversationId: string, reason: string): Handoff {
  ensureHandoffs(s); const c = getConversation(s, conversationId);
  const existing = s.db.prepare("SELECT id FROM mb_handoffs WHERE conversationId=? AND status!='closed'").get(c.id) as { id: string } | undefined;
  if (existing) return handoff(s, existing.id);
  const id = randomUUID();
  s.transact(() => {
    s.db.prepare("INSERT INTO mb_handoffs(id,conversationId,reason,briefing,status,createdAt) VALUES(?,?,?,?,'waiting',?)").run(id, c.id, reason, JSON.stringify(briefingFor(s, c, reason)), iso());
    s.db.prepare("UPDATE mb_conversations SET status='handover', updatedAt=? WHERE id=?").run(iso(), c.id);
    pauseCopilot(s, c.id, `Handed to a human: ${reason}`);
    s.appendEvidence('talk.handoff-opened', id, `Conversation ${c.id.slice(0, 8)} handed to a human: ${reason}`);
  });
  return handoff(s, id);
}
function handoff(s: BusinessStore, id: string): Handoff {
  const r = s.db.prepare('SELECT * FROM mb_handoffs WHERE id=?').get(id) as (Omit<Handoff, 'briefing'> & { briefing: string }) | undefined;
  if (!r) throw new BusinessError('Handoff not found', 404); return { ...r, briefing: JSON.parse(r.briefing) };
}
export function listHandoffs(s: BusinessStore): Handoff[] { ensureHandoffs(s); return (s.db.prepare('SELECT id FROM mb_handoffs ORDER BY createdAt DESC LIMIT 200').all() as { id: string }[]).map((r) => handoff(s, r.id)); }
export function takeHandoff(s: BusinessStore, memberId: string, id: string) {
  ensureHandoffs(s); const r = s.db.prepare("UPDATE mb_handoffs SET status='taken', assigneeId=? WHERE id=? AND status='waiting'").run(memberId, id);
  if (!r.changes) throw new BusinessError('Handoff is not waiting', 409);
  s.appendEvidence('talk.handoff-taken', id, `Taken by ${memberId}`); return handoff(s, id);
}
export function closeHandoff(s: BusinessStore, memberId: string, id: string, resolution: string, resumeCopilot: boolean) {
  ensureHandoffs(s); const h = handoff(s, id); if (h.status === 'closed') throw new BusinessError('Handoff already closed', 409);
  s.transact(() => {
    s.db.prepare("UPDATE mb_handoffs SET status='closed', resolution=?, closedAt=?, assigneeId=COALESCE(assigneeId, ?) WHERE id=?").run(resolution.slice(0, 1000), iso(), memberId, id);
    s.db.prepare("UPDATE mb_conversations SET status='open', updatedAt=? WHERE id=?").run(iso(), h.conversationId);
    if (resumeCopilot) resume(s, memberId, h.conversationId);
    s.appendEvidence('talk.handoff-closed', id, `Closed by ${memberId}: ${resolution.slice(0, 120)}`);
  });
  return handoff(s, id);
}
export function resume(s: BusinessStore, memberId: string, conversationId: string) {
  const c = getConversation(s, conversationId);
  if (c.status === 'handover') throw new BusinessError('Close the open handoff before resuming the copilot', 409);
  s.db.prepare('UPDATE mb_conversations SET aiPaused=0, pausedReason=NULL, updatedAt=? WHERE id=?').run(iso(), c.id);
  s.appendEvidence('talk.copilot-resumed', c.id, `Copilot resumed by ${memberId}`);
}

// ---------- Inbound ingest ----------
export type Inbound = { channel: TalkChannel; from: string; name?: string | null; externalId: string; kind: string; text: string; mediaId?: string | null; at: string; echo?: boolean };
/** Pull messages out of a verified Meta webhook body (WhatsApp Cloud and Instagram messaging shapes). */
export function parseMetaWebhook(source: string, body: any): Inbound[] {
  const out: Inbound[] = [];
  for (const e of Array.isArray(body?.entry) ? body.entry : []) {
    if (source === 'whatsapp') for (const ch of Array.isArray(e?.changes) ? e.changes : []) {
      const v = ch?.value ?? {}; const names = new Map<string, string>((v.contacts ?? []).map((c: any) => [String(c.wa_id), String(c.profile?.name ?? '')]));
      for (const m of Array.isArray(v.messages) ? v.messages : []) {
        if (!m?.id || !m?.from) continue;
        const kind = String(m.type ?? 'text');
        const text = kind === 'text' ? String(m.text?.body ?? '') : kind === 'button' ? String(m.button?.text ?? '') : kind === 'interactive' ? String(m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? '') : String(m[kind]?.caption ?? '');
        out.push({ channel: 'whatsapp', from: String(m.from), name: names.get(String(m.from)) || null, externalId: String(m.id), kind, text, mediaId: m[kind]?.id ? String(m[kind].id) : null, at: m.timestamp ? iso(Number(m.timestamp) * 1000) : iso() });
      }
    }
    if (source === 'instagram') for (const m of Array.isArray(e?.messaging) ? e.messaging : []) {
      const msg = m?.message; if (!msg?.mid) continue;
      const echo = Boolean(msg.is_echo); const att = Array.isArray(msg.attachments) ? msg.attachments[0] : null;
      out.push({ channel: 'instagram', from: String(echo ? m.recipient?.id : m.sender?.id), externalId: String(msg.mid), kind: att ? String(att.type ?? 'attachment') : 'text', text: String(msg.text ?? ''), mediaId: att?.payload?.url ? String(att.payload.url) : null, at: m.timestamp ? iso(Number(m.timestamp)) : iso(), echo });
    }
  }
  return out;
}
const STOP = /^\s*(stop|unsubscribe|opt ?out|band karo|cancel messages)\s*$/i;
const APPROVAL = /^\s*(approve|reject)\s+([A-Z2-7]{8})\s*$/i;
export type IngestResult = { stored: number; duplicates: number; optOuts: number; handoffs: number; approvals: { code: string; outcome: string }[]; transcripts: number };
export async function ingest(s: BusinessStore, items: Inbound[], env: Env = process.env): Promise<IngestResult> {
  ensureHandoffs(s); const res: IngestResult = { stored: 0, duplicates: 0, optOuts: 0, handoffs: 0, approvals: [], transcripts: 0 };
  for (const m of items) {
    if (s.db.prepare('SELECT 1 FROM mb_messages WHERE externalId=?').get(m.externalId)) { res.duplicates++; continue; }
    const appr = m.channel === 'whatsapp' && m.kind === 'text' ? APPROVAL.exec(m.text) : null;
    if (appr) { res.approvals.push({ code: appr[2].toUpperCase(), outcome: replyDecision(s, m.from, appr[1].toLowerCase() === 'approve', appr[2].toUpperCase(), env) }); s.db.prepare("INSERT INTO mb_messages(id,conversationId,direction,author,body,kind,externalId,at) VALUES(?,?,'in','system',?,'approval-reply',?,?)").run(randomUUID(), 'jev', `${appr[1].toUpperCase()} ${appr[2].slice(0, 2)}…`, m.externalId, m.at); continue; }
    const c = conversationFor(s, m.channel, m.from, m.name);
    if (m.echo) {
      // Instagram echo of a message a person sent from the Instagram app: that is a human reply, so take over.
      s.db.prepare("INSERT INTO mb_messages(id,conversationId,direction,author,body,kind,externalId,at) VALUES(?,?,'out','human',?,?,?,?)").run(randomUUID(), c.id, m.text, m.kind, m.externalId, m.at);
      s.db.prepare('UPDATE mb_conversations SET lastOutboundAt=?, updatedAt=? WHERE id=?').run(m.at, iso(), c.id);
      pauseCopilot(s, c.id, 'A human replied from the Instagram app; copilot paused (human takeover)'); res.stored++; continue;
    }
    const sent = m.text ? scoreSentiment(m.text) : { score: 0, escalate: null };
    let transcriptStatus: string | null = null;
    if (m.kind === 'audio' || m.kind === 'voice') { transcriptStatus = await transcribeStatus(m.mediaId, env); res.transcripts++; }
    s.transact(() => {
      s.db.prepare("INSERT INTO mb_messages(id,conversationId,direction,author,body,kind,mediaId,transcriptStatus,externalId,sentiment,at) VALUES(?,?,'in','customer',?,?,?,?,?,?,?)").run(randomUUID(), c.id, m.text, m.kind, m.mediaId ?? null, transcriptStatus, m.externalId, m.text ? sent.score : null, m.at);
      s.db.prepare('UPDATE mb_conversations SET lastInboundAt=?, sentiment=sentiment+?, updatedAt=? WHERE id=?').run(m.at, sent.score, iso(), c.id);
    });
    res.stored++;
    if (STOP.test(m.text)) { addOptOut(s, m.channel, m.from, `Customer sent "${m.text.trim().slice(0, 30)}"`, 'inbound keyword'); res.optOuts++; continue; }
    const now = getConversation(s, c.id);
    if (now.status !== 'handover' && (sent.escalate || now.sentiment <= HANDOFF_THRESHOLD)) { openHandoff(s, c.id, sent.escalate ? `Customer mentioned "${sent.escalate}"` : `Sentiment total ${now.sentiment} (threshold ${HANDOFF_THRESHOLD})`); res.handoffs++; }
  }
  return res;
}

// ---------- Voice notes via the existing Muse Voice adapter ----------
export async function transcribeStatus(mediaId: string | null | undefined, env: Env = process.env): Promise<string> {
  if (!metaKey(env)) return 'Not connected — add META_MODEL_API_KEY';
  try { await metaTranscribe({ mediaId }); return 'transcribed'; }
  catch (e) { return `Not transcribed: ${e instanceof Error ? e.message.slice(0, 160) : 'Muse Voice error'}`; }
}
export async function retryTranscription(s: BusinessStore, messageId: string, env: Env = process.env) {
  ensureTalk(s); const m = s.db.prepare('SELECT * FROM mb_messages WHERE id=?').get(messageId) as Message | undefined;
  if (!m || !['audio', 'voice'].includes(m.kind)) throw new BusinessError('Voice note not found', 404);
  const st = await transcribeStatus(m.mediaId, env);
  s.db.prepare('UPDATE mb_messages SET transcriptStatus=? WHERE id=?').run(st, m.id); return st;
}

// ---------- Drafts: the copilot proposes, Jev approves ----------
function within24h(c: Conversation, now: number) { return c.channel === 'email' || (c.lastInboundAt !== null && now - Date.parse(c.lastInboundAt) < 24 * HOUR); }
export function quickReply(s: BusinessStore, shortcut: string, c: Conversation): string {
  const rows = s.db.prepare("SELECT data FROM mb_module_records WHERE module='talk.canned-replies' AND status='active'").all() as { data: string }[];
  const hit = rows.map((r) => JSON.parse(r.data) as { shortcut: string; body: string }).find((d) => d.shortcut === shortcut);
  if (!hit) throw new BusinessError(`No active canned reply "${shortcut}"`, 404);
  return hit.body.replaceAll('{name}', c.name ?? 'there');
}
export function proposeReply(s: BusinessStore, actor: { id: string }, conversationId: string, input: { text?: string; quickReply?: string; author: 'human' | 'copilot'; purpose?: string }, now = Date.now()): Dispatch {
  const c = getConversation(s, conversationId);
  if (input.author === 'copilot' && c.aiPaused) throw new BusinessError(`Copilot is paused for this conversation: ${c.pausedReason ?? 'human takeover'}`, 409);
  if (!within24h(c, now)) throw new BusinessError(`Outside the ${c.channel} 24-hour customer window; free-form replies are rejected by Meta. Use an approved template.`, 409);
  const body = (input.quickReply ? quickReply(s, input.quickReply, c) : input.text ?? '').trim();
  if (!body) throw new BusinessError('Reply text required', 422);
  const payload = c.channel === 'email' ? { to: c.address, subject: 'Re: your message', body } : { to: c.channel === 'whatsapp' ? `+${c.address}` : c.address, body };
  const d = propose(s, actor.id, c.channel, payload);
  linkDispatch(s, d.id, c.id, input.author, actor.id, input.purpose ?? 'reply');
  return d;
}

// ---------- Follow-up gate ----------
export type FollowUpCandidate = { conversation: Conversation; silentHours: number; blocked: string | null };
export function followUpCandidates(s: BusinessStore, silenceHours = 4, now = Date.now()): FollowUpCandidate[] {
  ensureTalk(s);
  const convs = s.db.prepare("SELECT * FROM mb_conversations WHERE status='open' AND lastOutboundAt IS NOT NULL AND (lastInboundAt IS NULL OR lastOutboundAt > lastInboundAt)").all() as Conversation[];
  return convs.map((c) => {
    const silentHours = Math.floor((now - Date.parse(c.lastOutboundAt!)) / HOUR);
    const pending = s.db.prepare("SELECT 1 FROM mb_dispatch_links l JOIN mb_dispatches d ON d.id=l.dispatchId WHERE l.conversationId=? AND l.purpose='follow-up' AND d.status IN ('pending','approved')").get(c.id);
    const blocked = optOutOf(s, c.channel, c.address) ? 'Opted out' : c.aiPaused ? `Copilot paused: ${c.pausedReason}` : !within24h(c, now) ? 'Outside the 24-hour window (needs a template)' : pending ? 'A follow-up is already waiting for Jev' : null;
    return { conversation: c, silentHours, blocked };
  }).filter((x) => x.silentHours >= silenceHours).sort((a, b) => b.silentHours - a.silentHours);
}
export function draftFollowUp(s: BusinessStore, actor: { id: string }, conversationId: string, text: string | undefined, silenceHours = 4, now = Date.now()) {
  const cand = followUpCandidates(s, silenceHours, now).find((x) => x.conversation.id === conversationId);
  if (!cand) throw new BusinessError(`Not a follow-up candidate (needs ${silenceHours}h of silence after our last message)`, 409);
  if (cand.blocked) throw new BusinessError(`Follow-up gate: ${cand.blocked}`, 409);
  const c = cand.conversation;
  const draft = text?.trim() || `Hi ${c.name ?? 'there'}, just checking in on our last message. Reply here if you have any questions.`;
  return proposeReply(s, actor, c.id, { text: draft, author: 'copilot', purpose: 'follow-up' }, now);
}

// ---------- Approve Jev items from WhatsApp: signed, single-use, expiring, bound to the payload hash ----------
export const APPROVAL_TTL_MS = 15 * 60_000;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function signingSecret(env: Env) { const k = env.MUZEBOS_APPROVAL_SIGNING_SECRET; if (!k || k.length < 32) throw new BusinessError('Not connected — add MUZEBOS_APPROVAL_SIGNING_SECRET (32+ chars)', 424); return k; }
const sign = (secret: string, f: { code: string; dispatchId: string; payloadHash: string; approverId: string; phone: string; expiresAt: number }) => createHmac('sha256', secret).update([f.code, f.dispatchId, f.payloadHash, f.approverId, f.phone, f.expiresAt].join('|')).digest('hex');
export function setApproverPhone(s: BusinessStore, actor: string, memberId: string, phone: string) {
  ensureHandoffs(s); const p = phone.replace(/[^\d]/g, ''); if (!/^[1-9]\d{7,14}$/.test(p)) throw new BusinessError('Phone must be E.164 digits', 422);
  const m = listMembers(s).find((x) => x.id === memberId); if (!m) throw new BusinessError('Member not found', 404);
  if (!can(m, 'jev.decide')) throw new BusinessError(`A ${m.role} cannot decide Jev items`, 422);
  s.db.prepare('INSERT INTO mb_approver_phones VALUES(?,?,?) ON CONFLICT(memberId) DO UPDATE SET phone=excluded.phone').run(memberId, p, iso());
  s.appendEvidence('jev.approver-phone-set', memberId, `WhatsApp approver number ending ${p.slice(-4)} set by ${actor}`);
}
export function approverPhones(s: BusinessStore) { ensureHandoffs(s); return (s.db.prepare('SELECT memberId, phone FROM mb_approver_phones').all() as { memberId: string; phone: string }[]).map((r) => ({ memberId: r.memberId, phoneEnding: r.phone.slice(-4) })); }
/** Issue a code for one pending dispatch and send the prompt. The prompt is itself a dispatch, approved in-app by the requester. */
export async function requestWhatsAppApproval(s: BusinessStore, requester: { id: string; role: string }, dispatchId: string, approverId: string, idempotencyKey: string, deps: Deps, now = Date.now()) {
  const secret = signingSecret(deps.env); ensureHandoffs(s);
  if (!can(requester as never, 'jev.decide')) throw new BusinessError('Only a Jev approver can send approval prompts', 403);
  const d = s.db.prepare('SELECT * FROM mb_dispatches WHERE id=?').get(dispatchId) as { id: string; channel: string; payload: string; payloadHash: string; status: string } | undefined;
  if (!d) throw new BusinessError('Dispatch not found', 404);
  if (d.status !== 'pending') throw new BusinessError(`Dispatch is ${d.status}`, 409);
  const ph = s.db.prepare('SELECT phone FROM mb_approver_phones WHERE memberId=?').get(approverId) as { phone: string } | undefined;
  if (!ph) throw new BusinessError('That approver has no WhatsApp number on file', 422);
  const code = Array.from(randomBytes(8), (b) => B32[b % 32]).join(''); const expiresAt = now + APPROVAL_TTL_MS;
  const f = { code, dispatchId, payloadHash: d.payloadHash, approverId, phone: ph.phone, expiresAt };
  s.db.prepare('INSERT INTO mb_wa_approvals(code,dispatchId,payloadHash,approverId,phone,expiresAt,sig,createdAt) VALUES(?,?,?,?,?,?,?,?)').run(code, dispatchId, d.payloadHash, approverId, ph.phone, expiresAt, sign(secret, f), iso(now));
  const p = JSON.parse(d.payload) as { to?: string; body?: string; amount?: number };
  const preview = p.body ? `"${p.body.slice(0, 160)}"` : p.amount ? `INR ${(p.amount / 100).toFixed(2)}` : '';
  const text = `Jev approval needed: ${d.channel}${p.to ? ` to ${p.to}` : ''} ${preview}\nPayload ${d.payloadHash.slice(0, 12)}. Reply APPROVE ${code} or REJECT ${code} within 15 minutes. Single use.`;
  const prompt = propose(s, requester.id, 'whatsapp', { to: `+${ph.phone}`, body: text });
  decide(s, requester.id, prompt.id, prompt.payloadHash, true);
  s.appendEvidence('jev.whatsapp-prompt', dispatchId, `Approval code issued to approver ${approverId} (ends ${ph.phone.slice(-4)}), expires ${iso(expiresAt)}`);
  const sent = await dispatch(s, prompt.id, prompt.payloadHash, idempotencyKey, deps);
  return { code: sent.status === 'sent' ? null : code, prompt: sent, expiresAt: iso(expiresAt) };
}
function replyDecision(s: BusinessStore, fromPhone: string, approve: boolean, code: string, env: Env): string {
  const phone = fromPhone.replace(/[^\d]/g, '');
  const r = s.db.prepare('SELECT * FROM mb_wa_approvals WHERE code=?').get(code) as { code: string; dispatchId: string; payloadHash: string; approverId: string; phone: string; expiresAt: number; sig: string; usedAt: string | null } | undefined;
  const refuse = (why: string) => { s.appendEvidence('jev.whatsapp-refused', r?.dispatchId ?? `code:${code.slice(0, 2)}`, `WhatsApp reply refused: ${why}`); return `refused: ${why}`; };
  if (!r) return refuse('unknown code');
  let secret: string; try { secret = signingSecret(env); } catch { return refuse('signing secret missing'); }
  const expect = Buffer.from(sign(secret, r), 'hex'); const got = Buffer.from(r.sig, 'hex');
  if (expect.length !== got.length || !timingSafeEqual(expect, got)) return refuse('signature mismatch');
  if (r.phone !== phone) return refuse('reply came from a different number');
  if (r.usedAt) return refuse('code already used');
  if (Date.now() > r.expiresAt) return refuse('code expired');
  const claim = s.db.prepare('UPDATE mb_wa_approvals SET usedAt=? WHERE code=? AND usedAt IS NULL').run(iso(), code);
  if (claim.changes !== 1) return refuse('code already used');
  const member = listMembers(s).find((m) => m.id === r.approverId);
  if (!member || !can(member, 'jev.decide')) { s.db.prepare("UPDATE mb_wa_approvals SET outcome='refused' WHERE code=?").run(code); return refuse('approver no longer has jev.decide'); }
  try { decide(s, r.approverId, r.dispatchId, r.payloadHash, approve); }
  catch (e) { s.db.prepare("UPDATE mb_wa_approvals SET outcome='refused' WHERE code=?").run(code); return refuse(e instanceof Error ? e.message : 'decide failed'); }
  s.db.prepare('UPDATE mb_wa_approvals SET outcome=? WHERE code=?').run(approve ? 'approved' : 'rejected', code);
  s.appendEvidence('jev.whatsapp-decided', r.dispatchId, `${approve ? 'Approved' : 'Rejected'} from WhatsApp (ends ${phone.slice(-4)}) by ${r.approverId}`);
  return approve ? 'approved' : 'rejected';
}

// ---------- Read model ----------
export function talkView(s: BusinessStore, conversationId?: string) {
  ensureHandoffs(s);
  const conversations = s.db.prepare('SELECT * FROM mb_conversations ORDER BY updatedAt DESC LIMIT 200').all() as Conversation[];
  return { conversations, messages: conversationId ? messagesOf(s, getConversation(s, conversationId).id) : [], handoffs: listHandoffs(s), approvers: approverPhones(s) };
}
