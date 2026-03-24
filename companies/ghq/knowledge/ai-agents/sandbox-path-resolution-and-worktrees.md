---
title: "Claude Code Sandbox Path Resolution and Worktree Compatibility"
category: ai-agents
tags: ["sandboxing", "runtime-isolation", "configuration", "hooks"]
source: "https://code.claude.com/docs/en/sandboxing, https://github.com/anthropics/claude-code/issues/22320, https://github.com/anthropics/claude-code/issues/23960"
confidence: 0.85
created_at: 2026-03-24T20:00:00Z
updated_at: 2026-03-24T20:00:00Z
---

Claude Code's sandbox enforces filesystem write restrictions at the OS level via Seatbelt (macOS) or bubblewrap (Linux).

## Default Write Boundary

By default, sandboxed Bash commands can only write to the **current working directory and its subdirectories**. The Write and Edit built-in tools bypass the sandbox entirely — they use the permission system directly. This explains why `Write` succeeds where `mkdir` via Bash fails for the same path.

## Path Resolution Logic

The sandbox builds an allowlist of writable paths at startup. Key behaviors:

1. **CWD-anchored**: The project root (where Claude Code was launched) is the default write boundary.
2. **Symlink mismatch**: The allowlist stores symlink paths as-is, but Bash commands resolve symlinks to real paths before performing operations. If the resolved real path differs from the symlink path, the sandbox blocks the write (Issue #23960).
3. **No dynamic re-evaluation**: Paths are resolved once. Creating new directories under an allowed parent works, but if the parent itself requires resolution (e.g., through symlinks or worktree indirection), it may fail.

## Worktree-Specific Issues

### Problem: `.git` Is a File in Worktrees

In git worktrees, `.git` is a **file** containing `gitdir: /path/to/main/.git/worktrees/<name>`, not a directory. The sandbox setup (bubblewrap on Linux) unconditionally tries to `mkdir -p .git/hooks` for hook protection, which fails because `.git` is not a directory. This blocks **all** Bash commands in worktrees on Linux (Issue #22320, duplicate of #17374).

On macOS (Seatbelt), the `.git/hooks` issue doesn't manifest the same way, but path resolution still causes problems when worktree paths are under non-standard locations like `.worktrees/` or `.claude/worktrees/`.

### Problem: Subpaths Not Recognized

When a worktree is created at `.worktrees/bd/ghq-3f3/` (under the repo root), the sandbox may still block writes there if:
- The worktree path resolves differently than the CWD-based allowlist expects
- The sandbox hasn't been configured to explicitly allow the worktree directory

## Solutions and Workarounds

### 1. `sandbox.filesystem.allowWrite` (Recommended)

Add worktree directories to the write allowlist in `.claude/settings.json`:

```json
{
  "sandbox": {
    "filesystem": {
      "allowWrite": ["./.worktrees", "./.claude/worktrees"]
    }
  }
}
```

The `./` prefix resolves relative to the project root in project settings. Paths from multiple settings scopes are merged (not replaced).

### 2. `dangerouslyDisableSandbox`

Claude can retry failed commands with `dangerouslyDisableSandbox: true`, which bypasses the sandbox but goes through the normal permission flow. This is the escape hatch for edge cases.

### 3. Python/Non-Bash Workaround

Since only Bash commands are sandboxed, using `python3 -c "import os; os.makedirs(...)"` or similar non-Bash tools can bypass the restriction. This is a hack, not a solution.

### 4. `excludedCommands`

Specific commands (e.g., `mkdir`, `rm`) can be excluded from sandboxing, but this removes protection for those commands entirely.

## Key Insight: Bash vs Built-in Tools

The sandbox only applies to **Bash commands and their child processes**. Built-in tools (Read, Edit, Write) use the permission system directly and are never sandboxed. This is why the Write tool can create files in worktree paths that Bash `mkdir` cannot reach.

## Path Prefix Reference

| Prefix | Resolution | Example |
|--------|-----------|---------|
| `/` | Absolute from filesystem root | `/tmp/build` |
| `~/` | Relative to home directory | `~/.kube` |
| `./` or bare | Relative to project root (project settings) or `~/.claude` (user settings) | `./output` |
