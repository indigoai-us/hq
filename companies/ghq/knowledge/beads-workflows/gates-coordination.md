---
title: "Beads Gates: Async Coordination Primitives"
tags: ["task-management", "coordination", "human-in-the-loop", "agent-loop", "distributed-systems"]
category: beads-workflows
created: "2026-03-20T00:00:00Z"
updated: "2026-03-20T00:00:00Z"
source: "https://deepwiki.com/steveyegge/beads/9.2-claude-plugin-and-editor-integration, https://steveyegge.github.io/beads/, https://betterstack.com/community/guides/ai/beads-issue-tracker-ai-agents/"
confidence: 0.72
---

Gates are special Beads issues that block workflow progress until an external condition is satisfied.

## What is a Gate?

A gate is an issue with `issue_type: "gate"` and gate-specific fields. Unlike regular work items, gates are not assigned to workers—they exist purely as synchronization points. Other issues declare `waits-for` or `blocks` dependencies on gates. When a gate clears, dependent issues become unblocked and appear in `bd ready` output.

### Gate Schema Fields

| Field | Description |
|-------|-------------|
| `issue_type` | Always `"gate"` |
| `await_type` | One of: `timer`, `gh:run`, `gh:pr`, `human`, `mail` |
| `await_id` | Condition identifier — meaning depends on `await_type` |
| `timeout` | Optional deadline for the wait |
| `waiters` | Issues that are blocked on this gate |

## Gate Types

### `timer`
Waits until a specific timestamp passes.

- `await_id`: ISO timestamp
- Clears when: `now >= await_id`
- Use case: soak periods between deployments, release embargoes, scheduled notifications

### `gh:run`
Waits for a GitHub Actions workflow run to complete successfully.

- `await_id`: Numeric run ID **or** workflow name (beads will query GitHub API for the most recent run)
- Clears when: run status is `"success"`
- Use case: waiting for CI/CD pipeline, integration tests, deployment workflows

### `gh:pr`
Waits for a pull request to be merged.

- `await_id`: PR number or URL
- Clears when: `merged_at` is not null
- Use case: wait for code review approval before downstream steps proceed

### `human`
Waits for explicit manual approval.

- Clears when: `bd gate approve <gate-id>` is executed
- Use case: go/no-go decisions, manual sign-off, compliance checkpoints

### `mail`
Waits for an email reply to a thread.

- `await_id`: Email thread identifier
- Clears when: a reply is detected by polling the email system
- Use case: external stakeholder approvals, async review by non-technical parties

## How Agents Interact with Gates

Gates are **not polled by blocking loops** — agents move on to other work and periodically check whether gated workflows can proceed:

```bash
# Find molecules currently waiting on gates
bd ready --gated

# Approve a human gate
bd gate approve <gate-id>

# Check status of a gate (machine-checkable types)
bd gate check <gate-id>
```

`bd close` enforces gate satisfaction before closing machine-checkable gates (`gh:pr`, `gh:run`, `timer`, `bead`) — the agent cannot close downstream issues until the gate condition is actually met.

## Integration with Molecules

Gates are typically created and consumed inside molecule workflows. A molecule step creates a gate issue and the next step declares `waits-for` on it:

```
beads-release molecule (example):
  Step 1: Run tests → create gh:run gate (wait_id = workflow run ID)
  Step 2: waits-for Step 1 gate → deploy to staging
  Step 3: Create timer gate (24-hour soak period)
  Step 4: waits-for Step 3 gate → promote to production
  Step 5: Create human gate (final sign-off)
  Step 6: waits-for Step 5 gate → close release
```

Gates can also be created manually via CLI for ad-hoc workflow coordination.

## Fanout Pattern

The `waits-for` dependency type enables **fanout gates**: a parent issue waits for dynamically-spawned child issues. This allows a single gate to aggregate the completion of multiple parallel sub-tasks — the gate clears only when all children complete.

## External System Integration

| Gate type | External system | Auth mechanism |
|-----------|----------------|----------------|
| `gh:run` | GitHub Actions API | GitHub token in environment |
| `gh:pr` | GitHub REST API | GitHub token in environment |
| `mail` | Email system | Configured mail polling |
| `human` / `timer` | None (local) | — |
