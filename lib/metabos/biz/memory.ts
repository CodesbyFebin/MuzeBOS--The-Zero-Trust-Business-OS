/**
 * Layered memory for agents. L1 session, L2 department, L3 company, L4 owner preferences.
 * Humans write trusted entries; agents (and Muse compaction) write drafts that a human must
 * promote. contextFor() returns only trusted entries an agent's department may see.
 * Clean-room design based on the observed behaviour of clawcompany (4-layer memory) and hive
 * (L1/L2/L3); no code or text used. Built during the Meta Global AI Developer Hackathon.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { BusinessError, type BusinessStore } from '../store';
import { InferenceStore } from '../inference/store';
import { routes, fingerprint } from '../inference/routing';
import { runtimeEnv } from '@/lib/creds';
import { member, DEPARTMENTS, type Department } from './members';

type Env = Record<string, string | undefined>;
export const LAYERS = ['L1', 'L2', 'L3', 'L4'] as const;
export type Layer = typeof LAYERS[number];
export const LAYER_NAMES: Record<Layer, string> = { L1: 'Session', L2: 'Department', L3: 'Company', L4: 'Owner preferences' };
export type Memory = { id: string; layer: Layer; scope: string; text: string; status: 'trusted' | 'draft'; author: string; promotedBy: string | null; createdAt: string };
const Text = z.string().trim().min(3).max(600);
function ensure(s: BusinessStore) { s.db.exec(`CREATE TABLE IF NOT EXISTS mb_memory (id TEXT PRIMARY KEY, layer TEXT NOT NULL, scope TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('trusted','draft')), author TEXT NOT NULL, promotedBy TEXT, createdAt TEXT NOT NULL)`); }
const insert = (s: BusinessStore, m: Memory) => s.transact(() => { s.db.prepare('INSERT INTO mb_memory VALUES (?,?,?,?,?,?,?,?)').run(m.id, m.layer, m.scope, m.text, m.status, m.author, m.promotedBy, m.createdAt); s.appendEvidence(`memory.${m.status}`, m.id, `${m.layer}/${m.scope} by ${m.author}`); });
export function listMemory(s: BusinessStore): Memory[] { ensure(s); return s.db.prepare('SELECT * FROM mb_memory ORDER BY createdAt DESC, rowid DESC').all() as Memory[]; }

/** Who may hold trusted memory where: L4 and L3 owner only (L3 also managers), L2 owner or a member of that department, L1 anyone. */
function mayWrite(s: BusinessStore, actorId: string, layer: Layer, scope: string) {
  const m = member(s, actorId);
  if (m.role === 'owner') return null;
  if (layer === 'L4') return 'Only an owner sets owner preferences';
  if (layer === 'L3') return m.role === 'manager' ? null : 'Only owners and managers write company memory';
  if (layer === 'L2') return scope === m.department ? null : 'You can write only your own department memory';
  return null;
}
function scopeFor(layer: Layer, scope: string | undefined) {
  if (layer === 'L3') return 'company'; if (layer === 'L4') return 'owner';
  if (layer === 'L2') { if (!(DEPARTMENTS as readonly string[]).includes(scope ?? '')) throw new BusinessError('Department memory needs a department', 400); return scope!; }
  if (!scope || !/^[\w-]{1,64}$/.test(scope)) throw new BusinessError('Session memory needs a session id', 400); return scope;
}
const Input = z.object({ layer: z.enum(LAYERS), scope: z.string().max(64).optional(), text: Text }).strict();
/** A human writes a trusted entry. */
export function remember(s: BusinessStore, actorId: string, raw: unknown): Memory {
  ensure(s); const d = Input.parse(raw); const scope = scopeFor(d.layer, d.scope);
  const why = mayWrite(s, actorId, d.layer, scope); if (why) throw new BusinessError(why, 403);
  const m: Memory = { id: randomUUID(), layer: d.layer, scope, text: d.text, status: 'trusted', author: `human:${actorId}`, promotedBy: null, createdAt: new Date().toISOString() };
  insert(s, m); return m;
}
/** An agent proposes an entry. It stays a draft, and never in L4. A department agent drafts only for its own department. */
export function agentDraft(s: BusinessStore, role: string, raw: unknown): Memory {
  ensure(s); const d = Input.parse(raw);
  if (!(DEPARTMENTS as readonly string[]).includes(role)) throw new BusinessError('Unknown agent role', 400);
  if (d.layer === 'L4') throw new BusinessError('Agents cannot write owner preferences', 403);
  const scope = scopeFor(d.layer, d.layer === 'L2' ? d.scope ?? role : d.scope);
  if (d.layer === 'L2' && scope !== role) throw new BusinessError('An agent drafts only for its own department', 403);
  const m: Memory = { id: randomUUID(), layer: d.layer, scope, text: d.text, status: 'draft', author: `agent:${role}`, promotedBy: null, createdAt: new Date().toISOString() };
  insert(s, m); return m;
}
/** A human with write rights for that layer promotes a draft to trusted. */
export function promote(s: BusinessStore, actorId: string, id: string): Memory {
  ensure(s); const m = s.db.prepare('SELECT * FROM mb_memory WHERE id=?').get(id) as Memory | undefined;
  if (!m) throw new BusinessError('Unknown memory', 404); if (m.status !== 'draft') throw new BusinessError('Already trusted', 409);
  const why = mayWrite(s, actorId, m.layer, m.scope); if (why) throw new BusinessError(why, 403);
  s.transact(() => { s.db.prepare("UPDATE mb_memory SET status='trusted', promotedBy=? WHERE id=? AND status='draft'").run(actorId, id); s.appendEvidence('memory.promoted', id, `by ${actorId}`); });
  return { ...m, status: 'trusted', promotedBy: actorId };
}
export function forget(s: BusinessStore, actorId: string, id: string) {
  ensure(s); const m = s.db.prepare('SELECT * FROM mb_memory WHERE id=?').get(id) as Memory | undefined; if (!m) throw new BusinessError('Unknown memory', 404);
  const why = mayWrite(s, actorId, m.layer, m.scope); if (why) throw new BusinessError(why, 403);
  s.transact(() => { s.db.prepare('DELETE FROM mb_memory WHERE id=?').run(id); s.appendEvidence('memory.forgotten', id, `by ${actorId}`); });
}
const words = (t: string) => new Set(t.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
/**
 * Context for one agent: trusted entries only, L4 then L3, then its own department (L2), then
 * this session (L1). Within a layer, entries sharing more words with the query come first.
 * Stops at the character budget. Another department's L2 memory is never included.
 */
export function contextFor(s: BusinessStore, role: Department, sessionId: string, query: string, budget = 2000) {
  ensure(s); const q = words(query); const rank = { L4: 0, L3: 1, L2: 2, L1: 3 } as const;
  const rows = (s.db.prepare("SELECT * FROM mb_memory WHERE status='trusted' AND (layer IN ('L3','L4') OR (layer='L2' AND scope=?) OR (layer='L1' AND scope=?))").all(role, sessionId) as Memory[])
    .map((m) => ({ m, score: [...words(m.text)].filter((w) => q.has(w)).length }))
    .sort((a, b) => rank[a.m.layer] - rank[b.m.layer] || b.score - a.score || b.m.createdAt.localeCompare(a.m.createdAt));
  const out: Memory[] = []; let used = 0;
  for (const { m } of rows) { if (used + m.text.length > budget) continue; out.push(m); used += m.text.length; }
  return { entries: out, used, budget };
}
/** Files a gated Muse draft that compacts trusted session and department memory into one company note. */
export function requestCompaction(s: BusinessStore, opts: { env?: Env; lane?: 'meta' | 'baseten'; paidConsent?: boolean } = {}) {
  ensure(s); const src = (s.db.prepare("SELECT layer, scope, text FROM mb_memory WHERE status='trusted' AND layer IN ('L1','L2') ORDER BY createdAt DESC LIMIT 40").all() as Memory[]);
  if (!src.length) throw new BusinessError('No trusted session or department memory to compact', 409);
  return new InferenceStore(s, () => routes(opts.env ?? runtimeEnv())).create({ title: 'Memory compaction', prompt: `Compact these business notes into one short company-level note that keeps every concrete fact and drops duplicates. Do not invent anything. Return exactly {"note":"..."}, no markdown. Notes: ${JSON.stringify(src)}`, kind: 'draft', lane: opts.lane ?? 'meta', maxTokens: 300, paidConsent: !!opts.paidConsent });
}
const Note = z.object({ note: Text }).strict();
/** Reads an approved, completed compaction and stores it as an L3 draft; a human must still promote it. */
export function readCompaction(s: BusinessStore, taskId: string, opts: { env?: Env } = {}): Memory {
  const t = new InferenceStore(s, () => routes(opts.env ?? runtimeEnv())).task(taskId);
  if (t.state !== 'completed' || t.approvedHash !== t.hash || fingerprint(t.payload) !== t.hash || !t.output || fingerprint(t.output) !== t.outputHash) throw new BusinessError('An approved, completed draft with intact evidence is required', 409);
  let note: string; try { note = Note.parse(JSON.parse(t.output)).note; } catch { throw new BusinessError('Draft was not exactly the expected JSON; nothing changed', 422); }
  ensure(s); if (s.db.prepare("SELECT 1 FROM mb_memory WHERE author=?").get(`muse:${taskId}`)) throw new BusinessError('This compaction was already stored', 409);
  const m: Memory = { id: randomUUID(), layer: 'L3', scope: 'company', text: note, status: 'draft', author: `muse:${taskId}`, promotedBy: null, createdAt: new Date().toISOString() };
  insert(s, m); return m;
}
