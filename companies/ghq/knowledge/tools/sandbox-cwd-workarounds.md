---
title: "Sandbox CWD Workarounds for Compound Commands"
category: tools
tags: ["claude-code", "sandboxing", "cli", "agent-tooling", "permissions"]
source: "https://code.claude.com/docs/en/sandboxing, https://github.com/anthropics/claude-code/issues/28784, https://github.com/anthropics/claude-code/issues/28183, https://github.com/anthropics/claude-code/issues/19903"
confidence: 0.85
created_at: 2026-03-24T18:30:00Z
updated_at: 2026-03-24T18:30:00Z
---

Workarounds for tools that require a specific working directory in Claude Code's sandbox.

## The Problem

Claude Code's Bash tool does not persist `cd` across invocations — each Bash call starts from the session's working directory. When a tool like `bd` requires being run from a specific directory (e.g., `companies/ghq`), agents resort to compound commands like `cd companies/ghq && bd search "query"`. This creates two issues:

1. **Permission blocking**: Compound commands (`cd X && command Y`) are evaluated as a single unit. The sandbox/permission system may block the entire compound even if each subcommand is individually allowed (see [issue #28183](https://github.com/anthropics/claude-code/issues/28183)).

2. **Security concern**: A `Bash(cd:*)` allow rule matches the entire compound command, inadvertently allowing arbitrary command execution after `&&` (see [issue #28784](https://github.com/anthropics/claude-code/issues/28784)).

## Workarounds

### 1. Wrapper Scripts (Recommended)

Create a wrapper script that handles the `cd` internally:

```bash
#!/usr/bin/env bash
# companies/ghq/tools/bd-wrapper.sh
cd "$(dirname "$0")/../.." && exec bd "$@"
```

The agent calls `./companies/ghq/tools/bd-wrapper.sh search "query"` — a single command that the permission system can match cleanly. This is the GHQ pattern: tools like `ask-claude.sh`, `queue-curiosity.ts`, and `reindex.ts` all resolve their own working directory internally.

### 2. Tool-Level `-C` / `--dir` Flag

Some tools accept a directory flag that avoids `cd` entirely:

```bash
git -C /path/to/repo status    # git's -C flag
bd --dir companies/ghq search  # hypothetical; bd doesn't support this yet
```

If you control the tool, adding a `-C` or `--dir` flag is the cleanest solution. For `bd` specifically, this is a requested enhancement.

### 3. Subshell in Single Command

```bash
(cd companies/ghq && bd search "query")
```

Parentheses create a subshell. Some permission systems treat this differently than `&&` chains, but behavior is not guaranteed across Claude Code versions.

### 4. `env -C` (GNU coreutils 8.28+)

```bash
env -C companies/ghq bd search "query"
```

Available on Linux with recent coreutils. Not available on macOS by default.

### 5. Absolute Paths Where Supported

If the tool accepts path arguments, use absolute or relative paths instead of changing directory:

```bash
bd --beads-dir companies/ghq/.beads search "query"
```

## Recommendation for GHQ Agent Templates

For agent templates that spawn subprocesses (reviewers, workers, etc.):

1. **Always use wrapper scripts** rather than `cd && command` patterns in prompts.
2. **Set `cwd` in subprocess configuration** when spawning via `ask-claude.sh` or similar.
3. **Add allow rules for wrapper scripts** in `.claude/settings.local.json`:
   ```json
   { "permissions": { "allow": ["Bash(./companies/ghq/tools/bd-wrapper.sh *)"] } }
   ```
4. **Avoid documenting `cd && command` patterns** in prompts — agents will copy them verbatim and hit permission blocks.

## Why `cd` Doesn't Persist

Claude Code's Bash tool creates a new shell for each invocation. While the *working directory* does persist between calls (the tool tracks CWD), it persists at the session level — not at the shell process level. The `cd` in one Bash call changes the directory for that call only. The next Bash call starts from wherever the session's CWD was last set (typically the project root).

The session CWD can only be changed via `cd` as the *last* or *only* command in a Bash call, which updates the session state. But `cd X && command Y` leaves the session CWD unchanged because `cd` wasn't the final command.
