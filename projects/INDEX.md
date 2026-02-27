# Projects

Active and archived GHQ projects. Each project has a `prd.json` defining its stories, acceptance criteria, and execution configuration.

## Directory Structure

```
projects/
  {project-name}/
    prd.json          # Project definition (stories, metadata, worktree config)
    README.md         # Project context, goals, decisions
  archive/
    {project-name}/   # Completed projects (moved here when all stories pass)
```

## Active Projects

| Project | Description | Status |
|---------|-------------|--------|
| ghq | GHQ self-build: Personal OS infrastructure | In progress |

## Archive

Completed projects live in `projects/archive/`. They are preserved for reference but excluded from execution. See [archive/](archive/).

---

## How Projects Work

### Creating a Project

Use `/prd` to scaffold a new project:

```
/prd
```

This creates `projects/{name}/prd.json` and a starter `README.md`.

### Executing a Project

Use `/run-project` to execute stories:

```
/run-project {name}
```

Ralph iterates non-archived, non-passing stories in priority order. Each story is executed by a sub-agent, which commits its own work before returning.

### Marking Stories Complete

Stories are marked `"passes": true` when all acceptance criteria and E2E tests pass. `/run-project` skips passing stories on subsequent runs.

---

## Work Mode Policy

**Always ask the user before starting a project: work on main directly, or use a worktree?**

- **Main directly** (`worktree: false`): Changes land on `main` immediately. Use for small, low-risk projects.
- **Worktree** (`worktree: true`): An isolated `git worktree` is created for the project. Use for multi-story, experimental, or parallel work.

**Never use feature branches.** GHQ uses main or worktrees only.

The `worktree` field in `prd.json` records this decision:

```json
{
  "worktree": false
}
```

### Worktree Completion

When a worktree project finishes (all stories pass), **ask the user**:

1. **Merge directly to main** — `git worktree remove` + merge/rebase
2. **Open a pull request** — push the worktree branch and create a PR for review

Never assume one path. Always ask.

---

## Archive Workflow

When all stories in a project pass, the project is eligible for archiving.

### Steps

1. Verify all stories have `"passes": true` in `prd.json`
2. Move the project directory into `projects/archive/`:
   ```bash
   git mv projects/{name} projects/archive/{name}
   ```
3. Commit the move:
   ```bash
   git commit -m "archive: move {name} to projects/archive/"
   ```
4. Update this `INDEX.md` — remove from active list, note in archive

### Why Archive?

Completed projects should not clutter the active list. Archiving keeps `projects/` focused on work in progress while preserving history and decisions in `archive/`.

Archived projects are **never deleted** — they serve as reference for future work and document the reasoning behind past decisions.

---

## PRD Schema

Full schema: [knowledge/ghq-core/prd-schema.md](../knowledge/ghq-core/prd-schema.md)

Key fields relevant to the project system:

| Field | Description |
|-------|-------------|
| `worktree` | `true` = use git worktree, `false` = work on main directly |
| `passes` (per story) | `true` = story complete |
| `archive` (per story) | `true` = skip story in execution, preserve for history |

---

## Project Template

New project README: [knowledge/ghq-core/project-template.md](../knowledge/ghq-core/project-template.md)
