---
title: "Curiosity Queue Source Enum Extensibility"
category: ghq-core
tags: ["cli", "agent-tooling", "configuration", "production-patterns"]
source: "web research"
confidence: 0.75
created_at: "2026-03-24T00:00:00Z"
updated_at: "2026-03-24T00:00:00Z"
---

GHQ's queue-curiosity.ts uses a closed enum for source types; new agent roles should map to existing values rather than expanding the enum.

## Current Valid Sources

| Source               | When to Use                                             |
|----------------------|---------------------------------------------------------|
| `user_interaction`   | User explicitly asked a question or raised a topic      |
| `outcome_gap`        | Expected behavior didn't match actual (observation)     |
| `knowledge_gap`      | Agent detected missing knowledge during a task          |
| `conversation_insight` | Insight emerged organically from conversation         |
| `research_followup`  | New question spawned during research of another item    |
| `trend_detection`    | Pattern noticed across multiple observations            |

## The `agent_review` Problem

Agent templates (e.g., reviewer agents) attempted `--source agent_review`, which is not in the valid enum. The CLI correctly rejects it. The question: extend the enum, or map to existing values?

## Recommendation: Map, Don't Extend

**Use existing sources.** Each current value describes a *cognitive origin* (how the question arose), not a *role* (who filed it). A reviewer agent's curiosity items naturally map:

- Reviewer notices code doesn't match expectations → `outcome_gap`
- Reviewer identifies missing documentation → `knowledge_gap`
- Reviewer sees a pattern across PRs → `trend_detection`
- Follow-up from prior research → `research_followup`

Adding role-specific sources (`agent_review`, `agent_deploy`, `agent_test`) would conflate origin-type with caller-identity, leading to an unbounded enum as new agent roles are added.

## When to Extend the Enum

Only add a new source when it represents a genuinely new *cognitive origin* that no existing value captures. The test: "Would this source be useful regardless of which agent role filed it?" If yes, it may warrant addition. If it's only meaningful for one role, use metadata instead.

## Alternative: Metadata Field

If tracking the filing agent's role matters for analytics, add an optional `--filed-by <role>` flag that stores alongside the item without polluting the source taxonomy. This keeps source as a clean, orthogonal dimension.

## Design Principle

The current enum follows the **closed enum** pattern — a small, stable set that rarely changes. This is appropriate here because:

- Source types describe a fixed taxonomy of cognitive origins
- Consumers (research pipeline, analytics) switch on source values
- Extending requires updating validation code, not just data

Per API design best practices, closed enums work well when the API owner controls all values and they don't depend on external interfaces. Open/extensible enums (e.g., OpenAPI's `x-extensible-enum`) suit cases where values grow with external integrations — not applicable here.

## Action Items for GHQ

1. **Agent templates**: Use `outcome_gap` or `knowledge_gap` as default source (context-dependent)
2. **Template docs**: Document which source to use for each agent pattern
3. **Consider `--filed-by`**: Optional metadata for caller identity tracking

## Sources

- [Enums in OpenAPI best practices — Speakeasy](https://www.speakeasy.com/openapi/schemas/enums)
- [Extensible enumerations — OAI/OpenAPI-Specification #1552](https://github.com/OAI/OpenAPI-Specification/issues/1552)
- [Should your API use enums? — Medium/CodeX](https://medium.com/codex/should-your-api-use-enums-340a6b51d6c3)
- [Enums in API design — Tyk](https://tyk.io/blog/api-design-guidance-enums/)
