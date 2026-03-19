---
title: "Hook Profiles: Runtime-Configurable Hook Sets"
category: hq-architecture-patterns
tags: ["hooks", "claude-code", "production-patterns", "configuration", "runtime-isolation"]
source: "https://github.com/coreyepstein/hq-starter-kit"
confidence: 0.5
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

## The Pattern

Instead of all hooks firing unconditionally, route every hook through a **gate script** that checks environment variables before delegating to the actual hook.

```
settings.json → hook-gate.sh <hook-id> <actual-hook.sh>
                    ↓
            Check HQ_HOOK_PROFILE (minimal|standard|strict)
            Check HQ_DISABLED_HOOKS (comma-separated IDs)
                    ↓
            Run or skip the actual hook
```

### Profiles

- **minimal**: Safety-critical hooks only (secret detection, path guards)
- **standard**: All minimal + observability hooks (checkpoint triggers, reindex)
- **strict**: All standard + quality gates (reserved for expansion)

### Per-Hook Override

`HQ_DISABLED_HOOKS=auto-reindex,capture-learnings` disables specific hooks regardless of profile.

## Why This Matters for GHQ

GHQ currently has 4 hooks (UserPromptSubmit, PostToolUse, PreCompact, Stop). All fire unconditionally. As hooks grow, this creates problems:

1. **Cost**: The UserPromptSubmit knowledge consultation runs a qmd query on every prompt — unnecessary for quick questions
2. **Speed**: Hook overhead accumulates as more hooks are added
3. **Debugging**: When a hook misfires, you can't easily isolate which one without editing settings.json
4. **Context**: The Stop hook's `/learn` nudge is useful for substantive sessions but noisy for quick tasks

A gate script would let us run `HQ_HOOK_PROFILE=minimal claude` for quick tasks and keep the full pipeline for deep work sessions.

## Implementation Notes

The hq-starter-kit implementation uses POSIX-compatible `case` statements for profile membership checks — no arrays or associative arrays needed. The gate script reads stdin and discards it when skipping (hooks expect to consume stdin). Exit code 0 means "skip" (pass-through to Claude Code).
