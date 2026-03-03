---
name: Full Stack
description: End-to-end feature delivery by chaining architect, backend, frontend, and review skills
---

# Full Stack

Composition skill that orchestrates end-to-end feature delivery.

This skill does not execute work directly. It declares dependencies
that /execute-task resolves into an ordered execution chain.

## Execution Order

1. **architect** — design the solution, define contracts
2. **database** — schema changes if needed (conditional)
3. **backend** — implement API / server logic if needed (conditional)
4. **frontend** — implement UI if needed (conditional)
5. **code-reviewer** — review all changes
6. **qa** — run tests, validate behavior

## Skill Chain

| Order | Skill | Condition |
|-------|-------|-----------|
| 1 | architect | always |
| 2 | database | task involves schema changes or migrations |
| 3 | backend | task involves API or server-side logic |
| 4 | frontend | task involves UI or client-side code |
| 5 | code-reviewer | always |
| 6 | qa | always |

## Handoff Protocol

Each skill in the chain receives a handoff JSON from the previous skill:

```json
{
  "from_skill": "architect",
  "to_skill": "backend",
  "summary": "what was done",
  "files_changed": [],
  "decisions": [],
  "back_pressure": { "tests": "pass", "types": "pass" }
}
```

## When to Use

- New features that span multiple layers
- Stories tagged as "full-stack" in the PRD
- Tasks where the scope is unclear (architect phase clarifies)
