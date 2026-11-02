/**
 * Issues: humans hand work to an agent and track it. Stored in SQLite (mb_issues); every create and
 * status change is an evidence row. Assignees must be agents that already have a desk in Agent Office.
 * Idea ported from the owner's pre-existing "METABOS × MuZe" HTML ("Humans and agents, in one place").
 */
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { BusinessStore } from '../store';
import { BusinessError } from '../store';
import { office } from '../bos/core';
export const ISSUE_STATUS = ['open', 'in_progress', 'done'] as const;
export type Issue = { id: string; title: string; agent: string; status: (typeof ISSUE_STATUS)[number]; createdBy: string; createdAt: string; updatedAt: string };
const ensure = (s: BusinessStore) => s.db.exec('CREATE TABLE IF NOT EXISTS mb_issues(id TEXT PRIMARY KEY, title TEXT NOT NULL, agent TEXT NOT NULL, status TEXT NOT NULL, createdBy TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)');
export const IssueCreate = z.object({ title: z.string().trim().min(3).max(200), agent: z.string().trim().min(1).max(80) }).strict();
export const IssueUpdate = z.object({ id: z.string().max(64), status: z.enum(ISSUE_STATUS) }).strict();
/** Agents that can take an issue: real desks from Agent Office (drafts and Jev runs). Empty when none exist. */
export const assignableAgents = (s: BusinessStore) => office(s).desks.map((d) => d.agent);
export function listIssues(s: BusinessStore): Issue[] { ensure(s); return s.db.prepare('SELECT * FROM mb_issues ORDER BY createdAt DESC LIMIT 200').all() as Issue[]; }
export function createIssue(s: BusinessStore, actor: string, raw: unknown): Issue {
  const d = IssueCreate.parse(raw); if (!assignableAgents(s).includes(d.agent)) throw new BusinessError('Unknown agent; pick one from Agent Office', 400);
  ensure(s); const at = new Date().toISOString(); const i: Issue = { id: randomUUID(), title: d.title, agent: d.agent, status: 'open', createdBy: actor, createdAt: at, updatedAt: at };
  s.db.prepare('INSERT INTO mb_issues VALUES(@id,@title,@agent,@status,@createdBy,@createdAt,@updatedAt)').run(i);
  s.appendEvidence('issue.create', i.id, JSON.stringify({ by: actor, agent: i.agent, title: i.title })); return i;
}
export function updateIssue(s: BusinessStore, actor: string, raw: unknown): Issue {
  const d = IssueUpdate.parse(raw); ensure(s); const at = new Date().toISOString();
  if (s.db.prepare('UPDATE mb_issues SET status=?, updatedAt=? WHERE id=?').run(d.status, at, d.id).changes === 0) throw new BusinessError('Issue not found', 404);
  s.appendEvidence('issue.status', d.id, JSON.stringify({ by: actor, status: d.status }));
  return s.db.prepare('SELECT * FROM mb_issues WHERE id=?').get(d.id) as Issue;
}
