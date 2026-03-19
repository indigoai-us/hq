---
title: "Session Persistence via Thread Files"
category: hq-architecture-patterns
tags: ["context-management", "production-patterns", "checkpointing", "multi-session", "claude-code", "knowledge-management"]
source: "https://github.com/coreyepstein/hq-starter-kit, https://arxiv.org/html/2603.15566, https://deepwiki.com/rjmurillo/ai-agents/4.6-session-logs-and-handoff.md, https://arxiv.org/html/2508.00031v1"
confidence: 0.8
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T22:00:00Z
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

## Optimal GHQ Thread Schema

### Git State vs. Structured Thread Files

Git state alone is insufficient for a knowledge-first system because:
- Git tracks *what changed* but not *what was being researched or why*
- Curiosity queue progress (which items are in-flight, which searches were run) is not in git
- `qmd` index version matters: if the index has been rebuilt since the session, retrieved context differs
- Knowledge entries written mid-session may not yet reflect reindex state

Git is **necessary but not sufficient**. Thread files should *complement* git by capturing the cognitive state that git cannot.

### Recommended Thread Schema for GHQ

```json
{
  "id": "T-{YYYYMMDD}-{HHMMSS}-{slug}",
  "type": "full|auto",
  "created_at": "ISO8601",
  "git": {
    "branch": "string",
    "commit_start": "sha",
    "commit_current": "sha",
    "commits_made": ["sha1", "sha2"]
  },
  "knowledge": {
    "qmd_index_version": "string or commit sha of last reindex",
    "entries_written": ["knowledge/{category}/{slug}.md"],
    "entries_updated": ["knowledge/{category}/{slug}.md"]
  },
  "curiosity": {
    "items_researched": ["queue-item-id"],
    "items_in_flight": ["queue-item-id"],
    "items_queued": ["queue-item-id"]
  },
  "session": {
    "summary": "1-3 sentence human-readable recap",
    "files_touched": ["relative/path.md"],
    "next_steps": ["string"]
  }
}
```

### What Each Field Buys You

| Field | Value | Git Covers? |
|---|---|---|
| `git.commits_made` | Audit trail within session | Yes (via log) |
| `knowledge.qmd_index_version` | Reproducible retrieval context | No |
| `knowledge.entries_written` | Know what knowledge exists now vs before | Partially (git diff) |
| `curiosity.items_in_flight` | Avoid re-researching on resume | No |
| `curiosity.items_queued` | Preserve discovered follow-ups | No |
| `session.summary` | Human/agent orientation on resume | No |
| `session.next_steps` | Actionable handoff | No |

### When to Write a Thread File

- **Auto (PostToolUse hook)**: After every `git commit`, write a lightweight auto-checkpoint (git + summary only)
- **Manual (PreCompact hook)**: Before context compaction, write a full checkpoint with all knowledge and curiosity fields
- **Manual (/handoff command)**: When explicitly handing off to another session or agent

### qmd Index Version

The `qmd_index_version` field should be the git commit hash of the most recent `npx tsx tools/reindex.ts` run (or a timestamp if reindex doesn't commit). This lets a resuming session detect whether the knowledge base has been modified since the thread was written, and re-run queries if needed.

### Prior Art

- **Lore** (arxiv 2603.15566): Encodes decision context into git commit messages via trailers. Pure git approach — but loses non-committed knowledge state.
- **Git Context Controller**: Manages intra-session agent working memory with git-inspired COMMIT/BRANCH operations. Complements thread files; GCC is for within-session scratchpad, threads are for between-session handoff.
- **HANDOFF.md pattern** (rjmurillo/ai-agents): Branch-scoped read-only context docs retained until merge. Simpler but loses curiosity/knowledge dimensions.
