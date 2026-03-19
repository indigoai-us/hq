---
title: "Session Persistence via Thread Files"
category: hq-architecture-patterns
tags: ["context-management", "production-patterns", "checkpointing", "multi-session", "claude-code"]
source: "https://github.com/coreyepstein/hq-starter-kit"
confidence: 0.5
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

## The Pattern

Persist session state as JSON files in a `workspace/threads/` directory. Each file captures git state, conversation summary, files touched, and next steps. Two weight classes:

### Full Checkpoint (manual, via command)

Captures complete state: initial + current commit, all commits made, worker state, knowledge repo states, next steps. Created by explicit `/checkpoint` or `/handoff` commands.

### Auto-Checkpoint (hook-triggered, lightweight)

Minimal state: current commit, conversation summary, files touched, trigger type. Created automatically by PostToolUse hooks after git commits or file generation. Auto-purged after 14 days.

### Thread ID Convention

`T-{YYYYMMDD}-{HHMMSS}-{slug}` for full checkpoints, `T-{YYYYMMDD}-{HHMMSS}-auto-{slug}` for auto-checkpoints.

## Why This Matters for GHQ

GHQ v0.2 has no session persistence mechanism. When context compacts or a session ends, state is lost. The PreCompact hook runs `capture-learnings.sh` but this captures knowledge, not session state (what was in progress, what's next).

Key gaps this fills:
1. **Session continuity**: New sessions can read the last thread file to understand where things left off
2. **Audit trail**: Which files were changed, which commits were made, in what order
3. **Multi-session projects**: Research loops spanning multiple sessions need state handoff
4. **PreCompact safety net**: Before compaction destroys context, a thread file preserves the recoverable minimum

## Adaptation for GHQ

GHQ's knowledge-first design means threads should probably live alongside knowledge state, not just git state. A GHQ thread might include: active curiosity queue items being researched, qmd index version, knowledge entries written during the session.
