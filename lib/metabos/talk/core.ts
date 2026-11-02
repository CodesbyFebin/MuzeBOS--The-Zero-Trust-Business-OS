/**
 * Conversation core shared by dispatch and the Talk copilot: tables, the opt-out registry, and the hook that
 * records a sent dispatch as an outbound message. Human outbound pauses the copilot (human takeover).
 * Clean-room; the takeover pattern follows open-bsp-api's pause_conversation_on_human_message (Unlicense).
 */
import { randomUUID } from 'node:crypto';
import { BusinessError, type BusinessStore } from '../store';

export const TALK_CHANNELS = ['whatsapp', 'instagram', 'email'] as const;
export type TalkChannel = (typeof TALK_CHANNELS)[number];
export type Author = 'customer' | 'human' | 'copilot' | 'system';
export type Conversation = { id: string; channel: TalkChannel; address: string; name: string | null; status: 'open' | 'handover' | 'closed'; aiPaused: number; pausedReason: string | null; lastInboundAt: string | null; lastOutboundAt: string | null; sentiment: number; createdAt: string; updatedAt: string };
export type Message = { id: string; conversationId: string; direction: 'in' | 'out'; author: Author; authorId: string | null; body: string; kind: string; mediaId: string | null; transcriptStatus: string | null; externalId: string | null; dispatchId: string | null; sentiment: number | null; at: string };
export type OptOut = { channel: TalkChannel; address: string; reason: string; source: string; at: string };

export function normalizeAddress(channel: string, address: string) {
  const a = address.trim();
  if (channel === 'whatsapp') return a.replace(/[^\d]/g, '');
  if (channel === 'email') return a.toLowerCase();
  return a;
}
export function ensureTalk(s: BusinessStore) {
  s.db.exec(`CREATE TABLE IF NOT EXISTS mb_conversations(id TEXT PRIMARY KEY, channel TEXT NOT NULL, address TEXT NOT NULL, name TEXT, status TEXT NOT NULL, aiPaused INTEGER NOT NULL DEFAULT 0, pausedReason TEXT, lastInboundAt TEXT, lastOutboundAt TEXT, sentiment INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, UNIQUE(channel, address));
    CREATE TABLE IF NOT EXISTS mb_messages(id TEXT PRIMARY KEY, conversationId TEXT NOT NULL, direction TEXT NOT NULL, author TEXT NOT NULL, authorId TEXT, body TEXT NOT NULL, kind TEXT NOT NULL, mediaId TEXT, transcriptStatus TEXT, externalId TEXT UNIQUE, dispatchId TEXT, sentiment INTEGER, at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS mb_messages_conv ON mb_messages(conversationId, at);
    CREATE TABLE IF NOT EXISTS mb_optouts(channel TEXT NOT NULL, address TEXT NOT NULL, reason TEXT NOT NULL, source TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY(channel, address));
    CREATE TABLE IF NOT EXISTS mb_dispatch_links(dispatchId TEXT PRIMARY KEY, conversationId TEXT NOT NULL, author TEXT NOT NULL, authorId TEXT NOT NULL, purpose TEXT NOT NULL, createdAt TEXT NOT NULL);`);
}
export function conversationFor(s: BusinessStore, channel: TalkChannel, address: string, name?: string | null): Conversation {
  ensureTalk(s); const addr = normalizeAddress(channel, address);
  let c = s.db.prepare('SELECT * FROM mb_conversations WHERE channel=? AND address=?').get(channel, addr) as Conversation | undefined;
  if (!c) {
    const now = new Date().toISOString();
    s.db.prepare("INSERT INTO mb_conversations(id,channel,address,name,status,createdAt,updatedAt) VALUES(?,?,?,?,'open',?,?)").run(randomUUID(), channel, addr, name ?? null, now, now);
    c = s.db.prepare('SELECT * FROM mb_conversations WHERE channel=? AND address=?').get(channel, addr) as Conversation;
  } else if (name && !c.name) s.db.prepare('UPDATE mb_conversations SET name=? WHERE id=?').run(name, c.id);
  return c;
}
export function getConversation(s: BusinessStore, id: string): Conversation {
  ensureTalk(s); const c = s.db.prepare('SELECT * FROM mb_conversations WHERE id=?').get(id) as Conversation | undefined;
  if (!c) throw new BusinessError('Conversation not found', 404); return c;
}

// ---- Opt-out registry (Deskcomm pattern, clean-room) ----
export function optOutOf(s: BusinessStore, channel: string, address: string): OptOut | undefined {
  ensureTalk(s); return s.db.prepare('SELECT * FROM mb_optouts WHERE channel=? AND address=?').get(channel, normalizeAddress(channel, address)) as OptOut | undefined;
}
export function addOptOut(s: BusinessStore, channel: TalkChannel, address: string, reason: string, source: string) {
  ensureTalk(s); const addr = normalizeAddress(channel, address);
  if (!addr) throw new BusinessError('Address required', 422);
  s.transact(() => {
    s.db.prepare('INSERT INTO mb_optouts VALUES(?,?,?,?,?) ON CONFLICT(channel,address) DO NOTHING').run(channel, addr, reason.slice(0, 200), source, new Date().toISOString());
    s.appendEvidence('talk.opted-out', `${channel}:${addr}`, `Opt-out recorded (${source}): ${reason.slice(0, 120)}`);
  });
}
export function removeOptOut(s: BusinessStore, actor: string, channel: TalkChannel, address: string, note: string) {
  ensureTalk(s); const addr = normalizeAddress(channel, address);
  const r = s.db.prepare('DELETE FROM mb_optouts WHERE channel=? AND address=?').run(channel, addr);
  if (!r.changes) throw new BusinessError('Not on the opt-out list', 404);
  s.appendEvidence('talk.opt-in', `${channel}:${addr}`, `Removed from opt-out by ${actor}: ${note.slice(0, 160)}`);
}
export function listOptOuts(s: BusinessStore): OptOut[] { ensureTalk(s); return s.db.prepare('SELECT * FROM mb_optouts ORDER BY at DESC').all() as OptOut[]; }
/** Server-side guard used by dispatch on propose AND on send. */
export function assertNotOptedOut(s: BusinessStore, channel: string, payload: unknown) {
  if (!(TALK_CHANNELS as readonly string[]).includes(channel)) return;
  const to = String((payload as { to?: unknown })?.to ?? '');
  const o = optOutOf(s, channel, to);
  if (o) throw new BusinessError(`Recipient opted out on ${o.at.slice(0, 10)} (${o.source}); nothing was sent`, 451);
}

export function linkDispatch(s: BusinessStore, dispatchId: string, conversationId: string, author: 'human' | 'copilot', authorId: string, purpose: string) {
  ensureTalk(s); s.db.prepare('INSERT INTO mb_dispatch_links VALUES(?,?,?,?,?,?)').run(dispatchId, conversationId, author, authorId, purpose, new Date().toISOString());
}
/** Called by dispatch after a provider accepted a send. */
export function onDispatchSent(s: BusinessStore, d: { id: string; channel: string; payload: unknown; providerRef: string | null }) {
  ensureTalk(s);
  const link = s.db.prepare('SELECT * FROM mb_dispatch_links WHERE dispatchId=?').get(d.id) as { conversationId: string; author: 'human' | 'copilot'; authorId: string; purpose: string } | undefined;
  if (!link) return;
  const now = new Date().toISOString(); const body = String((d.payload as { body?: unknown }).body ?? '');
  s.db.prepare("INSERT INTO mb_messages(id,conversationId,direction,author,authorId,body,kind,externalId,dispatchId,at) VALUES(?,?,'out',?,?,?,'text',?,?,?)").run(randomUUID(), link.conversationId, link.author, link.authorId, body, d.providerRef, d.id, now);
  s.db.prepare('UPDATE mb_conversations SET lastOutboundAt=?, updatedAt=? WHERE id=?').run(now, now, link.conversationId);
  if (link.author === 'human') pauseCopilot(s, link.conversationId, 'A human replied; copilot paused (human takeover)');
}
export function pauseCopilot(s: BusinessStore, conversationId: string, reason: string) {
  const r = s.db.prepare('UPDATE mb_conversations SET aiPaused=1, pausedReason=?, updatedAt=? WHERE id=? AND aiPaused=0').run(reason, new Date().toISOString(), conversationId);
  if (r.changes) s.appendEvidence('talk.copilot-paused', conversationId, reason);
}
