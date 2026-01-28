---
description: Audit and clean HQ to enforce current policies and migrate outdated structures
allowed-tools: Task, Read, Glob, Grep, Bash, Write, Edit, AskUserQuestion
argument-hint: [--audit | --migrate | --fix]
---

# /cleanup - HQ Maintenance

Audit HQ for policy violations, migrate outdated structures, and fix inconsistencies.

**User's input:** $ARGUMENTS

## Modes

- **No args / --audit**: Report issues only (default, safe)
- **--migrate**: Convert old formats to new (prd.json → README.md)
- **--fix**: Auto-fix simple issues (git cleanup, archive stale files)

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

### 5. Stale Threads & Checkpoints

**Policy**: Archive threads/checkpoints older than 30 days

```bash
# Stale threads (new format)
find workspace/threads -name "*.json" -mtime +30 2>/dev/null

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

### Archive Stale Threads & Checkpoints
```bash
mkdir -p archives/threads archives/checkpoints
find workspace/threads -name "*.json" -mtime +30 -exec mv {} archives/threads/ \;
find workspace/checkpoints -name "*.json" -mtime +30 -exec mv {} archives/checkpoints/ \;
```

### Relocate Misplaced Projects
```bash
# Move apps/{name}/prd.json to projects/{name}/
mkdir -p projects/{name}
mv apps/{name}/prd.json projects/{name}/
```

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

Summary: 12 issues found
Run `/cleanup --migrate` to convert prd.json files
Run `/cleanup --fix` to clean git and archive stale files
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
| Checkpoints | Legacy format, archive after 30 days |
| Metrics | Append to `workspace/metrics/metrics.jsonl` |
| Git | Clean working tree |
