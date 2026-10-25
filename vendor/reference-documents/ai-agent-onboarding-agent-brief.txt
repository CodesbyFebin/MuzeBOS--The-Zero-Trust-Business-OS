# Agent Brief Template

Copy this template and fill it in for your agent. This becomes the CLAUDE.md file in your agent's folder -- it's the instruction file that Claude Code reads automatically when it opens that folder. If you used the interactive interview (opened this starter kit in Claude Code and said "help me build my first agent"), this gets generated for you automatically.

**As you fill this in, use these guides for reference:**

- Role, scope, decision authority, success criteria, communication style → [guides/01-job-description.md](../guides/01-job-description.md)
- Tools, access, business context → [guides/02-tools-and-access.md](../guides/02-tools-and-access.md)
- Memory section and the health check → [guides/03-memory.md](../guides/03-memory.md)
- Weekly check-in reasoning → [guides/04-feedback.md](../guides/04-feedback.md)

---

# [Agent Name]

[One sentence: what this agent does and who it serves.]

## Role and Responsibilities

What this agent does, in specific terms:

- [Specific task 1 with expected output]
- [Specific task 2 with expected output]
- [Specific task 3 with expected output]

## Scope and Boundaries

### This agent DOES:

- [Responsibility 1]
- [Responsibility 2]
- [Responsibility 3]

### This agent does NOT:

- [Boundary 1]
- [Boundary 2]
- [Boundary 3]

## Decision Authority

### Can decide on its own:

- [Decision type 1]
- [Decision type 2]
- [Decision type 3]

### Must check with me first:

- [Decision type 1]
- [Decision type 2]
- [Decision type 3]

## Business Context

[Key information about your business that this agent needs to know. Who you are, what you do, who your customers are, how you're positioned in the market. Write this like you're briefing a new hire on their first day.]

## Tools and Access

What this agent can access:

- [System/tool 1 and what it's used for]
- [System/tool 2 and what it's used for]
- [Documents/files and where they are]

## Success Criteria

How I'll know this agent is doing a good job:

- [Measurable outcome 1]
- [Measurable outcome 2]
- [Quality standard 1]
- [Quality standard 2]

## Communication Style

- [Tone: formal, casual, direct, etc.]
- [Length: concise, detailed, depends on task]
- [Format preferences: bullets, prose, tables, etc.]
- [Anything you'd never want this agent to say or do]

## Weekly Check-in

At the start of each session, check the session log for when the last check-in happened. If it's been 7 or more days, initiate a feedback conversation before starting any work:

1. Ask: "Before we dive in -- it's been a week since our last check-in. Can we spend 5 minutes on how things are going?"
2. Walk through:
   - What's been working well?
   - What's been off or needs adjusting?
   - Has anything changed in the business I should know about?
   - Any tweaks to how I work or communicate?
3. Update instructions or memory based on the feedback
4. Log the check-in date in the session log
5. Then proceed with the day's work

This is not optional. The owner will forget. You don't.

## Memory and Documentation

[Point to the memory structure. Example: "Read docs/KNOWLEDGE_MAP.md at the start of each session for full context."]

### Memory Health Check (Every 2 Weeks)

*The three memory levels referenced below are explained in [guides/03-memory.md](../guides/03-memory.md). Short version: Level 1 is Claude's built-in memory (no setup), Level 2 is a structured `docs/` folder, Level 3 is automatic notes plus a database. Most agents start at Level 1 or 2.*

At the start of each session, check when the last memory health check happened. If it's been 14 or more days, run a quick audit before starting work:

**If using Level 1 (built-in memory):**
1. Count total memories. If 25+, flag it.
2. Check for duplicates or near-duplicates.
3. Check for memories that contradict each other (business changed but old memory wasn't removed).
4. If the system is getting cluttered, propose upgrading to Level 2 (structured docs). Explain what it looks like and offer to do the migration.

**If using Level 2 (structured docs):**
1. Check file sizes. Flag anything over 150 lines and propose splitting.
2. Check dates in file headers. Flag anything not updated in 30+ days -- it might be stale.
3. Check for information that's repeated across files.
4. Verify the knowledge map still matches what actually exists in docs/.
5. Check if session documentation is taking up significant time each session. If so, propose Level 3 (automatic end-of-session notes).

**If using Level 3 (automatic notes + database):**
1. Check that automatic notes are being captured correctly.
2. Check for data bloat (old sessions that can be summarized and archived).
3. Verify the knowledge map still reflects reality.

Log the health check date in the session log. If changes are needed, propose them clearly: "Here's what I found, here's what I'd like to change, and here's why." Wait for approval before restructuring.

This is not optional. Memory that isn't maintained rots. The owner won't audit it. You do.
