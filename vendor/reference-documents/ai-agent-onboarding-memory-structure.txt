# Memory Structure Template

This template helps you organize your agent's memory. Start with Level 1. Your agent will tell you when it's time to move up -- it monitors its own memory health and will suggest upgrading when the current level isn't cutting it anymore.

For why memory matters and how the three levels work, see [guides/03-memory.md](../guides/03-memory.md).

---

## Level 1: Built-in Memory

No setup needed. Just tell your agent to remember things during your sessions:

- "Remember that our target audience is restaurant owners with 2-5 locations"
- "Remember that we never offer discounts more than 15%"
- "Remember that our brand voice is casual and direct, never corporate"

Claude Code stores these automatically. They persist across sessions.

**Good enough for:** Your first few weeks. Simple agents with a focused role. Agents that don't need a lot of historical context.

**Your agent will suggest upgrading when:** You have more than 25 memories and things are getting hard to find. Context is being repeated instead of organized. The agent needs to understand how different pieces connect.

---

## Level 2: Structured Docs Folder

Create this structure in your agent's project folder:

```
docs/
  KNOWLEDGE_MAP.md          -- Index of what's where (agent reads this first)
  business-overview.md       -- Who you are, what you do, customers, team
  current-priorities.md      -- What matters right now
  decisions-log.md           -- What you've decided and why
  session-log.md             -- Recent session summaries
```

### KNOWLEDGE_MAP.md (The Index)

```markdown
# Knowledge Map

## Core Context
business-overview.md:
  purpose: Company background, products, customers, team
  keywords: who we are, what we do, customers, market

current-priorities.md:
  purpose: Current focus areas and near-term goals
  keywords: priorities, this month, focus, goals

## Working History
decisions-log.md:
  purpose: Key decisions and reasoning
  keywords: decided, chose, why, because

session-log.md:
  purpose: Recent session summaries
  keywords: last session, recent, worked on
```

### business-overview.md

```markdown
---
summary: [2-3 sentence overview. Agent reads this first and often stops here.]
updated: [date]
---

## The Business
[What you do. Who you serve. How you're different.]

## Customers
[Who they are. What they need. Why they choose you.]

## Team
[Size. Key roles. Who does what.]

## Tools and Systems
[What you use to run the business. CRM, email, project management, etc.]
```

### current-priorities.md

```markdown
---
summary: [What the top 3 priorities are right now.]
updated: [date]
---

| Priority | Why | Status |
|----------|-----|--------|
| [Priority 1] | [Why this matters now] | [In progress / Blocked / Planning] |
| [Priority 2] | [Why this matters now] | [In progress / Blocked / Planning] |
| [Priority 3] | [Why this matters now] | [In progress / Blocked / Planning] |
```

### decisions-log.md

```markdown
---
summary: [Number] decisions logged. Key areas: [topics].
updated: [date]
---

| Date | Decision | Reasoning | Affects |
|------|----------|-----------|---------|
| [date] | [What you decided] | [Why] | [What it impacts] |
```

### session-log.md

```markdown
---
summary: Recent work sessions. Newest first.
updated: [date]
---

## [Date] -- [Brief topic]
- Worked on: [what]
- Decided: [key decisions]
- Next: [what's pending]
```

**Key rules:**
- Keep files short. Under 150 lines each. Split if they grow.
- Update after every session (or ask your agent to update them).
- Delete what's obsolete. Don't keep outdated information around.
- One fact lives in one place. Don't duplicate information across files.

**Good enough for:** Most agents doing ongoing work. Agents that need business context. Agents that handle multiple related tasks.

**Your agent will suggest upgrading when:** Session documentation is taking too long to do manually. You're managing multiple complex agents. The amount of information is outgrowing simple text files.

---

## Level 3: Advanced (Automatic Notes + Database)

When Level 2 isn't enough, consider:

**Automatic end-of-session notes** that capture each session without you doing it manually. At the end of every session, the agent automatically logs what happened, what was decided, and what's next.

**A database** for agents that accumulate a lot of structured data over time. Client records, project timelines, performance metrics, interaction history.

This level is for people who have been using agents for months and need industrial-strength memory. Your agent will suggest this when Level 2 starts feeling limiting. If you're reading this for the first time, you're not here yet. And that's perfectly fine.

---

## You Don't Need to Choose -- Your Agent Runs a Health Check

Every 2 weeks, your agent audits its own memory system at the start of a session. It checks for bloat, staleness, duplication, and whether the current level is still working. If something needs to change, it tells you what it found, what it recommends, and offers to do the work.

You'll hear things like:

- "We have 25+ memories and some are duplicated. I'd like to set up a structured docs folder. Here's what that looks like -- want me to do the migration?"
- "This business-overview file hit 180 lines. I'd like to split it into separate files for customers and team."
- "I'm spending 10 minutes on session notes each time. I can set up automatic notes that handle this in the background. Want me to?"

Trust the agent on this. It knows when its own system isn't working. Your job is to say yes or no, not to diagnose the problem.
