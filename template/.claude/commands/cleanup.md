---
description: Audit and clean HQ to enforce current policies and migrate outdated structures
allowed-tools: Task, Read, Glob, Grep, Bash, Write, Edit, AskUserQuestion
argument-hint: [--audit | --migrate | --fix]
visibility: public
---

# /cleanup - HQ Maintenance

Audit HQ for policy violations, migrate outdated structures, and fix inconsistencies.

**User's input:** $ARGUMENTS

## Modes

- **No args / --audit**: Report issues only (default, safe)
- **--migrate**: Convert old formats to new (prd.json → README.md)
- **--fix**: Auto-fix simple issues (git cleanup, archive stale files)
- **--reindex**: Regenerate ALL INDEX.md files from disk (full rebuild)

## The Job

1. Run audit checks
2. Report findings
3. If --migrate or --fix: propose changes, ask confirmation, execute

---

## Audit Checks

### 1. Project Structure

**Policy**: All projects in `projects/` folder with `README.md`

```bash
# Find projects with only prd.json (no README)
for dir in projects/*/; do
  if [[ -f "${dir}prd.json" && ! -f "${dir}README.md" ]]; then
    echo "MIGRATE: $dir has prd.json but no README.md"
  fi
done

# Find projects outside projects/ folder
find companies apps -name "prd.json" 2>/dev/null
```

**Violations**:
- prd.json without README.md → needs migration
- prd.json in companies/ or apps/ → needs relocation

### 2. Worker Registry

**Policy**: All workers indexed in `workers/registry.yaml`

```bash
# Find workers not in registry
for dir in workers/public/*/ workers/private/*/; do
  worker=$(basename "$dir")
  if ! grep -q "id: $worker" workers/registry.yaml; then
    echo "UNINDEXED: $worker"
  fi
done
```

### 3. Deprecated Directories

**Policy**: No apps/ directory (use projects/ or workers/)

```bash
# Check if apps/ still exists
if [[ -d "apps" ]]; then
  echo "DEPRECATED: apps/ directory still exists"
  ls apps/
fi
```

### 4. Git Status

**Policy**: Clean working tree, no orphaned deletions

```bash
git status --short
```

**Issues**:
- Deleted files not committed
- Untracked new files (should commit or ignore)
- Modified submodules

**Note:** Knowledge folders are symlinks to repos in `repos/public/` and `repos/private/` (gitignored). Symlinks themselves should be tracked by HQ git. Knowledge file changes are invisible to HQ git (they live in their own repos).

### 4b. Knowledge Repo Status

**Policy**: Knowledge repos should be clean (committed)

```bash
for symlink in knowledge/public/* knowledge/private/* companies/*/knowledge; do
  [ -L "$symlink" ] || continue
  repo_dir=$(cd "$symlink" && git rev-parse --show-toplevel 2>/dev/null) || continue
  dirty=$(cd "$repo_dir" && git status --porcelain)
  [ -z "$dirty" ] && continue
  echo "DIRTY: $symlink → $repo_dir"
done
```

**With --fix**: Auto-commit dirty knowledge repos:
```bash
(cd "$repo_dir" && git add -A && git commit -m "chore: cleanup commit")
```

### 5. Stale Threads & Checkpoints

**Policy**: Archive manual threads/checkpoints older than 30 days. Purge auto-checkpoints older than 14 days.

```bash
# Auto-checkpoints older than 14 days (purge, not archive)
find workspace/threads -name "T-*-auto-*.json" -mtime +14 2>/dev/null

# Stale manual threads (new format, 30 days)
find workspace/threads -name "*.json" -not -name "*-auto-*" -mtime +30 2>/dev/null

# Stale checkpoints (legacy format)
find workspace/checkpoints -name "*.json" -mtime +30 2>/dev/null
```

### 6. Worker State Machine

**Policy**: Workers should have state_machine section (Loom pattern)

```bash
# Find workers without state_machine
for f in workers/*/worker.yaml workers/public/dev-team/*/worker.yaml; do
  if [[ -f "$f" ]] && ! grep -q "state_machine:" "$f"; then
    echo "MISSING: $f lacks state_machine section"
  fi
done
```

### 7. Orphaned Skills

**Policy**: Skills only in `.claude/commands/` (not SKILL.md format)

```bash
# Find old SKILL.md format
find . -name "SKILL.md" -not -path "./repos/*"
```

### 8. Stale INDEX.md Files

**Policy**: INDEX.md files should exist and match directory contents. See `knowledge/public/hq-core/index-md-spec.md` for spec.

**Expected locations:**
- `projects/INDEX.md`
- `companies/acme/knowledge/INDEX.md`
- `companies/widgets/knowledge/INDEX.md`
- `companies/designco/knowledge/INDEX.md`
- `knowledge/public/INDEX.md`
- `workers/public/INDEX.md`
- `workers/private/INDEX.md`
- `workspace/orchestrator/INDEX.md`
- `workspace/reports/INDEX.md`
- `workspace/social-drafts/INDEX.md`

For each:
1. Check if INDEX.md exists → flag MISSING if not
2. Count entries in INDEX table vs actual directory contents → flag STALE if mismatch

**With --reindex or --fix**: Regenerate all INDEX.md files from disk per spec.

---

## Migration: prd.json → README.md

For each project with only `prd.json`:

1. Read prd.json
2. Extract fields:
   - `name` → title
   - `description` → overview
   - `metadata.goal` → Goal line
   - `metadata.successCriteria` → Success line
   - `userStories[]` → User Stories section
3. Generate README.md
4. Keep prd.json as backup (rename to `prd.json.bak`)

**Template**:
```markdown
# {name}

**Goal:** {metadata.goal}
**Success:** {metadata.successCriteria}

## Overview
{description}

## User Stories

### US-001: {story.title}
**Description:** {story.description}

**Acceptance Criteria:**
{story.acceptanceCriteria as checklist}

## Non-Goals
{if present}

## Technical Considerations
{if present}
```

---

## Fix Actions

### Git Cleanup
```bash
# Stage deleted files
git add -u

# Commit cleanup
git commit -m "chore: cleanup orphaned files"
```

### Purge Stale Auto-Checkpoints
```bash
# Delete auto-checkpoints older than 14 days (no archive — they're lightweight)
find workspace/threads -name "T-*-auto-*.json" -mtime +14 -delete 2>/dev/null
echo "Purged $(find workspace/threads -name "T-*-auto-*.json" -mtime +14 2>/dev/null | wc -l) auto-checkpoints"
```

### Archive Stale Threads & Checkpoints
```bash
mkdir -p archives/threads archives/checkpoints
find workspace/threads -name "*.json" -not -name "*-auto-*" -mtime +30 -exec mv {} archives/threads/ \;
find workspace/checkpoints -name "*.json" -mtime +30 -exec mv {} archives/checkpoints/ \;
```

### Relocate Misplaced Projects
```bash
# Move apps/{name}/prd.json to projects/{name}/
mkdir -p projects/{name}
mv apps/{name}/prd.json projects/{name}/
```

### Regenerate INDEX.md Files (--reindex)

For each expected INDEX.md location (see Audit Check #8):
1. List all files and subdirectories (skip INDEX.md, .DS_Store, node_modules, dotfiles)
2. Extract description per spec: `.md` → first `#` heading, `.yaml` → `description:`, `.json` → `name`/`description`, dirs → file count + purpose
3. Write INDEX.md using template from `knowledge/public/hq-core/index-md-spec.md`
4. Directories first, then files, alphabetical within each group

---

## Output Format

### Audit Report
```
HQ Cleanup Audit
================

✓ Worker registry: 15 workers indexed
✗ Project structure: 8 issues
  - projects/customer-cube: prd.json without README.md
  - projects/deel-analytics: prd.json without README.md
  ...
✗ Deprecated directories: apps/ still exists (4 items)
✗ Git status: 3 uncommitted changes
✓ Checkpoints: all recent
✗ INDEX.md: 2 stale, 1 missing
  - projects/INDEX.md: 30 entries vs 33 actual (stale)
  - workspace/reports/INDEX.md: missing

Summary: 14 issues found
Run `/cleanup --migrate` to convert prd.json files
Run `/cleanup --fix` to clean git and archive stale files
Run `/cleanup --reindex` to regenerate all INDEX.md files
```

### After Migration
```
Migrated 8 projects to README.md format:
- projects/customer-cube/README.md (created)
- projects/deel-analytics/README.md (created)
...

Original prd.json files renamed to prd.json.bak
Run `/cleanup --fix` to commit changes
```

---

## Rules

- **--audit is safe**: Never modifies files, only reports
- **Always ask before destructive actions**: deletions, moves
- **Backup before migration**: rename, don't delete
- **Commit after changes**: keep git clean

---

## Current HQ Policies

Reference for what we're enforcing:

| Area | Policy |
|------|--------|
| Projects | Live in `projects/{name}/` with `README.md` |
| PRD format | Markdown README.md (not prd.json) |
| Workers | Indexed in `workers/registry.yaml` |
| Worker FSM | `state_machine:` section in worker.yaml (Loom pattern) |
| Apps | Deprecated - migrate to projects/ or workers/ |
| Skills | `.claude/commands/*.md` format |
| Threads | Primary session persistence (`workspace/threads/`) |
| Auto-checkpoints | Lightweight, purge after 14 days (`T-*-auto-*.json`) |
| Checkpoints | Legacy format, archive after 30 days |
| Metrics | Append to `workspace/metrics/metrics.jsonl` |
| Git | Clean working tree |
| Knowledge repos | Symlinks in `knowledge/` and `companies/*/knowledge/` point to repos; all repos committed |
| INDEX.md | Exist at 10 key dirs, match contents (see spec) |
