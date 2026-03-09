---
type: guide
domain: [engineering, operations]
status: draft
tags: [knowledge-repos, git, symlinks, gitignore, knowledge-management]
relates_to:
  - knowledge/hq-core/quick-reference.md
  - knowledge/hq-core/index-md-spec.md
---

# Knowledge Repos: Structure & Maintenance

Every knowledge folder in HQ is an independently versioned git repo. HQ gitignores their contents so knowledge changes are committed to their own repos, not to HQ.

## Two Types

### Shared Knowledge (`knowledge/public/` and `knowledge/private/`)

Symlinks pointing to cloned repos:

```
knowledge/public/Ralph     → repos/public/ralph-methodology/docs
knowledge/public/dev-team  → repos/public/knowledge-dev-team
knowledge/private/linear   → repos/private/knowledge-linear
```

- The actual repo lives in `repos/{public|private}/knowledge-{name}/`
- The symlink in `knowledge/` provides transparent read access (qmd, Glob, Grep, Read all work)
- To commit: `cd` into the symlink target repo and use git there

### Company Knowledge (`companies/{co}/knowledge/`)

Symlinks to private repos, with optional non-symlinked files alongside:

```
companies/personal/knowledge/
├── personal  → ../../../repos/private/knowledge-personal   (symlink)
├── profile.md                                               (regular file, tracked by HQ git)
└── voice-style.md                                           (regular file, tracked by HQ git)
```

- The symlink target is a git repo with its own `.git/`
- Files directly in `companies/{co}/knowledge/` (not inside the symlink) are tracked by HQ git
- To commit knowledge repo changes: `cd repos/private/knowledge-{co}/` and use git there

### Exception: `knowledge/hq-core/`

Not a symlink — a regular directory tracked by HQ git directly. Allowed through by `.gitignore` pattern `!knowledge/hq-core/`. Commits go to the HQ repo.

## Gitignore Patterns

HQ's `.gitignore` uses a deny-then-allow pattern for knowledge:

```gitignore
# Cloned repos (tracked by their own git)
repos/

# Knowledge repo contents (tracked by their own git)
knowledge/*/
companies/*/knowledge/*
!knowledge/Ralph/
!knowledge/workers/
!knowledge/hq-core/
# ... other allowed dirs
```

- `repos/` — ignores all cloned repos (both public and private)
- `knowledge/*/` — ignores all symlinked knowledge dirs
- `companies/*/knowledge/*` — ignores company knowledge symlinks (note: no trailing `/` because git treats symlinks-to-directories as files, not directories)
- `!knowledge/{name}/` — allows specific non-symlinked knowledge dirs back through

### Symlink Gotcha

Git treats a symlink pointing to a directory as a **file** (the symlink itself), not a directory. The pattern `companies/*/knowledge/*/` (with trailing slash) does **not** match symlinks. Use `companies/*/knowledge/*` (no trailing slash) instead.

## Committing Workflow

```bash
# Shared knowledge
cd repos/public/knowledge-{name}/
git add -A && git commit -m "knowledge: {description}" && git push

# Company knowledge
cd repos/private/knowledge-{co}/
git add -A && git commit -m "knowledge: {description}" && git push

# hq-core (exception — commits to HQ)
cd knowledge/hq-core/
# Regular HQ git workflow
```

## Adding a New Knowledge Repo

1. **Create the repo:**
   - Company: `mkdir -p repos/private/knowledge-{co} && cd repos/private/knowledge-{co} && git init`
   - Shared: `mkdir -p repos/{public|private}/knowledge-{name} && cd repos/{public|private}/knowledge-{name} && git init`

2. **Create the symlink:**
   - Company: `ln -s ../../../repos/private/knowledge-{co} companies/{co}/knowledge/{slug}`
   - Shared: `ln -s ../../repos/{public|private}/knowledge-{name} knowledge/{public|private}/{name}`

3. **Register:** Add to `modules/modules.yaml`

4. **Reindex:** `qmd update 2>/dev/null || true`

## Inventory

See `knowledge/hq-core/quick-reference.md` § Knowledge Repo Inventory for the full symlink-to-repo mapping table.
