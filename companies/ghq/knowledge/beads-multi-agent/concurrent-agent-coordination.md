---
title: "Multi-Agent Coordination in Beads: Claims, Conflicts, and Isolation"
category: beads-multi-agent
tags: ["ai-agents", "coordination", "distributed-systems", "task-management", "multi-agent-systems", "dolt", "conflict-resolution"]
source: "https://github.com/steveyegge/beads, https://deepwiki.com/steveyegge/beads/8.2-merge-driver, https://docs.dolthub.com/concepts/dolt/git/conflicts, https://github.com/steveyegge/beads/blob/main/docs/FAQ.md"
confidence: 0.85
created_at: "2026-03-20T00:00:00Z"
updated_at: "2026-03-20T22:33:19Z"
---

Beads is designed from the ground up for multi-agent concurrent access. Several mechanisms prevent conflicts:

## Atomic Claims

`bd update <id> --claim` atomically assigns a task to an agent. This prevents race conditions where two agents pick up the same work. The claim operation is atomic at the database level.

## Hash-Based ID Generation

Sequential IDs (bd-1, bd-2) cause merge conflicts when multiple agents create issues simultaneously. Beads uses content-hashed UUIDs instead, making concurrent creation collision-free without central coordination.

## Dolt Merge Semantics

Dolt provides cell-level merge — if two agents modify different fields of the same issue, both changes merge cleanly. Only true conflicts (same cell, different values) require resolution.

## Agent Isolation via Wisps

Wisps (ephemeral molecules) are local-only and never sync. Each agent can explore solutions independently without polluting the shared state. Only final results get committed via `bd mol squash`.

## Readiness Calculation

`bd ready` traverses the dependency graph to surface only unblocked work. Multiple agents querying `bd ready` see the same set of available tasks, then use atomic claims to divide work.

## Conflict Resolution: Same-Cell Edits

When two agents modify the **same cell** (same row + column), resolution depends on the backend:

### Git/JSONL backend — Custom 3-way merge driver

Beads registers a custom merge driver via `.gitattributes` (`merge=beads`) that applies field-specific rules:

| Field type | Resolution strategy |
|---|---|
| Scalar (title, description) | Last-write-wins (LWW) based on `updated_at` timestamp |
| Arrays (labels, dependencies) | Union merge with deduplication |
| Status | Priority order: `closed` > `in_progress` > `open` |
| Priority | Higher severity wins: P0 > P1 > P2 |

### Dolt backend — Native cell-level conflict tables

True conflicts (same cell, different values on two branches) are stored in `dolt_conflicts_<tablename>` system tables, not surfaced as text markers. Three resolution strategies:

1. **`ours`** — keep the current branch's value automatically
2. **`theirs`** — keep the merged branch's value automatically
3. **Manual** — edit the conflicted row directly, then delete from `dolt_conflicts_<tablename>` to mark resolved

Use `bd vc conflicts` to list any unresolved conflicts after a pull or merge.

### Prevention is preferred

Because same-cell conflicts require manual triage, the recommended pattern is prevention:

- Claim before modifying: `bd update <id> --claim`
- Query by assignee: `bd ready --assignee <agent-name>`
- Different agents own different issues; cell-level collisions should be rare in a well-structured workflow.
