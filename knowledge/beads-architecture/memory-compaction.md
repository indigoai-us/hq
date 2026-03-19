---
title: "Beads Memory Compaction — Algorithm, Preservation Rules, and Token Budget"
category: beads-architecture
tags: ["context-management", "token-budget", "summarization", "long-horizon-tasks", "memory-decay"]
source: "https://github.com/steveyegge/beads, https://github.com/steveyegge/beads/blob/main/docs/FAQ.md, https://ianbull.com/posts/beads/, https://mcpmarket.com/server/beads"
confidence: 0.72
created_at: "2026-03-20T00:00:00Z"
updated_at: "2026-03-20T00:00:00Z"
---

Beads compaction replaces closed-issue content with AI-generated summaries to manage agent token budgets over long-horizon projects.

## Problem: Token Budget Drain from History

As tasks accumulate, every `bd` query returns older closed issues too. Without compaction, a project history of hundreds of closed issues would burn tokens on completed work that no longer informs current execution. Agents start strong but degrade after ~50 context messages when forced to track too much history.

## Eligibility Criteria

Issues become compaction candidates when:
- **Status**: Closed (not open, in-progress, or blocked)
- **Age**: Closed for 30+ days (default threshold; `--days N` to override, e.g., `--days 90`)

Only completed, stable work is compacted — the buffer prevents premature loss of recently closed context.

## Two-Phase Workflow (Agent-Driven)

The preferred compaction mode gives the agent full control over summary quality:

**Phase 1 — Analyze:**
```bash
bd compact --analyze --json
# or
bd admin compact --analyze --json
```
Returns eligible issues with full content as JSON. The agent reads each candidate and decides what to preserve.

**Phase 2 — Apply:**
```bash
bd compact --apply --id bd-42 --summary summary.txt
# or
bd admin compact --apply --id bd-42 --summary summary.txt
```
The agent writes its own summary to `summary.txt`, then calls `--apply`. The detailed content is replaced with the agent-generated summary; the issue record itself is retained.

## Legacy Auto-Compact Mode

For bulk automated compaction (less control over summary quality):
```bash
bd admin compact --dry-run --all    # preview candidates
bd admin compact --all              # auto-compact all eligible
bd admin compact --days 90          # compact issues closed 90+ days ago
```
In auto mode, Beads itself generates summaries via an LLM call — the agent doesn't review them individually.

## What Gets Preserved

| Field | Kept |
|-------|------|
| Issue ID (e.g., `bd-a3f8`) | Yes |
| Title | Yes |
| Status | Yes |
| Dependency links (`blocks`, `waits-for`, etc.) | Yes |
| Created / closed timestamps | Yes |
| Tags / labels | Yes |
| AI-generated summary | Yes (replaces original body) |

## What Gets Discarded

| Content | Discarded |
|---------|-----------|
| Full issue description | Yes |
| Comments and discussion | Yes |
| Work log entries | Yes |
| Intermediate state history | Yes |

The issue record persists in the Dolt database; only the body content is replaced with the summary. Dependency graph integrity is never broken by compaction.

## Token Budget Effect

After compaction:
- `bd ready --json` and other queries return compact issues with summaries instead of full bodies
- Database size shrinks = fewer tokens per context load
- Vague future work and completed work stop consuming agent context budget
- `dolt gc` (run after compaction) frees actual disk storage: `cd .beads/dolt && dolt gc`

## Maintenance Tooling

```bash
bd doctor           # health check — detects corrupt/orphaned issues
bd doctor --fix     # auto-repairs detected problems
bd cleanup          # archives closed tasks (distinct from compaction)
```

## "Agentic Memory Decay" Philosophy

Beads frames compaction as semantic memory decay — mimicking how human memory retains meaning while losing verbatim detail. The algorithm prioritizes:
1. Causality (why did we close this?)
2. Outcome (what was the resolution?)
3. Linkage (what did this unblock or depend on?)

Fine-grained execution details (exact file edits, intermediate commands) are the primary discard targets.
