---
title: "Worktree .claude/ Directory Setup Strategies"
category: ghq-core
tags: ["claude-code", "production-patterns", "hooks", "configuration", "agent-orchestration"]
source: "https://github.com/anthropics/claude-code/issues/28041, https://mattbrailsford.dev/replacing-my-custom-git-worktree-skill-with-claude-code-hooks, https://github.com/tfriedel/claude-worktree-hooks, https://code.claude.com/docs/en/hooks, https://github.com/gapurov/copy-configs"
confidence: 0.85
created_at: 2026-03-24T22:00:00Z
updated_at: 2026-03-24T22:00:00Z
---

Claude Code worktrees only copy settings.local.json — agents, skills, docs, and rules must be set up via hooks.

## The Problem

When `claude --worktree` (or `EnterWorktree`) creates a git worktree, the resulting `.claude/` directory contains **only** `settings.local.json`. All other subdirectories — `agents/`, `skills/`, `docs/`, `rules/`, `commands/`, `hooks/` — and `settings.json` itself are absent. This means custom agent templates, slash commands, and project-level hooks are unavailable in the worktree session.

This is tracked as [anthropics/claude-code#28041](https://github.com/anthropics/claude-code/issues/28041). As of March 2026, this is still the default behavior.

## Why It Happens

Git worktrees check out committed files only. The `.claude/` directory is typically `.gitignore`d, so its contents are local-only. Claude Code's built-in worktree logic copies `settings.local.json` (needed for permissions and model config) but does not copy or symlink the rest.

## Solution: WorktreeCreate Hook

The `WorktreeCreate` hook fires **before** the TUI renders when `claude --worktree` is invoked. It **replaces** the default git worktree creation, giving full control over setup.

### Hook Contract

- Receives JSON on stdin: `{"session_id": "...", "cwd": "...", "hook_event_name": "WorktreeCreate", "name": "feature-auth"}`
- Must print the **absolute path** to the created worktree on stdout (nothing else on stdout)
- All progress/debug output must go to stderr
- Exit 0 = success, non-zero = failure

### Configuration in settings.json

```json
{
  "hooks": {
    "WorktreeCreate": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/worktree-create.sh\""
          }
        ]
      }
    ],
    "WorktreeRemove": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/worktree-remove.sh\""
          }
        ]
      }
    ]
  }
}
```

### Implementation Pattern

A typical `worktree-create.sh` does three things:

```bash
#!/bin/bash
set -euo pipefail

# Parse input
NAME=$(jq -r .name)
CWD=$(jq -r .cwd)
WORKTREE_DIR="$CWD/.claude/worktrees/$NAME"

# 1. Create git worktree
git -C "$CWD" worktree add -b "worktree/$NAME" "$WORKTREE_DIR" HEAD >&2

# 2. Copy/symlink .claude subdirectories
for dir in agents skills docs rules commands hooks; do
  if [ -d "$CWD/.claude/$dir" ]; then
    cp -R "$CWD/.claude/$dir" "$WORKTREE_DIR/.claude/$dir" >&2
  fi
done
# Copy settings.json (not just settings.local.json)
cp "$CWD/.claude/settings.json" "$WORKTREE_DIR/.claude/settings.json" 2>/dev/null >&2 || true
cp "$CWD/.claude/settings.local.json" "$WORKTREE_DIR/.claude/settings.local.json" 2>/dev/null >&2 || true

# 3. Output the worktree path (ONLY thing on stdout)
echo "$WORKTREE_DIR"
```

### Symlink vs Copy Trade-offs

| Approach | Pros | Cons |
|----------|------|------|
| **Copy** | Independent; edits in worktree don't affect main | Stale if main changes; disk usage |
| **Symlink** | Always current; zero duplication | Edits in worktree affect main; some tools don't follow symlinks |
| **Hybrid** | Symlink read-only (agents/, skills/), copy mutable (settings) | More complex script |

For GHQ, **symlinks** are preferred for `agents/`, `skills/`, `docs/`, and `rules/` (read-only during worktree sessions), while `settings.json` and `settings.local.json` should be **copied** (may need worktree-specific overrides).

### .worktreeinclude Pattern

An alternative approach uses a `.worktreeinclude` file (gitignore syntax) listing untracked files that should be copied:

```
.claude/agents/
.claude/skills/
.claude/settings.json
.env
.env.local
```

The hook then uses `git ls-files --others --ignored --exclude-from=.worktreeinclude` to find matching files and copies them into the worktree.

## GHQ-Specific Considerations

GHQ's `companies/` directory with symlinks adds complexity:

1. **Symlinked repos**: Worktrees for repos under `companies/{slug}/projects/{project}/repos/{repo}/` (which are symlinks) need the symlink targets resolved before `git worktree add`.
2. **Shared tools**: `companies/ghq/tools/` should be accessible from worktrees. Since these live in the main repo (not `.claude/`), they're included in the git checkout automatically.
3. **CLAUDE.md**: Already committed to the repo, so it's present in worktrees by default.

## Related Tools

- [tfriedel/claude-worktree-hooks](https://github.com/tfriedel/claude-worktree-hooks): Drop-in scripts with env copying, deterministic ports, and dependency installation.
- [coderabbitai/git-worktree-runner](https://github.com/coderabbitai/git-worktree-runner): Bash-based manager with editor and AI tool integration.
- [gapurov/copy-configs](https://github.com/gapurov/copy-configs): Auto-copy untracked configs to new worktrees.

## WorktreeRemove Hook

Fires when a worktree is removed. Receives `{"worktree_path": "/abs/path"}` on stdin. Cannot block removal. Use for cleanup (archiving changes, removing cached state).
