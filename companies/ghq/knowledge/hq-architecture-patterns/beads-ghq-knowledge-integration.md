---
title: "Beads–GHQ Knowledge Integration Patterns"
category: hq-architecture-patterns
tags: ["knowledge-management", "task-management", "production-patterns", "agent-memory", "hooks"]
source: "https://zbrain.ai/knowledge-graphs-for-agentic-ai/, https://neo4j.com/blog/developer/graphiti-knowledge-graph-memory/, https://arxiv.org/abs/2501.13956, https://thenewstack.io/agentic-knowledge-base-patterns/"
confidence: 0.75
created_at: "2026-03-20T00:00:00Z"
updated_at: "2026-03-20T00:00:00Z"
---

Beads (task domain) and GHQ (knowledge domain) are complementary systems that can be wired together without modifying either codebase.

## Why They Fit Together

Beads and GHQ share the same philosophical root: persistent, structured memory that accumulates through use. Beads stores *what to do and what was done*; GHQ stores *what was learned*. The natural gap is that task outcomes rarely become knowledge automatically — they decay in compaction summaries or disappear when projects close.

## Integration Patterns

### 1. Compaction → Knowledge Promotion

When `bd compact --analyze --json` produces agent-written summaries of closed issues, those summaries contain distilled insights that belong in GHQ. The workflow:

```bash
# After compacting a closed molecule
bd compact --analyze --json | jq '.issues[].summary' \
  | ./companies/ghq/tools/ask-claude.sh "Is there a reusable insight here? If so, produce a knowledge entry draft."
```

This is the highest-value path because compaction already forces the agent to synthesize "why did we close this / what was the resolution" — exactly the format GHQ wants.

### 2. /learn Scanning bd Closed Tasks

The `/learn` command can be extended (or used manually) to pull recent bd completions as a learning source:

```bash
bd log --closed --since "7 days ago" --json \
  | ./companies/ghq/tools/ask-claude.sh "Distill reusable patterns from these completed tasks"
```

This treats bd's closed-task history as a session artifact analogous to conversation history — and applies the same reflection loop.

### 3. Knowledge Refs in Task Bodies

Without any bd code changes, agents can embed `qmd://` links in task bodies or descriptions:

```
See: qmd://ghq/agent-architectures/react-pattern
Blocked on understanding: qmd://ghq/beads-workflows/molecules-and-wisps
```

At task pickup, the agent sees these refs and can run `qmd query` to pre-load relevant context before starting work. This is a lightweight convention requiring zero tooling.

### 4. Knowledge-Gap Gates

A special pattern where a task is gated on a *knowledge entry existing* rather than an external system event. Create a standard gate issue with a `knowledge_gap` label:

```bash
bd add "Research: LangGraph reducer semantics" --type gate --label knowledge_gap
bd dep add bd-feature-xyz.3 bd-gate-id   # blocks the implementation task
```

The agent's `bd ready` check surfaces the gate first, forcing the research step before execution. When the qmd entry is written, the agent closes the gate manually.

### 5. Bidirectional Frontmatter Links

Knowledge entries can record which tasks produced them, establishing provenance:

```yaml
---
title: "Some Insight"
bd_tasks: ["bd-a3f8", "bd-b2c1"]  # tasks that generated this knowledge
---
```

This supports future queries like "what tasks have we done in the area of X?" by scanning knowledge entry metadata rather than re-reading all of bd.

## Implementation Tiers

| Tier | Effort | What It Enables |
|------|--------|-----------------|
| **Convention** | Zero — just naming | `qmd://` refs in task bodies; `bd_tasks` in frontmatter |
| **Shell glue** | 1-2 scripts | `/learn` scanning `bd log`; compaction → knowledge pipeline |
| **Hook wiring** | Hook config | Auto-run qmd at `bd update --claim`; auto-queue gaps on task creation |
| **MCP bridge** | Medium | bd and qmd share a single query interface; gates check knowledge existence |

The convention tier costs nothing and delivers most of the value. Start there.

## Key Insight

The compaction lifecycle already does the hard work: an agent writes a structured summary capturing causality, outcome, and linkage. That summary is one `ask-claude.sh` call away from becoming a GHQ knowledge entry. The bottleneck is the trigger, not the transformation.
