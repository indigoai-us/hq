---
title: "Sandbox-Safe Bash Patterns for Agent Templates"
category: ai-agents
tags: ["sandboxing", "agent-architecture", "production-patterns", "compound-commands", "claude-code", "shell-scripting"]
source: "https://github.com/anthropics/claude-code/issues/25441, https://github.com/anthropics/claude-code/issues/28784, https://code.claude.com/docs/en/sandboxing, https://www.anthropic.com/engineering/claude-code-sandboxing"
confidence: 0.8
created_at: 2026-03-25T00:00:00Z
updated_at: 2026-03-25T00:00:00Z
---

Practical workarounds for Claude Code sandbox and permission blocks that agent templates commonly hit.

## The Problem

Claude Code's permission system and OS-level sandbox (Seatbelt on macOS, bubblewrap on Linux) interact poorly with two common bash patterns used by autonomous agents:

1. **`cd && command` chaining** — Permission rules like `Bash(cd *)` match the entire compound command, either granting unintended access or blocking legitimate operations.
2. **Heredocs with JSON braces** — Multiline commands containing heredocs (especially with `{` / `}` characters) fail wildcard matching, corrupt `settings.local.json` when approved, and may be silently rejected.

These cause wasted tool calls as agents retry blocked commands in different formulations.

## Root Causes

### Compound Command Matching

Permission wildcards match against the **full command string**, not individual commands in a chain. `Bash(cd:*)` matches `cd /path && rm -rf /` as a single string — a security issue (anthropics/claude-code#28784). The fix means compound `cd && X` commands may now require separate approval for each segment, causing repeated permission prompts for agents.

### Heredoc Permission Corruption

When a user clicks "Yes, and don't ask again" on a heredoc command, the **entire multiline command** (including all heredoc content) is saved verbatim to `settings.local.json`. This creates multi-kilobyte permission entries that:
- Never match again (each unique heredoc body generates a unique rule)
- Can corrupt the JSON file with unescaped characters
- Cause unbounded settings file growth (anthropics/claude-code#25441, closed as fixed)

## Recommended Agent Patterns

### Pattern 1: Avoid `cd && command` — Use Absolute Paths or Tool Flags

Instead of:
```bash
cd /path/to/project && npm test
```

Use:
```bash
# Option A: Run from any CWD with path argument
npm test --prefix /path/to/project

# Option B: Use env -C (coreutils 8.28+, macOS 12+)
env -C /path/to/project npm test

# Option C: Subshell (avoids permission chaining)
(cd /path/to/project && npm test)
```

Most CLI tools accept a working-directory flag (`--prefix`, `--cwd`, `-C`, `--directory`). Prefer these over `cd` chaining.

### Pattern 2: Avoid Heredocs for JSON — Use Python or Script Files

Instead of:
```bash
cat <<'EOF' > config.json
{"key": "value", "nested": {"a": 1}}
EOF
```

Use:
```bash
# Option A: python3 one-liner (always available)
python3 -c "import json; json.dump({'key': 'value', 'nested': {'a': 1}}, open('config.json', 'w'), indent=2)"

# Option B: printf with escaped content
printf '{"key": "value", "nested": {"a": 1}}\n' > config.json

# Option C: Use the Write tool instead of Bash
# (Preferred when the content is known at generation time)
```

### Pattern 3: Avoid Heredocs for Git Commits

Instead of:
```bash
git commit -m "$(cat <<'EOF'
Multi-line commit message
EOF
)"
```

Use:
```bash
# Option A: Multiple -m flags
git commit -m "First line" -m "Second paragraph"

# Option B: Write to temp file
echo "Multi-line commit message" > /tmp/commit-msg && git commit -F /tmp/commit-msg

# Option C: Single-line message (simplest)
git commit -m "Concise single-line message"
```

### Pattern 4: Explicit Permission Rules for Agent Commands

Pre-approve specific command prefixes in `.claude/settings.local.json`:
```json
{
  "permissions": {
    "allow": [
      "Bash(npm test *)",
      "Bash(git add *)",
      "Bash(git commit *)",
      "Bash(python3 -c *)"
    ]
  }
}
```

This avoids runtime permission prompts. Note: wildcard rules only match **single-line** commands reliably.

## Agent Template Checklist

When writing agent templates or subprocess scripts:

- [ ] No `cd && X` patterns — use tool-native directory flags
- [ ] No heredocs — use `python3 -c`, `printf`, or dedicated file-write tools
- [ ] No multiline bash commands in permission-sensitive contexts
- [ ] Pre-approve expected commands in settings
- [ ] Test in sandboxed mode before deploying (not just `--dangerously-skip-permissions`)

## Platform Notes

- **macOS Seatbelt**: Filesystem restrictions enforced at kernel level; no userspace bypass possible
- **Linux bubblewrap**: Same enforcement via namespace isolation
- Both apply to **all subprocesses** spawned by the command, not just the top-level shell
