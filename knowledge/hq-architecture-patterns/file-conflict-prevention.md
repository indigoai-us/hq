---
title: "hq-starter-kit File Conflict Prevention: Sequential Execution, Not File Locking"
category: hq-architecture-patterns
tags: ["coordination", "autonomous-coding", "production-patterns", "agent-loop", "prd-driven-development"]
source: "https://github.com/coreyepstein/hq-starter-kit, https://www.nrmitchi.com/2025/10/using-git-worktrees-for-multi-feature-development-with-ai-agents/, https://github.com/jayminwest/overstory"
confidence: 0.85
created_at: 2026-03-20T08:00:00Z
updated_at: 2026-03-20T08:00:00Z
---

hq-starter-kit prevents file conflicts through **sequential story execution**, not file-level locking — there is no `orchestrator.yaml` with `hard_block`/`soft_block`/`read_only_fallback` modes.

## What hq-starter-kit Actually Does

The [hq-starter-kit](https://github.com/coreyepstein/hq-starter-kit) uses the Ralph methodology: a sequential loop that picks **one story at a time** from a PRD, spawns a single Claude session, validates (tests/lint), and only then advances to the next story. There is no parallel story execution baked into the base framework.

Key files:
- `workers/registry.yaml` — declarative index of worker types and metadata (not orchestration config)
- `projects/*/prd.json` — PRD with stories and a `passes: boolean` field per story
- `knowledge/Ralph/` — 11 methodology documents explaining the loop

The terms `hard_block`, `soft_block`, and `read_only_fallback` do **not appear in the hq-starter-kit codebase** (confirmed via GitHub code search). They were hypothetical labels for a locking system that doesn't exist there.

## Why Sequential Solves Most Conflicts

By running one story at a time per worker, conflicts between stories simply cannot happen at the filesystem level — there are never two agents writing to the same worktree simultaneously. The `passes: false` state in the PRD ensures a story only completes when tests/lint/typecheck actually pass.

```
for story in prd.json where passes == false:
  spawn claude session with story
  run validation (tests, lint, typecheck)
  if passing → mark passes: true
  else → retry up to 2x, then skip
```

## When Parallelism IS Needed: Worktree Isolation

When running multiple hq-starter-kit workers in parallel (e.g., one worker per independent domain), the conflict prevention strategy is **git worktree isolation** — each worker gets a separate git worktree pointing at the same `.git` directory. No file-level locking is needed because agents literally write to different directories.

```
.worktrees/
  worker-frontend/    ← Worker A writes here
  worker-backend/     ← Worker B writes here
  worker-docs/        ← Worker C writes here
```

File conflicts are deferred to **merge time**, where they're handled sequentially by an integration agent.

## Industry Patterns for In-Place File Locking

Systems that DO use explicit file locking (rather than worktree isolation) typically implement:

| Approach | Mechanism | Tradeoff |
|----------|-----------|----------|
| Lockfile per resource | Agent creates `{file}.lock` before editing | Simple; deadlock risk if agent crashes |
| Directory ownership | Each agent owns a subtree; others read-only | Scales well; requires upfront ownership planning |
| Merge queue | All writes queued; processed sequentially | No conflicts; throughput bottleneck |
| SQLite coordination | Central DB tracks who holds which file | Robust; adds infrastructure complexity |

Overstory (jayminwest) uses a SQLite mail system for coordination. Worktree isolation (git worktrees) has become the dominant approach for Claude Code multi-agent systems in 2025–2026, explicitly replacing file-locking approaches that historically caused deadlocks.

## Practical Implication for GHQ

GHQ's multi-agent patterns should default to **worktree isolation** rather than in-place file locking. When spawning parallel agents via `scripts/ask-claude.sh`, assign each to a separate git worktree with a scoped task that doesn't overlap other worktrees' ownership.
