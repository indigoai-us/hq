---
title: "Testing WorktreeCreate Hooks via Mock JSON Stdin"
category: tools
tags: ["hooks", "claude-code", "testing", "shell-scripting"]
source: "https://code.claude.com/docs/en/hooks, https://github.com/anthropics/claude-code/issues/36205, https://github.com/anthropics/claude-code/issues/27467"
confidence: 0.8
created_at: 2026-03-25T00:00:00Z
updated_at: 2026-03-25T00:00:00Z
---

WorktreeCreate hooks can be tested directly by piping mock JSON to stdin — no end-to-end `claude --worktree` run required.

## Direct Testing Strategy

WorktreeCreate hooks receive JSON on stdin and must print the worktree path on stdout. This makes them testable with a simple pipe:

```bash
echo '{"session_id":"test-123","transcript_path":"/tmp/test.jsonl","cwd":"/tmp","hook_event_name":"WorktreeCreate","name":"test-worktree"}' \
  | bash .claude/hooks/worktree-create.sh
```

Verify:
1. **Exit code is 0** — `echo $?`
2. **Stdout contains exactly one line** — the absolute path to the created worktree
3. **The directory exists** — `test -d "$(cat stdout)"`
4. **No extra stdout** — any debug output must go to stderr (`>&2`)

## Input Schema

WorktreeCreate hooks receive these fields:

| Field | Type | Description |
|-------|------|-------------|
| `session_id` | string | Session identifier |
| `transcript_path` | string | Path to session transcript |
| `cwd` | string | Current working directory |
| `hook_event_name` | string | Always `"WorktreeCreate"` |
| `name` | string | Worktree slug (user-specified or auto-generated, e.g. `bold-oak-a3f2`) |

## WorktreeRemove Testing

WorktreeRemove receives `worktree_path` instead of `name`:

```bash
echo '{"session_id":"test-123","transcript_path":"/tmp/test.jsonl","cwd":"/tmp","hook_event_name":"WorktreeRemove","worktree_path":"/tmp/worktrees/test-worktree"}' \
  | bash .claude/hooks/worktree-remove.sh
```

WorktreeRemove has no stdout requirement — it performs cleanup only.

## Critical Gotchas

- **Stdout purity**: Any stray output (shell profile banners, `set -x` traces, accidental `echo`) causes WorktreeCreate to silently hang. Always redirect diagnostic output to stderr.
- **Read stdin once**: `cat` or `read` drains stdin. Save to a variable first: `INPUT=$(cat)`, then parse with `jq`.
- **Only `type: "command"` supported**: HTTP, prompt, and agent hook types are not available for worktree events.
- **EnterWorktree tool ignores hooks**: As of March 2026, the in-session `EnterWorktree` tool bypasses WorktreeCreate/WorktreeRemove hooks entirely (GitHub issue #36205). Only `claude --worktree` CLI invocation triggers them.
- **No matcher support**: Worktree hooks always fire — no regex filtering.

## Test Harness Pattern

```bash
#!/bin/bash
# test-worktree-hook.sh — validate a WorktreeCreate hook
HOOK="$1"
NAME="test-$(date +%s)"
INPUT=$(cat <<EOF
{"session_id":"test","transcript_path":"/tmp/t.jsonl","cwd":"$(pwd)","hook_event_name":"WorktreeCreate","name":"$NAME"}
EOF
)

OUTPUT=$(echo "$INPUT" | bash "$HOOK" 2>/dev/null)
EXIT=$?

if [ $EXIT -ne 0 ]; then echo "FAIL: exit code $EXIT"; exit 1; fi
if [ -z "$OUTPUT" ]; then echo "FAIL: no stdout"; exit 1; fi
if [ ! -d "$OUTPUT" ]; then echo "FAIL: directory not created: $OUTPUT"; exit 1; fi
echo "PASS: $OUTPUT"

# Cleanup
rm -rf "$OUTPUT"
```

## When End-to-End Testing Is Needed

Direct stdin testing covers hook logic but misses integration issues:
- Shell profile interference (`.bashrc` printing text)
- Environment variable differences between direct invocation and Claude Code's subprocess
- Race conditions with `async: true` hooks
- Interaction between WorktreeCreate and WorktreeRemove lifecycle

For these, run `claude --worktree --verbose` to see full hook execution logs.
