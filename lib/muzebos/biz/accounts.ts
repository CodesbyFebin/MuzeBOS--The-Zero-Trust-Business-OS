/**
 * Sign-in, workspace and role-based access for MuzeBOS members. Passwords use scrypt
 * (lib/auth hashPassword). Sessions and magic links are random tokens stored only as sha256
 * hashes. Magic links are written to a local outbox; no email is sent from this module.
 * One database is one company workspace. Built during the Meta Global AI Developer Hackathon.
 */
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { hashPassword, verifyPassword, cookieFromHeader } from '@/lib/auth';
import { BusinessError, type BusinessStore } from '../store';
import { listExpenses } from './expenses';
import { ensureMembers, member, listMembers, MEMBER_ROLES, DEPARTMENTS, type Member } from './members';

export const USER_COOKIE = 'mb_user';
const SESSION_MS = 7 * 24 * 3600_000; const LINK_MS = 15 * 60_000;
const sha = (t: string) => createHash('sha256').update(t).digest('hex');
const token = () => randomBytes(32).toString('base64url');

/** What each role may do. Department and amount limits are checked in the feature modules. */
export const ROLE_PERMISSIONS = {
  owner: ['members.manage', 'expense.submit', 'expense.decide', 'finance.read', 'finance.write', 'memory.company', 'jev.decide', 'deals.write'],
  manager: ['expense.submit', 'expense.decide', 'finance.read', 'memory.company', 'jev.decide', 'deals.write'],
  member: ['expense.submit', 'deals.write'],
} as const satisfies Record<typeof MEMBER_ROLES[number], readonly string[]>;
export type Permission = typeof ROLE_PERMISSIONS.owner[number];
export function can(m: Pick<Member, 'role'>, p: Permission) { return (ROLE_PERMISSIONS[m.role] as readonly string[]).includes(p); }
export function requirePermission(m: Member, p: Permission) { if (!can(m, p)) throw new BusinessError(`Your role (${m.role}) cannot do this (${p})`, 403); }

export function ensureAccounts(s: BusinessStore) {
  ensureMembers(s);
  s.db.exec(`CREATE TABLE IF NOT EXISTS mb_workspace (id TEXT PRIMARY KEY, name TEXT NOT NULL, createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mb_accounts (memberId TEXT PRIMARY KEY REFERENCES mb_members(id), email TEXT NOT NULL UNIQUE, passHash TEXT, createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mb_user_sessions (tokenHash TEXT PRIMARY KEY, memberId TEXT NOT NULL, expiresAt TEXT NOT NULL, createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mb_magic_links (tokenHash TEXT PRIMARY KEY, memberId TEXT NOT NULL, expiresAt TEXT NOT NULL, usedAt TEXT);
    CREATE TABLE IF NOT EXISTS mb_outbox (id TEXT PRIMARY KEY, recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, createdAt TEXT NOT NULL);`);
}
export function workspace(s: BusinessStore) { ensureAccounts(s); return (s.db.prepare('SELECT * FROM mb_workspace LIMIT 1').get() as { id: string; name: string; createdAt: string } | undefined) ?? null; }
export const setupNeeded = (s: BusinessStore) => { ensureAccounts(s); return !s.db.prepare('SELECT 1 FROM mb_accounts LIMIT 1').get(); };
const Email = z.string().trim().toLowerCase().email().max(200);
const Password = z.string().min(10, 'Use at least 10 characters').max(200);

function openSession(s: BusinessStore, memberId: string, now = Date.now()) {
  const t = token(); s.db.prepare('INSERT INTO mb_user_sessions VALUES (?,?,?,?)').run(sha(t), memberId, new Date(now + SESSION_MS).toISOString(), new Date(now).toISOString()); return t;
}
/** First run: names the workspace and gives the seeded owner an email and password. */
export function setupWorkspace(s: BusinessStore, raw: unknown) {
  const d = z.object({ workspace: z.string().trim().min(1).max(80), name: z.string().trim().min(1).max(80), email: Email, password: Password }).strict().parse(raw);
  ensureAccounts(s); if (!setupNeeded(s)) throw new BusinessError('This workspace is already set up; sign in instead', 409);
  return s.transact(() => {
    s.db.prepare('INSERT OR REPLACE INTO mb_workspace VALUES (?,?,?)').run('main', d.workspace, new Date().toISOString());
    s.db.prepare("UPDATE mb_members SET name=? WHERE id='owner'").run(d.name);
    s.db.prepare('INSERT INTO mb_accounts VALUES (?,?,?,?)').run('owner', d.email, hashPassword(d.password), new Date().toISOString());
    s.appendEvidence('auth.workspace.setup', 'owner', `${d.workspace} by ${d.email}`);
    return { token: openSession(s, 'owner') };
  });
}
export function signIn(s: BusinessStore, raw: unknown) {
  const d = z.object({ email: Email, password: z.string().max(200) }).strict().parse(raw); ensureAccounts(s);
  const a = s.db.prepare('SELECT * FROM mb_accounts WHERE email=?').get(d.email) as { memberId: string; passHash: string | null } | undefined;
  if (!a || !a.passHash || !verifyPassword(d.password, a.passHash)) { s.transact(() => s.appendEvidence('auth.signin.failed', d.email, 'wrong email or password')); throw new BusinessError('Wrong email or password', 401); }
  return s.transact(() => { s.appendEvidence('auth.signin', a.memberId, 'password'); return { token: openSession(s, a.memberId) }; });
}
export function signOut(s: BusinessStore, t: string | undefined) { ensureAccounts(s); if (t) s.db.prepare('DELETE FROM mb_user_sessions WHERE tokenHash=?').run(sha(t)); }
/** Writes a one-time sign-in link to the local outbox. Always answers the same way so it does not reveal which emails exist. */
export function requestMagicLink(s: BusinessStore, raw: unknown, origin: string, now = Date.now()) {
  const { email } = z.object({ email: Email }).strict().parse(raw); ensureAccounts(s);
  const a = s.db.prepare('SELECT memberId FROM mb_accounts WHERE email=?').get(email) as { memberId: string } | undefined;
  if (a) s.transact(() => {
    const t = token(); s.db.prepare('INSERT INTO mb_magic_links VALUES (?,?,?,NULL)').run(sha(t), a.memberId, new Date(now + LINK_MS).toISOString());
    s.db.prepare('INSERT INTO mb_outbox VALUES (?,?,?,?,?)').run(randomUUID(), email, 'Your MuzeBOS sign-in link', `${origin}/workspace/account/sign-in?link=${t} (valid for 15 minutes, once)`, new Date(now).toISOString());
    s.appendEvidence('auth.link.issued', a.memberId, 'local outbox');
  });
  return { sent: 'If that email belongs to a member, a sign-in link is in the local outbox.' };
}
export function redeemMagicLink(s: BusinessStore, t: string, now = Date.now()) {
  ensureAccounts(s); const row = s.db.prepare('SELECT * FROM mb_magic_links WHERE tokenHash=?').get(sha(t)) as { memberId: string; expiresAt: string; usedAt: string | null } | undefined;
  if (!row || row.usedAt || new Date(row.expiresAt).getTime() < now) throw new BusinessError('This sign-in link is invalid, used or expired', 401);
  return s.transact(() => { s.db.prepare('UPDATE mb_magic_links SET usedAt=? WHERE tokenHash=?').run(new Date(now).toISOString(), sha(t)); s.appendEvidence('auth.signin', row.memberId, 'magic link'); return { token: openSession(s, row.memberId, now) }; });
}
export function setOwnPassword(s: BusinessStore, m: Member, raw: unknown) {
  const { password } = z.object({ password: Password }).strict().parse(raw);
  s.transact(() => { s.db.prepare('UPDATE mb_accounts SET passHash=? WHERE memberId=?').run(hashPassword(password), m.id); s.appendEvidence('auth.password.set', m.id, 'by self'); });
}
/** Owner invites a teammate: a member, an account without a password, and a sign-in link in the outbox. */
export function invite(s: BusinessStore, actor: Member, raw: unknown, origin: string) {
  requirePermission(actor, 'members.manage');
  const d = z.object({ name: z.string().trim().min(1).max(80), email: Email, role: z.enum(MEMBER_ROLES), department: z.enum(DEPARTMENTS) }).strict().parse(raw); ensureAccounts(s);
  if (s.db.prepare('SELECT 1 FROM mb_accounts WHERE email=?').get(d.email)) throw new BusinessError('That email already has an account', 409);
  const id = randomUUID();
  s.transact(() => {
    s.db.prepare('INSERT INTO mb_members VALUES (?,?,?,?,?)').run(id, d.name, d.role, d.department, new Date().toISOString());
    s.db.prepare('INSERT INTO mb_accounts VALUES (?,?,NULL,?)').run(id, d.email, new Date().toISOString());
    s.appendEvidence('member.invited', id, `${d.name} as ${d.role} in ${d.department} by ${actor.id}`);
  });
  requestMagicLink(s, { email: d.email }, origin); return member(s, id);
}
export function outbox(s: BusinessStore) { ensureAccounts(s); return s.db.prepare('SELECT * FROM mb_outbox ORDER BY createdAt DESC LIMIT 50').all() as { id: string; recipient: string; subject: string; body: string; createdAt: string }[]; }
export function memberForToken(s: BusinessStore, t: string | undefined, now = Date.now()): Member | null {
  if (!t) return null; ensureAccounts(s);
  const r = s.db.prepare('SELECT memberId, expiresAt FROM mb_user_sessions WHERE tokenHash=?').get(sha(t)) as { memberId: string; expiresAt: string } | undefined;
  if (!r || new Date(r.expiresAt).getTime() < now) return null; return member(s, r.memberId);
}
export const tokenFrom = (req: Request) => cookieFromHeader(req.headers.get('cookie'), USER_COOKIE);
export function currentMember(s: BusinessStore, req: Request) { return memberForToken(s, tokenFrom(req)); }
/** The signed-in member, or 401. Server rules always use this, never an id from the request body. */
export function requireMember(s: BusinessStore, req: Request): Member { const m = currentMember(s, req); if (!m) throw new BusinessError('Sign in to do this', 401); return m; }
export function directory(s: BusinessStore) {
  ensureAccounts(s); const emails = new Map((s.db.prepare('SELECT memberId, email, passHash IS NOT NULL AS hasPassword FROM mb_accounts').all() as { memberId: string; email: string; hasPassword: number }[]).map((a) => [a.memberId, a]));
  const open = listExpenses(s).filter((e) => e.status === 'submitted');
  return listMembers(s).map((m) => ({ ...m, email: emails.get(m.id)?.email ?? null, canSignIn: !!emails.get(m.id), permissions: ROLE_PERMISSIONS[m.role], openClaims: open.filter((e) => e.submittedBy === m.id).length }));
}
export const cookieHeader = (t: string, secure: boolean) => `${USER_COOKIE}=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MS / 1000}${secure ? '; Secure' : ''}`;
export const clearCookie = `${USER_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
