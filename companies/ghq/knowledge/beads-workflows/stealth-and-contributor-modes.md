---
title: "Beads Stealth and Contributor Modes: Data Locality, Role Detection, and Git Hooks"
tags: ["cli", "task-management", "dolt", "hooks", "configuration", "multi-agent"]
source: "https://github.com/steveyegge/beads/blob/main/README.md, https://github.com/steveyegge/beads/blob/main/docs/QUICKSTART.md, https://steveyegge.github.io/beads/reference/git-integration, https://github.com/steveyegge/beads/blob/main/AGENT_INSTRUCTIONS.md"
confidence: 0.78
created_at: "2026-03-20T04:00:00Z"
updated_at: "2026-03-20T04:00:00Z"
---

Three operational modes control where Beads stores task data and whether git hooks are installed.

## The Three Modes

| Mode | Init Flag | Issues Stored | Git Hooks |
|------|-----------|---------------|-----------|
| **Standard (maintainer)** | `bd init` | `.beads/` in repo | Installed (recommended) |
| **Stealth** | `bd init --stealth` | `.beads/` local only | Disabled |
| **Contributor** | `bd init --contributor` | `~/.beads-planning/` | Separate repo |

## Stealth Mode

Stealth mode is for personal task tracking on shared repos where you don't want to pollute the main repository.

```bash
bd init --stealth
```

- Sets `no-git-ops: true` in `config.toml`, disabling **all** git hook installation and git operations
- `.beads/` directory remains local and untracked — nothing is pushed to remote
- Suitable for evaluations, personal workflows, or repos you don't own

Stealth mode is effectively a "read the repo, track tasks privately" mode. The Dolt database stays on your machine.

## Contributor Mode

Contributor mode is for open-source contributors working on forked repos.

```bash
bd init --contributor
```

- Routes all planning issues to a **separate repository** (default: `~/.beads-planning/`)
- Keeps experimental task planning out of PRs and out of the upstream repo
- Clean contribution boundary: your task graph never leaks into the PR diff

## Role Detection: Maintainer vs. Contributor

During `bd init`, Beads prompts interactively:

> "Contributing to someone else's repo? [y/N]"

Answering `y` sets contributor mode. Historically, auto-detection used SSH vs. HTTPS URL inspection (SSH = write access = maintainer), but this is now **deprecated**. Manual configuration:

```bash
git config beads.role maintainer
git config beads.role contributor
git config --get beads.role   # verify
bd doctor                     # full health check
```

If `beads.role` is not set, Beads falls back to URL-based detection (unreliable for HTTPS repos without stored credentials).

## Git Hooks

Installed via `bd hooks install` or automatically during `bd init` (non-stealth). Beads installs hooks into `.git/hooks/`:

| Hook | Action |
|------|--------|
| `pre-commit` | Triggers a Dolt commit — snapshots pending task changes before the git commit |
| `post-merge` | Triggers Dolt sync after `git pull` — pulls remote task database updates |
| `pre-push` | Ensures Dolt is synced before pushing code |
| `post-checkout` | Detects worktree context; adapts hook behavior for git worktree workflows |

```bash
bd hooks install    # install all hooks
bd hooks status     # check current state
bd hooks uninstall  # remove all hooks
```

## What Gets Committed vs. What Stays Local

In standard (maintainer) mode:

| Path | Tracked by git? | Notes |
|------|----------------|-------|
| `.beads/config.toml` | Yes | Project config — role, flags, integrations |
| `.beads/metadata.json` | Yes | Issue schema metadata |
| `.beads/dolt/` | **No** (gitignored) | The actual Dolt SQL database |

The Dolt database is synced via its own transport: `refs/dolt/data` on the git remote, entirely separate from standard git refs. This means `git push` doesn't push task data — you need `bd dolt push`. With a Dolt remote configured, Beads auto-pushes after write commands with a 5-minute debounce.

In **stealth mode**, nothing in `.beads/` is committed or pushed.

In **contributor mode**, `.beads/` is local and the planning data lives in the separate `~/.beads-planning/` repo.

## BEADS_DIR Override

The `BEADS_DIR` environment variable bypasses git repo discovery and places the `.beads/` database at an explicit path. Useful for:

- Testing (e.g., `BEADS_DB=/tmp/test.db bd ...` to avoid polluting the real database)
- Custom directory layouts where the standard `.beads/` location is undesirable

## Practical Notes

- Stealth mode is the safest choice when evaluating Beads on an existing team repo
- Contributor mode pairs well with fork-based OSS workflows where the upstream maintainer tracks canonical issues
- `bd doctor` is the first debugging step if hooks aren't firing or role is mis-detected
- Worktree support: `post-checkout` hook detects worktree context automatically — no manual setup needed per worktree
