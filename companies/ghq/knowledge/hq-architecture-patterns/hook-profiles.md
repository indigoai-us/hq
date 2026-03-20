---
title: "Hook Profiles: Runtime-Configurable Hook Sets"
category: hq-architecture-patterns
tags: ["hooks", "claude-code", "production-patterns", "configuration", "runtime-isolation"]
source: "https://github.com/coreyepstein/hq-starter-kit, https://code.claude.com/docs/en/hooks, https://claude-world.com/articles/hooks-development-guide/"
confidence: 0.85
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T06:00:00Z
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

## stdin Handling: PreToolUse vs PostToolUse

The gate script does **not** need to treat stdin differently based on hook type. Both hook types deliver a JSON blob via stdin — the gate either passes it through or discards it.

### Payload Differences (for inner hooks, not the gate)

| Field | PreToolUse | PostToolUse |
|-------|-----------|-------------|
| `tool_name` | ✅ | ✅ |
| `tool_input` | ✅ | ✅ |
| `tool_use_id` | ✅ | ✅ |
| `tool_response` | ❌ | ✅ (result of executed tool) |

`PostToolUse` stdin is larger because it includes `tool_response`. This doesn't affect the gate's logic — only the inner hook's parsing.

### Gate Stdin Patterns

**When skipping** (profile doesn't include this hook):
```bash
cat > /dev/null   # consume and discard stdin — do NOT leave it unread
exit 0
```

**When delegating** (pipe stdin through to inner hook):
```bash
INPUT=$(cat)
echo "$INPUT" | exec ./actual-hook.sh "$@"
```

Or simpler — if stdin is not read by the gate, `exec` inherits it:
```bash
# Check env vars first (don't read stdin yet)
if should_skip; then
  cat > /dev/null; exit 0
fi
exec ./actual-hook.sh "$@"  # stdin automatically inherited
```

### Why stdin Must Always Be Consumed

If a gate script exits without reading stdin, the pipe buffer fills and Claude Code's process blocks. Even a skip must drain stdin. The `cat > /dev/null` pattern is the safe idiom for discarding.

### Can't Block from PostToolUse

`PreToolUse` gates can block tool execution with `exit 2`. `PostToolUse` hooks cannot — the tool already ran. Gate scripts for PostToolUse hooks exit 0 regardless (they can only suppress observability side-effects like reindexing, not undo the tool's action).
