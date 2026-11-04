import { describe, it, expect, beforeEach } from 'vitest';
import { BusinessStore } from '@/lib/metabos/store';
import { createIssue, listIssues, updateIssue, assignableAgents } from '@/lib/metabos/board/issues';
import * as core from '@/lib/metabos/bos/core';
import { vi } from 'vitest';
let s: BusinessStore;
beforeEach(() => { s = new BusinessStore(':memory:'); vi.restoreAllMocks(); });
describe('board issues', () => {
  it('starts empty with no fabricated agents', () => { expect(listIssues(s)).toEqual([]); expect(assignableAgents(s)).toEqual([]); });
  it('rejects an agent without a desk', () => { expect(() => createIssue(s, 'o@x', { title: 'Ship it', agent: 'ghost' })).toThrow(/Unknown agent/); });
  it('creates, updates and records evidence', () => {
    vi.spyOn(core, 'office').mockReturnValue({ desks: [{ agent: 'sales agent' }] } as ReturnType<typeof core.office>);
    const i = createIssue(s, 'o@x', { title: 'Follow up lead', agent: 'sales agent' }); expect(i.status).toBe('open');
    expect(updateIssue(s, 'o@x', { id: i.id, status: 'done' }).status).toBe('done');
    expect(s.evidence().map((e) => e.action)).toEqual(expect.arrayContaining(['issue.create', 'issue.status'])); expect(s.verifyAudit()).toBe(true);
  });
  it('404s a missing issue and rejects bad status', () => {
    expect(() => updateIssue(s, 'o', { id: 'nope', status: 'done' })).toThrow(/not found/);
    expect(() => updateIssue(s, 'o', { id: 'x', status: 'wip' })).toThrow();
  });
});
