---
title: "Beads CLI Discovery in Git Worktrees: BEADS_DIR and PATH Propagation"
category: beads-workflows
tags: ["runtime-isolation", "sandboxing", "claude-code", "agent-loop", "configuration"]
source: "https://github.com/steveyegge/beads/blob/main/docs/WORKTREES.md, https://github.com/steveyegge/beads/discussions/1233, https://github.com/anthropics/claude-code/issues/28041, https://code.claude.com/docs/en/settings"
confidence: 0.75
created_at: "2026-03-24T18:30:00Z"
updated_at: "2026-03-24T18:30:00Z"
---

Agents entering git worktrees lose access to `bd` CLI when BEADS_DIR and PATH are not propagated.

## The Problem

When Claude Code agents spawn into git worktrees (via `claude --worktree` or `EnterWorktree`), two failures commonly occur:

1. **"no beads database found"** — `bd` searches for `.beads/` relative to the git root. In a worktree, the git root is the worktree directory, not the main repo. Since `.beads/` lives in the main repo, `bd` can't find it.
2. **`bd: command not found`** — if `bd` was installed locally (e.g., `node_modules/.bin/bd` or a repo-local script), the worktree's PATH doesn't include the main repo's bin directories.

## Root Causes

### Beads Database Discovery

Beads uses git-based repo discovery: it walks up from CWD looking for `.beads/`. Git worktrees have their own root directory with a `.git` **file** (not directory) pointing back to the main repo's `.git/worktrees/<name>`. The `.beads/` directory lives in the main repo root, which is not an ancestor of the worktree path.

### Claude Code Worktree Isolation

Claude Code's worktree feature creates isolated working directories under `.claude/worktrees/` (or `.worktrees/`). The worktree gets:
- Its own `.claude/settings.local.json`
- A fresh working tree checkout

But it does **not** automatically inherit:
- Custom PATH entries from the parent session
- Environment variables like `BEADS_DIR` unless set in `settings.json`
- Symlinks or `.beads/` directories from the main repo

### Sandbox Restrictions

Claude Code's sandbox can block compound commands like `cd companies/ghq && bd search`. Agents trying to work around the missing database by cd-ing to the main repo hit permission walls.

## Solutions

### 1. Set BEADS_DIR in settings.json (Recommended)

Configure `BEADS_DIR` as an environment variable in `.claude/settings.json` so it propagates to all sessions, including worktrees:

```json
{
  "env": {
    "BEADS_DIR": "/absolute/path/to/repo/.beads"
  }
}
```

This bypasses git-based discovery entirely. All agents — including those in worktrees — will find the beads database.

### 2. Symlink .beads/ into the Worktree

Add a worktree setup hook that symlinks `.beads/` from the main repo:

```bash
ln -s "$(git rev-parse --path-format=absolute --git-common-dir)/../.beads" .beads
```

This makes the database appear local to the worktree.

### 3. Use Absolute Paths for bd

If `bd` is a repo-local binary, ensure PATH includes the main repo's bin:

```json
{
  "env": {
    "PATH": "/absolute/path/to/repo/node_modules/.bin:${PATH}"
  }
}
```

### 4. Agent Template Guidance

Agent templates that use `bd` should include explicit instructions:
- Always check if `bd` is available before using it
- Fall back to `BEADS_DIR=/path/to/.beads bd <command>` if the database isn't found
- Never assume CWD will have a `.beads/` directory

## Beads' Built-in Worktree Support

Beads has a shared database architecture: all git worktrees created by `git worktree add` share the same `.beads/` database located in the main repository. The `post-checkout` git hook detects worktree context automatically.

However, this automatic sharing only works when:
- The worktree was created with `git worktree add` (creating proper git linkage)
- The `.beads/` directory exists in the main repo root
- Git hooks were installed via `bd hooks install`

Claude Code worktrees may not trigger these hooks, since they manage worktree creation independently.

## Practical Recommendations

| Scenario | Best Fix |
|----------|----------|
| All agents need bd | Set `BEADS_DIR` in `settings.json` |
| Specific agent templates | Add `BEADS_DIR` to agent's env block |
| One-off worktree session | Export `BEADS_DIR` before entering worktree |
| bd binary not on PATH | Add absolute path to `env.PATH` in settings |
