/**
 * Design canvas (Doop-style idea; Doop is AGPL-3.0 and none of its code is used). Frames hold real HTML that agents
 * write, optionally in appended chunks, so viewers see it grow over SSE. Comments can open an Issue for an Agent
 * Office desk. "Mark ready" opens a Jev approval. Everything is SQLite with evidence rows.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { BusinessStore } from '../store';
import { BusinessError } from '../store';
import { createIssue, assignableAgents } from '../board/issues';
import { propose as jevPropose } from '../ai/jev';
export const MAX_HTML = 200_000;
export type Frame = { id: string; title: string; html: string; x: number; y: number; w: number; h: number; status: 'draft' | 'ready'; createdBy: string; createdAt: string; updatedAt: string; rev: number };
export type Comment = { id: string; frameId: string; body: string; author: string; issueId: string | null; createdAt: string };
function ensure(s: BusinessStore) {
  s.db.exec(`CREATE TABLE IF NOT EXISTS mb_canvas_frames(id TEXT PRIMARY KEY, title TEXT NOT NULL, html TEXT NOT NULL, x REAL NOT NULL, y REAL NOT NULL, w REAL NOT NULL, h REAL NOT NULL, status TEXT NOT NULL, createdBy TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, rev INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS mb_canvas_comments(id TEXT PRIMARY KEY, frameId TEXT NOT NULL, body TEXT NOT NULL, author TEXT NOT NULL, issueId TEXT, createdAt TEXT NOT NULL);`);
}
const num = z.number().finite().min(-100000).max(100000);
export const FrameCreate = z.object({ title: z.string().trim().min(1).max(120), html: z.string().max(MAX_HTML).default(''), x: num.default(0), y: num.default(0), w: z.number().min(120).max(4000).default(480), h: z.number().min(80).max(4000).default(360) }).strict();
export const FramePatch = z.object({ id: z.string().uuid(), title: z.string().trim().min(1).max(120).optional(), html: z.string().max(MAX_HTML).optional(), appendHtml: z.string().max(20_000).optional(), x: num.optional(), y: num.optional(), w: z.number().min(120).max(4000).optional(), h: z.number().min(80).max(4000).optional() }).strict()
  .refine((p) => !(p.html !== undefined && p.appendHtml !== undefined), 'Use html or appendHtml, not both');
export function listFrames(s: BusinessStore): Frame[] { ensure(s); return s.db.prepare('SELECT * FROM mb_canvas_frames ORDER BY createdAt').all() as Frame[]; }
export function getFrame(s: BusinessStore, id: string): Frame { ensure(s); const f = s.db.prepare('SELECT * FROM mb_canvas_frames WHERE id=?').get(id) as Frame | undefined; if (!f) throw new BusinessError('Frame not found', 404); return f; }
export function createFrame(s: BusinessStore, actor: string, raw: unknown): Frame {
  const d = FrameCreate.parse(raw); ensure(s); const at = new Date().toISOString();
  const f: Frame = { id: randomUUID(), ...d, status: 'draft', createdBy: actor, createdAt: at, updatedAt: at, rev: 1 };
  s.transact(() => { s.db.prepare('INSERT INTO mb_canvas_frames VALUES(@id,@title,@html,@x,@y,@w,@h,@status,@createdBy,@createdAt,@updatedAt,@rev)').run(f); s.appendEvidence('canvas.frame.create', f.id, JSON.stringify({ by: actor, title: f.title })); });
  return f;
}
export function patchFrame(s: BusinessStore, actor: string, raw: unknown): Frame {
  const p = FramePatch.parse(raw); const cur = getFrame(s, p.id);
  const html = p.appendHtml !== undefined ? cur.html + p.appendHtml : p.html ?? cur.html; if (html.length > MAX_HTML) throw new BusinessError('Frame HTML too large', 413);
  const contentChanged = html !== cur.html || (p.title !== undefined && p.title !== cur.title);
  const n: Frame = { ...cur, title: p.title ?? cur.title, html, x: p.x ?? cur.x, y: p.y ?? cur.y, w: p.w ?? cur.w, h: p.h ?? cur.h, status: contentChanged ? 'draft' : cur.status, updatedAt: new Date().toISOString(), rev: cur.rev + 1 };
  s.transact(() => { s.db.prepare('UPDATE mb_canvas_frames SET title=@title,html=@html,x=@x,y=@y,w=@w,h=@h,status=@status,updatedAt=@updatedAt,rev=@rev WHERE id=@id').run(n);
    // Moves are not evidence-worthy; content changes are.
    if (contentChanged) s.appendEvidence('canvas.frame.write', n.id, JSON.stringify({ by: actor, rev: n.rev, bytes: html.length, mode: p.appendHtml !== undefined ? 'append' : 'replace' })); });
  return n;
}
/** Cheap change cursor for SSE: max(rev) + count. */
export function canvasVersion(s: BusinessStore): string { ensure(s); const r = s.db.prepare('SELECT COALESCE(SUM(rev),0) r, COUNT(*) n FROM mb_canvas_frames').get() as { r: number; n: number }; const c = s.db.prepare('SELECT COUNT(*) n FROM mb_canvas_comments').get() as { n: number }; return `${r.r}.${r.n}.${c.n}`; }
export const CommentCreate = z.object({ frameId: z.string().uuid(), body: z.string().trim().min(1).max(2000), agent: z.string().max(80).optional() }).strict();
export function listComments(s: BusinessStore, frameId?: string): Comment[] { ensure(s); return (frameId ? s.db.prepare('SELECT * FROM mb_canvas_comments WHERE frameId=? ORDER BY createdAt').all(frameId) : s.db.prepare('SELECT * FROM mb_canvas_comments ORDER BY createdAt').all()) as Comment[]; }
/** A comment with an Agent Office desk becomes an Issue assigned to that agent. */
export function addComment(s: BusinessStore, actor: string, raw: unknown): Comment {
  const d = CommentCreate.parse(raw); const f = getFrame(s, d.frameId); let issueId: string | null = null;
  if (d.agent) { if (!assignableAgents(s).includes(d.agent)) throw new BusinessError('Unknown agent; pick one from Agent Office', 400); issueId = createIssue(s, actor, { title: `Canvas "${f.title}": ${d.body}`.slice(0, 200), agent: d.agent }).id; }
  const c: Comment = { id: randomUUID(), frameId: f.id, body: d.body, author: actor, issueId, createdAt: new Date().toISOString() };
  s.transact(() => { s.db.prepare('INSERT INTO mb_canvas_comments VALUES(@id,@frameId,@body,@author,@issueId,@createdAt)').run(c); s.appendEvidence('canvas.comment', c.id, JSON.stringify({ by: actor, frameId: f.id, issueId })); });
  return c;
}
/** "Mark ready": opens a Jev run (rule-sourced reminder to review the frame) that reviewers approve in Jev. */
export function markReady(s: BusinessStore, actor: string, id: string) {
  const f = getFrame(s, id); if (!f.html.trim()) throw new BusinessError('Frame is empty', 400);
  const run = jevPropose(s, { taskId: `canvas:${f.id}:r${f.rev}`, role: 'operations', tool: 'reminders.create', args: { title: `Review canvas frame "${f.title}" (rev ${f.rev})`.slice(0, 120) }, rationale: `${actor} marked this frame ready; a reviewer approves it in Jev.`, source: 'rule' });
  s.transact(() => { s.db.prepare("UPDATE mb_canvas_frames SET status='ready' WHERE id=?").run(f.id); s.appendEvidence('canvas.frame.ready', f.id, JSON.stringify({ by: actor, rev: f.rev, jev: (run as { id?: string }).id ?? null })); });
  return { frame: getFrame(s, f.id), jev: run };
}
/** Stand-alone HTML document for export. Frame HTML is the agent's; it is exported as-is, with no scripts added. */
export function exportHtml(f: Frame) { return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${f.title.replace(/[<&>"]/g, '')}</title></head><body>${f.html}</body></html>`; }
