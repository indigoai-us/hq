---
description: Content audit — detect stale, orphaned, duplicate, and broken content across GHQ
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
argument-hint: [--fix | --archive <project>]
visibility: public
---

# /garden - Content Audit & Curation

Single-pass content health check for GHQ. Scans knowledge, projects, and skills for issues, reports findings clearly, and asks before taking any action.

**Arguments:** $ARGUMENTS

- No args — audit only, report findings
- `--fix` — audit then offer to apply safe fixes (stale dates, registry drift)
- `--archive <project>` — archive a specific completed project by slug

---

## Step 0: Parse Arguments

Check $ARGUMENTS:
- If `--archive <project>`: jump to [Archive Flow](#archive-flow) with that project slug
- If `--fix`: run full audit (Steps 1–5), then offer fix options in Step 6
- Otherwise: run full audit (Steps 1–5) and report only

---

## Step 1: Inventory Scan

Collect the raw file list from all scanned directories.

```bash
# Knowledge files
find knowledge/ -name "*.md" 2>/dev/null | sort
find companies/*/knowledge/ -name "*.md" 2>/dev/null | sort

# INDEX.md files (all levels)
find . -name "INDEX.md" -not -path "./.git/*" -not -path "./repos/*" -not -path "./workspace/*" 2>/dev/null | sort

# Project PRDs
find projects/ -name "prd.json" -not -path "*/archive/*" 2>/dev/null | sort
find projects/archive/ -name "prd.json" 2>/dev/null | sort

# Skills
find .claude/skills/ -maxdepth 1 -mindepth 1 -type d 2>/dev/null | sort
find .claude/skills/ -name "skill.yaml" 2>/dev/null | sort

# Commands
find .claude/commands/ -name "*.md" 2>/dev/null | sort
```

Store counts for the report header.

---

## Step 2: Staleness Check

**Goal:** Find content with dates older than 90 days that may be out of date.

For each `INDEX.md` found in Step 1, check the `Updated:` line:

```bash
grep -r "Updated:" knowledge/ companies/*/knowledge/ --include="INDEX.md" -l 2>/dev/null
grep -r "> Auto-generated. Updated:" . --include="INDEX.md" 2>/dev/null
```

For each knowledge file, look for embedded dates:

```bash
grep -rn "20[0-9][0-9]-[0-1][0-9]-[0-3][0-9]" knowledge/ companies/*/knowledge/ --include="*.md" -l 2>/dev/null
```

Flag any INDEX.md whose `Updated:` date is more than 90 days before today (2026-02-28).
Flag any knowledge file last modified (git log) more than 180 days ago with no recent git touches:

```bash
git log --pretty=format:"%ad %s" --date=short -- knowledge/ 2>/dev/null | head -30
git log --diff-filter=M --name-only --pretty=format:"%ad" --date=short -- knowledge/ companies/*/knowledge/ 2>/dev/null | head -40
```

Collect: `stale_indexes[]`, `stale_knowledge[]`

---

## Step 3: Orphan Detection

**Goal:** Find files that exist on disk but are not referenced in any INDEX.md.

### 3a: Knowledge orphans

For each knowledge subdirectory, read its `INDEX.md` (if any). Extract linked file/dir names. Compare against actual directory listing.

```bash
# List actual knowledge dirs and files
ls -1 knowledge/ 2>/dev/null
ls -1 companies/*/knowledge/ 2>/dev/null
```

For each `knowledge/{dir}/INDEX.md`, extract markdown links:

```bash
grep -oP '\[.*?\]\((.*?)\)' knowledge/*/INDEX.md 2>/dev/null | grep -oP '\((.*?)\)' | tr -d '()'
```

Any file in `knowledge/` or `companies/*/knowledge/` not linked from any INDEX = orphan candidate.

### 3b: Project orphans

Check `workspace/orchestrator/state.json` for registered projects:

```bash
cat workspace/orchestrator/state.json 2>/dev/null | grep '"name"'
```

Compare against actual `projects/*/prd.json`. Projects on disk but absent from state.json are unregistered.

### 3c: Skill orphans

Compare skill directories against `registry.yaml`:

```bash
# Dirs that exist
ls -1 .claude/skills/ 2>/dev/null

# Dirs registered in registry
grep "  - id:" .claude/skills/registry.yaml 2>/dev/null
grep "path:" .claude/skills/registry.yaml 2>/dev/null
```

Flag: dirs in `.claude/skills/` that are NOT in registry (and are not `_template`).
Flag: registry entries whose `path:` directory does NOT exist on disk.

Collect: `orphan_knowledge[]`, `unregistered_projects[]`, `skill_registry_drift[]`

---

## Step 4: Broken Link Detection

**Goal:** Find markdown links in INDEX.md and knowledge files that point to non-existent paths.

For each `INDEX.md` and key knowledge file, extract relative links and verify they resolve:

```bash
# Extract all relative markdown links from INDEX files
grep -rn '\[.*\](\..*\|[^h].*\.md)' knowledge/ --include="*.md" 2>/dev/null
grep -rn '\[.*\](\..*\|[^h].*\.md)' .claude/commands/ --include="*.md" 2>/dev/null
```

For each extracted link path:
- Resolve relative to the file's directory
- Check if path exists: `test -e {resolved_path}`
- If not: flag as broken

Collect: `broken_links[]` — each entry: `{file, link_text, link_target}`

---

## Step 5: Duplicate Detection

**Goal:** Find near-identical content that should be merged or deduplicated.

### 5a: Duplicate knowledge topics

Use qmd to find semantically similar knowledge files:

```bash
qmd vsearch "GHQ architecture overview" --json -n 5 2>/dev/null || true
qmd vsearch "project execution workflow" --json -n 5 2>/dev/null || true
qmd vsearch "skill framework documentation" --json -n 5 2>/dev/null || true
```

Flag pairs with similarity > 0.85 that are in different files as potential duplicates.

### 5b: Duplicate project names

Compare active project names against archive:

```bash
ls projects/ 2>/dev/null | grep -v "INDEX.md" | grep -v "archive"
ls projects/archive/ 2>/dev/null
```

Flag any name collision (same slug active and in archive).

### 5c: Duplicate commands

Check for commands that describe overlapping functionality:

```bash
grep -l "description:" .claude/commands/*.md 2>/dev/null | xargs grep "description:" 2>/dev/null
```

Collect: `duplicate_candidates[]`

---

## Step 6: Compile Report

Print a clear, structured audit report:

```
=== GHQ Garden Audit ===
Date: 2026-02-28
Scanned:
  knowledge/           {N} files
  companies/*/knowledge/  {N} files
  projects/            {N} active PRDs, {N} archived
  .claude/skills/      {N} skills
  .claude/commands/    {N} commands
  INDEX.md files       {N} found

--- STALE CONTENT ---
{if none}  No stale content found.
{else}
  INDEX.md files with outdated timestamps ({count}):
    - {path}  (Updated: {date}, {days} days ago)

  Knowledge files untouched > 180 days ({count}):
    - {path}  (last modified: {date})

--- ORPHANED FILES ---
{if none}  No orphans found.
{else}
  Knowledge files not referenced in any INDEX ({count}):
    - {path}

  Skills in .claude/skills/ missing from registry ({count}):
    - {dir}

  Registry entries with missing directories ({count}):
    - {id}  declared path: {path}

  Projects on disk not in orchestrator state ({count}):
    - {name}

--- BROKEN LINKS ---
{if none}  No broken links found.
{else}
  ({count} broken links):
    - {file}: [{link_text}]({link_target})  → NOT FOUND

--- DUPLICATES ---
{if none}  No duplicates detected.
{else}
  Potential duplicate knowledge topics ({count}):
    - {file_a} ↔ {file_b}  (similarity: {score})

  Active+archived name collision ({count}):
    - {slug}  (exists in both projects/ and projects/archive/)

--- SUMMARY ---
  {total_issues} issues found.
  {0 issues: "GHQ content is healthy." | else: "Review findings above."}
```

If `--fix` was NOT passed and issues were found, print:

```
Run `/garden --fix` to apply safe automated fixes.
Run `/garden --archive <project>` to archive a completed project.
```

---

## Step 7: Fix Offers (only when `--fix` passed)

Present each fixable issue group with a numbered offer. Ask once before taking any action.

```
Fixable issues found:

[1] Refresh {N} stale INDEX.md timestamps
    → Update "Updated: {date}" lines to today (2026-02-28)
    Files: {list}

[2] Register {N} untracked skills in registry.yaml
    → Add missing skill entries to .claude/skills/registry.yaml
    Skills: {list}

[3] Remove {N} broken links from INDEX files
    → Delete the broken link lines (content preserved, only link removed)
    Files: {list}

Which fixes should I apply? (comma-separated numbers, or "all", or "none")
```

Wait for user response. Apply only the confirmed fixes.

For each applied fix, make the minimal targeted edit:
- Stale timestamps: use Edit tool to update only the `Updated:` line
- Registry drift: use Edit tool to add missing entries under correct section
- Broken links: use Edit tool to remove only the broken link line

After all fixes applied:

```bash
qmd update 2>/dev/null || true
```

Report:

```
Fixes applied:
  {list of changes made}

Reindex: done
```

---

## Archive Flow

Triggered by `--archive <project>` argument.

### A1: Locate project

```bash
ls projects/{slug}/ 2>/dev/null
cat projects/{slug}/prd.json 2>/dev/null
```

If not found: "Project '{slug}' not found in projects/. Check spelling or run /garden to see active projects."

### A2: Verify completion

Read `projects/{slug}/prd.json`. Check all stories for `"passes": true`.

If any story has `"passes": false`:

```
Cannot archive '{slug}' — {N} stories are not yet passing:
  - US-{id}: {title}  [passes: false]

Archive is for completed projects only. Mark stories complete first, or run /garden without --archive to see project status.
```

Stop.

### A3: Confirm with user

```
Archive '{slug}'?

  Active stories: {N} (all passing)
  Move: projects/{slug}/ → projects/archive/{slug}/

This will:
  1. git mv projects/{slug}/ projects/archive/{slug}/
  2. Update projects/INDEX.md (move from Active to Archive section)
  3. Run qmd update

Proceed? (yes/no)
```

Wait for explicit confirmation.

### A4: Execute archive (only after "yes")

```bash
git mv projects/{slug}/ projects/archive/{slug}/
```

Update `projects/INDEX.md`:
- Remove the project row from the `## Active Projects` table
- Add a note under `## Archive` or confirm archive directory reference is accurate

Commit:

```bash
git add projects/INDEX.md
git commit -m "archive: move {slug} to projects/archive/"
```

Reindex:

```bash
qmd update 2>/dev/null || true
```

Report:

```
Archived: projects/{slug}/ → projects/archive/{slug}/
Committed: archive: move {slug} to projects/archive/
Reindex: done
```

---

## Rules

- **Never take action without asking first** — audit is always read-only unless `--fix` or `--archive` is passed, and even then user confirmation is required before any write
- **Never archive an incomplete project** — all stories must have `"passes": true` before archiving
- **Minimal edits only** — fix only what is flagged; do not reformulate, rewrite, or reorganize content that is not an identified issue
- **qmd update after every change** — always reindex after applying fixes or archiving
- **git mv for archive moves** — never use plain `mv`; always use `git mv` to preserve history
- **Commit archive moves** — archive operations must be committed immediately with a clear message
- **Report first, act second** — always print the full audit report before offering fixes
- **Stale threshold: INDEX.md = 90 days, knowledge files = 180 days** — these are guidance thresholds, not hard deletes
- **Skills _template is not a skill** — never flag `.claude/skills/_template/` as an orphan or registry gap
