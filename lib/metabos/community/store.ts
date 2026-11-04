/**
 * Community server (Discord-style): servers, channels, threads and messages in SQLite. UI patterns adapted from
 * issam-seghir/discord-clone (MIT, see THIRD_PARTY.md); its Prisma/Postgres schema, Clerk auth, Socket.io, LiveKit and
 * UploadThing are not used. Members sign in through MuZe; agents post through a signed-in member and are labelled.
 * Any send to Meta is a [MUSE plan] dispatch proposal: two different reviewers (museReview), then dispatch (dry run by default).
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { BusinessError, type BusinessStore } from '../store';
import { propose, type Dispatch } from '../dispatch/service';
import type { Member } from '../biz/members';
export type CsRole = 'admin' | 'moderator' | 'guest' | 'agent';
/** Template roles ADMIN/MODERATOR/GUEST mapped onto MuZe member roles; agents get their own role. */
export const roleOf = (m: Pick<Member, 'role'>): CsRole => (m.role === 'owner' ? 'admin' : m.role === 'manager' ? 'moderator' : 'guest');
export type Server = { id: string; name: string; createdBy: string; createdAt: string };
export type Channel = { id: string; serverId: string; name: string; kind: 'text' | 'forum' | 'announcement'; createdAt: string };
export type Thread = { id: string; channelId: string; title: string; createdBy: string; createdAt: string };
export type Message = { id: string; channelId: string; threadId: string | null; authorKind: 'member' | 'agent' | 'system'; author: string; authorId: string | null; role: CsRole | 'system'; body: string; dispatchId: string | null; createdAt: string; editedAt: string | null; deleted: number };
function ensure(s: BusinessStore) {
  s.db.exec(`CREATE TABLE IF NOT EXISTS mb_cs_servers(id TEXT PRIMARY KEY, name TEXT NOT NULL, createdBy TEXT NOT NULL, createdAt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS mb_cs_channels(id TEXT PRIMARY KEY, serverId TEXT NOT NULL REFERENCES mb_cs_servers(id), name TEXT NOT NULL, kind TEXT NOT NULL, createdAt TEXT NOT NULL, UNIQUE(serverId, name));
CREATE TABLE IF NOT EXISTS mb_cs_threads(id TEXT PRIMARY KEY, channelId TEXT NOT NULL REFERENCES mb_cs_channels(id), title TEXT NOT NULL, createdBy TEXT NOT NULL, createdAt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS mb_cs_messages(id TEXT PRIMARY KEY, channelId TEXT NOT NULL REFERENCES mb_cs_channels(id), threadId TEXT REFERENCES mb_cs_threads(id), authorKind TEXT NOT NULL, author TEXT NOT NULL, role TEXT NOT NULL, body TEXT NOT NULL, dispatchId TEXT, createdAt TEXT NOT NULL, editedAt TEXT, deleted INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS mb_cs_msg_ch ON mb_cs_messages(channelId, createdAt);
CREATE TABLE IF NOT EXISTS mb_cs_rev(k INTEGER PRIMARY KEY CHECK(k=1), rev INTEGER NOT NULL); INSERT OR IGNORE INTO mb_cs_rev VALUES(1,0);`);
  if (!(s.db.prepare('PRAGMA table_info(mb_cs_messages)').all() as { name: string }[]).some((c) => c.name === 'authorId')) s.db.exec('ALTER TABLE mb_cs_messages ADD COLUMN authorId TEXT');
}
const bump = (s: BusinessStore) => s.db.prepare('UPDATE mb_cs_rev SET rev=rev+1 WHERE k=1').run();
export function communityVersion(s: BusinessStore): number { ensure(s); return (s.db.prepare('SELECT rev FROM mb_cs_rev WHERE k=1').get() as { rev: number }).rev; }
const now = () => new Date().toISOString();
const Name = z.string().trim().min(1).max(60);
const ChName = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, 'Channel names use a-z, 0-9 and dashes');
const Body = z.string().trim().min(1).max(4000);
const id = z.string().uuid();
const staff = (r: CsRole) => r === 'admin' || r === 'moderator';
const need = (ok: boolean, msg: string) => { if (!ok) throw new BusinessError(msg, 403); };
const get = <T>(s: BusinessStore, table: string, key: string, what: string): T => { ensure(s); const r = s.db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(key) as T | undefined; if (!r) throw new BusinessError(`${what} not found`, 404); return r; };

export function snapshot(s: BusinessStore, channelId?: string, threadId?: string) {
  ensure(s);
  const servers = s.db.prepare('SELECT * FROM mb_cs_servers ORDER BY createdAt').all() as Server[];
  const channels = s.db.prepare('SELECT * FROM mb_cs_channels ORDER BY createdAt').all() as Channel[];
  const threads = channelId ? s.db.prepare('SELECT t.*, (SELECT COUNT(*) FROM mb_cs_messages m WHERE m.threadId=t.id AND m.deleted=0) replies FROM mb_cs_threads t WHERE channelId=? ORDER BY createdAt DESC').all(channelId) as (Thread & { replies: number })[] : [];
  const messages = channelId ? (threadId ? s.db.prepare('SELECT * FROM mb_cs_messages WHERE channelId=? AND threadId=? ORDER BY createdAt LIMIT 500').all(channelId, threadId) : s.db.prepare('SELECT * FROM mb_cs_messages WHERE channelId=? AND threadId IS NULL ORDER BY createdAt DESC LIMIT 200').all(channelId).reverse()) as Message[] : [];
  return { servers, channels, threads, messages: messages.map((m) => (m.deleted ? { ...m, body: 'This message has been deleted.' } : m)), rev: communityVersion(s) };
}
export function createServer(s: BusinessStore, me: Member, raw: unknown): Server {
  need(staff(roleOf(me)), 'Only owners and managers can create a server');
  const name = Name.parse((raw as { name?: unknown })?.name); ensure(s); const sv: Server = { id: randomUUID(), name, createdBy: me.id, createdAt: now() };
  s.transact(() => { s.db.prepare('INSERT INTO mb_cs_servers VALUES(?,?,?,?)').run(sv.id, sv.name, sv.createdBy, sv.createdAt); s.appendEvidence('community.server.create', sv.id, JSON.stringify({ name, by: me.id })); bump(s); });
  return sv;
}
export function createChannel(s: BusinessStore, me: Member, raw: unknown): Channel {
  need(staff(roleOf(me)), 'Only owners and managers can create a channel');
  const i = z.object({ serverId: id, name: ChName, kind: z.enum(['text', 'forum', 'announcement']).default('text') }).strict().parse(raw);
  get<Server>(s, 'mb_cs_servers', i.serverId, 'Server');
  if (s.db.prepare('SELECT 1 FROM mb_cs_channels WHERE serverId=? AND name=?').get(i.serverId, i.name)) throw new BusinessError(`#${i.name} already exists`, 409);
  const c: Channel = { id: randomUUID(), serverId: i.serverId, name: i.name, kind: i.kind, createdAt: now() };
  s.transact(() => { s.db.prepare('INSERT INTO mb_cs_channels VALUES(?,?,?,?,?)').run(c.id, c.serverId, c.name, c.kind, c.createdAt); s.appendEvidence('community.channel.create', c.id, JSON.stringify({ name: c.name, kind: c.kind, by: me.id })); bump(s); });
  return c;
}
export function createThread(s: BusinessStore, me: Member, raw: unknown): Thread {
  const i = z.object({ channelId: id, title: Name, body: Body }).strict().parse(raw); const c = get<Channel>(s, 'mb_cs_channels', i.channelId, 'Channel');
  if (c.kind === 'announcement') need(staff(roleOf(me)), 'Only owners and managers create announcement threads');
  const t: Thread = { id: randomUUID(), channelId: i.channelId, title: i.title, createdBy: me.id, createdAt: now() };
  s.transact(() => { s.db.prepare('INSERT INTO mb_cs_threads VALUES(?,?,?,?,?)').run(t.id, t.channelId, t.title, t.createdBy, t.createdAt); insert(s, { channelId: i.channelId, threadId: t.id, authorKind: 'member', author: me.name, authorId: me.id, role: roleOf(me), body: i.body }); s.appendEvidence('community.thread.create', t.id, JSON.stringify({ title: t.title, by: me.id })); });
  return t;
}
function insert(s: BusinessStore, m: Omit<Message, 'id' | 'createdAt' | 'editedAt' | 'deleted' | 'dispatchId' | 'authorId'> & { dispatchId?: string | null; authorId?: string | null }): Message {
  const row: Message = { id: randomUUID(), createdAt: now(), editedAt: null, deleted: 0, dispatchId: m.dispatchId ?? null, authorId: m.authorId ?? null, ...m } as Message;
  s.db.prepare('INSERT INTO mb_cs_messages(id,channelId,threadId,authorKind,author,role,body,dispatchId,createdAt,editedAt,deleted,authorId) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(row.id, row.channelId, row.threadId, row.authorKind, row.author, row.role, row.body, row.dispatchId, row.createdAt, row.editedAt, 0, row.authorId); bump(s); return row;
}
const Post = z.object({ channelId: id, threadId: id.nullable().default(null), body: Body }).strict();
function checkTarget(s: BusinessStore, channelId: string, threadId: string | null) {
  const c = get<Channel>(s, 'mb_cs_channels', channelId, 'Channel');
  if (threadId && get<Thread>(s, 'mb_cs_threads', threadId, 'Thread').channelId !== channelId) throw new BusinessError('Thread is not in this channel', 400);
  return c;
}
export function post(s: BusinessStore, me: Member, raw: unknown): Message {
  const i = Post.parse(raw); const c = checkTarget(s, i.channelId, i.threadId);
  if (c.kind === 'announcement' && !i.threadId) need(staff(roleOf(me)), 'Only owners and managers post in announcement channels');
  if (c.kind === 'forum' && !i.threadId) throw new BusinessError('Forum channels take posts inside a thread', 400);
  let m!: Message; s.transact(() => { m = insert(s, { channelId: i.channelId, threadId: i.threadId, authorKind: 'member', author: me.name, authorId: me.id, role: roleOf(me), body: i.body }); s.appendEvidence('community.message.post', m.id, JSON.stringify({ channel: c.name, thread: i.threadId, by: me.id, chars: i.body.length })); });
  return m;
}
/** An agent's message, posted through a signed-in member (who is recorded). Shown with the "agent" role badge. */
export function agentPost(s: BusinessStore, me: Member, raw: unknown): Message {
  const i = Post.extend({ agent: z.string().trim().min(2).max(40).regex(/^[\w .-]+$/) }).strict().parse(raw); const c = checkTarget(s, i.channelId, i.threadId);
  if (c.kind === 'forum' && !i.threadId) throw new BusinessError('Forum channels take posts inside a thread', 400);
  let m!: Message; s.transact(() => { m = insert(s, { channelId: i.channelId, threadId: i.threadId, authorKind: 'agent', author: i.agent, role: 'agent', body: i.body }); s.appendEvidence('community.agent.post', m.id, JSON.stringify({ agent: i.agent, channel: c.name, via: me.id, chars: i.body.length })); });
  return m;
}
export function edit(s: BusinessStore, me: Member, raw: unknown): Message {
  const i = z.object({ id, body: Body }).strict().parse(raw); const m = get<Message>(s, 'mb_cs_messages', i.id, 'Message');
  need(m.authorKind === 'member' && m.authorId === me.id && !m.deleted, 'You can only edit your own messages');
  s.transact(() => { s.db.prepare('UPDATE mb_cs_messages SET body=?, editedAt=? WHERE id=?').run(i.body, now(), m.id); s.appendEvidence('community.message.edit', m.id, JSON.stringify({ by: me.id })); bump(s); });
  return get<Message>(s, 'mb_cs_messages', m.id, 'Message');
}
/** Soft delete, as in the template: owners of the message, admins and moderators. */
export function remove(s: BusinessStore, me: Member, raw: unknown) {
  const i = z.object({ id }).strict().parse(raw); const m = get<Message>(s, 'mb_cs_messages', i.id, 'Message');
  need(staff(roleOf(me)) || (m.authorKind === 'member' && m.authorId === me.id), 'Only the author, owners or managers can delete this');
  s.transact(() => { s.db.prepare('UPDATE mb_cs_messages SET deleted=1 WHERE id=?').run(m.id); s.appendEvidence('community.message.delete', m.id, JSON.stringify({ by: me.id })); bump(s); });
  return { ok: true };
}
const META = z.discriminatedUnion('channel', [
  z.object({ messageId: id, channel: z.literal('whatsapp'), to: z.string() }).strict(),
  z.object({ messageId: id, channel: z.literal('instagram'), to: z.string() }).strict(),
  z.object({ messageId: id, channel: z.literal('messenger'), to: z.string() }).strict(),
]);
/** Proposes a Meta send of a community message. Nothing leaves here: two reviewers in Sanctum, then dispatch (dry run unless MUZEBOS_META_DRY_RUN=0). */
export function proposeMeta(s: BusinessStore, me: Member, raw: unknown): { dispatch: Dispatch; note: Message } {
  const i = META.parse(raw); const m = get<Message>(s, 'mb_cs_messages', i.messageId, 'Message'); if (m.deleted) throw new BusinessError('Message was deleted', 409);
  const c = get<Channel>(s, 'mb_cs_channels', m.channelId, 'Channel');
  const d = propose(s, me.id, i.channel, { to: i.to.trim(), body: m.body }, 'muse');
  let note!: Message; s.transact(() => { s.db.prepare('UPDATE mb_cs_messages SET dispatchId=? WHERE id=?').run(d.id, m.id);
    note = insert(s, { channelId: m.channelId, threadId: m.threadId, authorKind: 'system', author: 'jev', role: 'system', body: `${i.channel} send proposed by ${me.name}. It needs two different reviewers in Sanctum before dispatch.`, dispatchId: d.id });
    s.appendEvidence('community.meta.proposed', d.id, JSON.stringify({ message: m.id, channel: i.channel, by: me.id, payload: d.payloadHash.slice(0, 12) })); });
  return { dispatch: d, note };
}
