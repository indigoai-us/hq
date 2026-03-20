---
title: Gas Town Refinery — Merge Queue and Conflict Handling
tags: ["gas-town", "coordination", "multi-agent", "distributed-systems", "agent-loop"]
created: 2026-03-20T03:30:00.000Z
updated: 2026-03-20T03:30:00.000Z
source: "https://github.com/steveyegge/gastown/blob/main/docs/glossary.md, https://deepwiki.com/steveyegge/gastown/1.2-quick-start-guide, https://medium.com/@jamiesonio/gastown-when-your-dev-team-runs-on-eventual-consistency-b400a1902a85, https://github.com/steveyegge/gastown/issues/1248"
confidence: 0.65
---

The Refinery uses sequential FIFO rebase-then-test to prevent conflicts; true semantic conflict resolution is not yet formally specified.

## What the Refinery Is

The Refinery is a dedicated **intelligent agent** (not a script) whose sole responsibility is managing the merge queue for a Rig. The glossary defines it as:

> "Manages the Merge Queue for a Rig. The Refinery intelligently merges changes from Polecats, handling conflicts and ensuring code quality before changes reach the main branch."

It is distinct from the Mayor (orchestrator) and from Polecats (workers). It operates as a queue processor between the two.

## Core Merge Pipeline

The Refinery processes one branch at a time in FIFO order:

```
git rebase → tests → git merge → git push main
```

1. Polecat finishes work, pushes branch, sends merge request to Refinery's inbox
2. Refinery dequeues one request at a time
3. Rebases polecat branch onto current `main`
4. Runs full test suite
5. If clean: merges to `main` and notifies the polecat
6. If conflicts or test failures: invokes `mol-polecat-conflict-resolve` sub-workflow

## Three Conflict Categories (Glossary)

The glossary acknowledges three distinct conflict types:

| Type | Description |
|---|---|
| **Textual conflicts** | Standard git conflict markers — two branches modified the same lines |
| **Semantic conflicts** | Logically contradictory changes that pass textual merge cleanly |
| **Merge conflicts** | Broad category encompassing both |

### Textual Conflicts — Handling

Sequential rebase is the primary defense. Since only one branch integrates at a time, most textual conflicts arise when a polecat's branch diverged from `main` while another polecat's work was landing. The Refinery rebases and, if conflicts remain, invokes the `mol-polecat-conflict-resolve` molecule — a LLM-assisted resolution sub-workflow — before re-running tests.

### Semantic Conflicts — Handling (Gap)

**This is the documented gap.** The Refinery glossary names semantic conflicts as a category it handles, but implementation specifics are not publicly documented. Issue [#1248](https://github.com/steveyegge/gastown/issues/1248) (February 2026, ROMANCER2 proposal) states:

> "gastown currently has no principled way to resolve these conflicts. The mayor breaks ties implicitly but there's no model for understanding WHY agents disagree or HOW to de-escalate."

In practice, semantic conflicts are detected indirectly via **test failures after a clean textual merge** — the tests catch the logical contradiction even though git saw no conflict. The Refinery then fails the merge and may re-queue or escalate to the Mayor.

## Structural Conflict Prevention

Gas Town's architecture minimizes conflicts before they reach the Refinery:

- **Isolated worktrees**: Each polecat gets its own git worktree — no shared working directories
- **Sequential integration**: Only one branch merges at a time — removes the "simultaneous write" problem
- **Task decomposition**: Mayor assigns non-overlapping tasks to polecats when possible

## Known Failure Modes

- Force-push to main recovery (5 force pushes observed in one DoltHub production session with Gas Town)
- Auto-merging failing tests into main when the conflict-resolve molecule over-approves
- Sequential throughput bottleneck: with 20–30 polecats, the Refinery can become a pipeline stall

## Open Work

The ROMANCER2 framework (issue #1248) proposes structured negotiation psychology for semantic conflict escalation, but as of early 2026 it is a feature proposal, not shipped behavior.
