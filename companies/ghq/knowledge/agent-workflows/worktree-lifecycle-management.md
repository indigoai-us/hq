---
title: "Worktree Lifecycle Management for Parallel Agent Loops"
category: agent-workflows
tags: ["agent-loop", "runtime-isolation", "production-patterns", "autonomous-coding", "multi-agent"]
source: https://github.com/linrswa/ralph-in-claude, https://devcenter.upsun.com/posts/git-worktrees-for-parallel-ai-coding-agents/, https://github.com/subsy/ralph-tui, https://code.claude.com/docs/en/common-workflows, https://github.com/agrimsingh/ralph-wiggum-cursor
confidence: 0.8
created_at: 2026-03-20T12:00:00Z
updated_at: 2026-03-20T12:00:00Z
---

How Ralph-style parallel loops create, assign, and clean up git worktrees per worker — including wave batching and operational pitfalls.

## The Core Pattern

Each independent worker in a multi-agent Ralph loop gets its own git worktree: a separate checkout of the repo pointing at the same `.git` directory but on a dedicated branch. This provides filesystem isolation without a full clone.

```
.worktrees/
  feature-A/    ← worker A's isolated checkout (branch: feature/A)
  feature-B/    ← worker B's isolated checkout (branch: feature/B)
  feature-C/    ← worker C's isolated checkout (branch: feature/C)
```

## Lifecycle Phases

### 1. Creation

The dispatcher (orchestrator) creates worktrees from the feature branch HEAD **before** launching workers, ensuring each worker starts from the same state:

```bash
git worktree add .worktrees/worker-A -b worker/A HEAD
git worktree add .worktrees/worker-B -b worker/B HEAD
```

Community tools like `agentree`, `worktree-cli`, and `git-worktree-runner` automate this with extras like `.env` copying and `npm install` execution.

### 2. Mode Selection: Direct vs. Worktree

Implementations like `ralph-in-claude` use two modes based on wave size:

| Mode | When | Behavior |
|------|------|----------|
| **Direct** | Single-story wave | Worker commits directly to the feature branch |
| **Worktree** | Multi-story wave | Each worker gets an isolated worktree; dispatcher merges afterward |

This avoids worktree overhead for single-agent work.

### 3. Wave Batching (DAG-Aware)

Workers aren't launched all at once — they're batched into **waves** based on dependency order:

1. **DAG construction** — stories/tasks declare `dependsOn` edges, forming execution tiers
2. **Wave batching** — tasks with no blocking dependencies run in parallel (default max: 5 workers)
3. **Sequential waves** — each wave completes and merges before the next begins, so downstream tasks see upstream changes

This balances parallelism with correctness.

### 4. Cleanup

**Auto-cleanup (Claude Code built-in):** On worktree session exit, Claude Code checks for uncommitted modifications. If the worktree has no uncommitted changes and no new commits, it automatically deletes the directory and branch. Otherwise it persists for review.

**Manual cleanup:**
```bash
git worktree remove .worktrees/worker-A
git worktree prune   # removes stale references
```

**Hook-based cleanup (non-git VCS):** Claude Code's `WorktreeRemove` hook event provides custom cleanup — the hook receives a JSON payload with the worktree name and handles teardown.

## Operational Challenges

| Problem | Cause | Mitigation |
|---------|-------|------------|
| Dependency bloat | Each worktree needs its own `npm install` | Use shared `node_modules` symlink or pnpm workspaces |
| Port conflicts | Parallel dev servers default to same port | Pass `PORT` env var per worker |
| Disk accumulation | Forgotten worktrees from crashed agents | `git worktree list` + `git worktree prune` periodically |
| Database races | Worktrees share local database | Use separate DB schemas or test containers per worker |
| `.env` copying | New worktrees don't inherit environment | Automate with `worktree-cli` or custom hook |

Incident.io reports running 4–5 parallel agents routinely; disk and port management are the main operational costs at that scale.

## Merge Strategy

After workers complete, integration runs **sequentially** (not simultaneously) to avoid compounding conflicts:

```
Worker A done → merge to main branch
Worker B done → merge (resolve conflicts if any)
Worker C done → merge
                ↓
        Full build + test validation
```

Sequential merging with AI-assisted conflict resolution on hotspot files (routes, configs, registries) is the recommended pattern.

## Relationship to Ralph Multi-Agent Entry

This entry covers the **worktree mechanics**. The broader multi-agent coordination architecture (planner/worker/integrator tiers, contract-first design) is in `ai-agents/ralph-loop-multi-agent-orchestration.md`.
