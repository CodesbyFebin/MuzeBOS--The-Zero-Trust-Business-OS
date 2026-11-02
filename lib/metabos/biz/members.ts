/**
 * Workspace members, designed for multi-user use. The local preview has no login yet, so the
 * acting member is chosen in the UI and passed as an id; every rule below is enforced on the
 * server against that id, so real authentication can replace the picker without changing the rules.
 * Built during the Meta Global AI Developer Hackathon.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { BusinessError, type BusinessStore } from '../store';
import { AGENT_ROLES } from '../workflows';

export const MEMBER_ROLES = ['owner', 'manager', 'member'] as const;
export const DEPARTMENTS = AGENT_ROLES;
export type Department = typeof DEPARTMENTS[number];
export type Member = { id: string; name: string; role: typeof MEMBER_ROLES[number]; department: Department; createdAt: string };
const MemberInput = z.object({ name: z.string().trim().min(1).max(80), role: z.enum(MEMBER_ROLES), department: z.enum(DEPARTMENTS) }).strict();

export function ensureMembers(s: BusinessStore) {
  s.db.exec(`CREATE TABLE IF NOT EXISTS mb_members (id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, department TEXT NOT NULL, createdAt TEXT NOT NULL)`);
  if (!s.db.prepare('SELECT 1 FROM mb_members LIMIT 1').get()) s.db.prepare('INSERT INTO mb_members VALUES (?,?,?,?,?)').run('owner', 'Owner', 'owner', 'operations', new Date().toISOString());
}
export function listMembers(s: BusinessStore): Member[] { ensureMembers(s); return s.db.prepare('SELECT * FROM mb_members ORDER BY createdAt, rowid').all() as Member[]; }
export function member(s: BusinessStore, id: string): Member {
  ensureMembers(s); const m = s.db.prepare('SELECT * FROM mb_members WHERE id=?').get(id) as Member | undefined;
  if (!m) throw new BusinessError('Unknown member', 404); return m;
}
/** Only an owner can add members. */
export function addMember(s: BusinessStore, actorId: string, raw: unknown): Member {
  if (member(s, actorId).role !== 'owner') throw new BusinessError('Only an owner can add members', 403);
  const d = MemberInput.parse(raw); const m: Member = { id: randomUUID(), ...d, createdAt: new Date().toISOString() };
  s.transact(() => { s.db.prepare('INSERT INTO mb_members VALUES (?,?,?,?,?)').run(m.id, m.name, m.role, m.department, m.createdAt); s.appendEvidence('member.added', m.id, `${m.name} as ${m.role} in ${m.department} by ${actorId}`); });
  return m;
}
