---
title: "Planning and Replanning Patterns"
category: agent-autonomy
tags: ["planning", "replanning", "goal-decomposition", "task-management", "agent-loop"]
source: blueprint
confidence: 0.5
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

Plans are hypotheses about how to reach a goal. Good autonomous agents treat them as living documents, not scripts.

## Planning Anti-Patterns

- **Over-planning**: Spending 80% of context on planning, 20% executing. The plan becomes stale before execution starts.
- **Plan rigidity**: Following the original plan even when evidence contradicts it. Tests fail but the agent keeps implementing the next feature.
- **No plan at all**: Jumping straight into code without understanding the goal. Works for trivial tasks, fails for anything multi-step.

## Replanning Triggers

An agent should reassess its plan when:
1. **A step fails unexpectedly** — the assumption behind the plan was wrong
2. **New information appears** — test output reveals a dependency not accounted for
3. **Resource budget is running low** — context window filling, time limit approaching
4. **The user redirects** — explicit course correction

## GHQ Implementation

GHQ can implement planning through:
- **TodoWrite tool**: Claude Code's built-in task tracking for in-session planning
- **Knowledge-informed planning**: `qmd query` before planning to surface relevant context
- **Subprocess delegation**: Break plan into independent sub-tasks, run via `ask-claude.sh`
- **Checkpoint pattern**: After each major step, summarize progress and reassess remaining plan

The key insight for GHQ: planning should be knowledge-first. Before decomposing a goal, search the knowledge base for relevant patterns, past failures, and domain context. This prevents repeating mistakes and leverages accumulated intelligence.
