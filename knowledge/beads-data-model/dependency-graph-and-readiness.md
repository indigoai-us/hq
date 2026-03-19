---
title: "Beads Dependency Graph: Types, Traversal, and Readiness"
category: beads-data-model
tags: ["graph-database", "task-management", "ai-agents", "planning", "goal-decomposition"]
source: "https://github.com/steveyegge/beads"
confidence: 0.5
created_at: "2026-03-20T00:00:00Z"
updated_at: "2026-03-20T00:00:00Z"
---

The dependency graph is the core data structure that makes Beads more than a flat issue list. Tasks connect via typed edges that control execution order and readiness.

## Dependency Types

| Type | Semantics | Affects Readiness |
|------|-----------|-------------------|
| `blocks` | X must close before Y starts | Yes |
| `parent-child` | Hierarchical; children inherit blockage | Yes |
| `related` | Soft reference for context | No |
| `discovered-from` | Found during parent work | No |

## Readiness Algorithm

`bd ready` traverses blocking dependencies recursively: an issue is ready only if **no** blocking issues remain open. Children inherit their parent's blockage status. This means an agent can always ask "what can I work on next?" and get a correct answer without understanding the full graph.

## Hierarchical IDs

Tasks use dot-notation for hierarchy: `bd-a3f8` (epic) → `bd-a3f8.1` (task) → `bd-a3f8.1.1` (subtask). This encodes the parent-child relationship directly in the ID, making it human-readable and agent-parseable.

## Status Flow

`open` → `in_progress` → `closed`, with variant states: `blocked`, `deferred`, `pinned`, `hooked`. `tombstone` is used for soft-deletes. Gates are special issues that block on external conditions (CI pass, PR merge, timer, manual approval).

## Graph Operations

- `bd dep add <child> <parent>` — establish relationship
- `bd mol bond A B` — connect separate work graphs
- `bd show <id>` — display full task details with dependency context
