---
title: "Append-Only JSONL for Execution State"
category: hq-architecture-patterns
tags: ["agent-loop", "production-patterns", "observability", "autonomous-coding"]
source: "https://github.com/hassaans/ghq"
confidence: 0.5
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

## The Pattern

Store execution state as append-only JSONL files rather than mutable JSON. Each line records a state transition: skill started, skill completed, story blocked, loop ended. Full state is reconstructed by replaying the log.

Two files:
- `state.jsonl` — in-progress state transitions (append during execution)
- `history.jsonl` — completed loop summaries (one entry per finished run)

### Event Types

| Type | When |
|------|------|
| `loop_start` | Execution begins |
| `skill_start` | Sub-agent spawned |
| `skill_complete` | Skill succeeds (includes back-pressure results) |
| `skill_error` | Skill fails |
| `story_complete` | All skills in chain pass |
| `story_blocked` | Task fails after retry |
| `loop_end` | Execution finishes |

## Why This Matters for GHQ

GHQ's `/research-loop` and `/research` skills currently have no execution state. If a research session gets interrupted, there's no record of which queue items were processed, which failed, or how long each took. The `.research-log.jsonl` captures summaries but not the granular state transitions.

Benefits:
1. **Resumability**: Replay the log to find where execution stopped
2. **Observability**: `grep '"skill_error"' state.jsonl` instantly shows failures
3. **Debugging**: Full timeline of what happened, in order
4. **Metrics**: Duration per skill, error rates, blocked story patterns

## Design Principles

1. **Never edit, only append** — preserves full history
2. **JSONL format** — one object per line, easy to grep/tail/stream
3. **Minimal fields per entry** — only what changed
4. **Flat files only** — no nested state directories
