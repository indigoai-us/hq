---
description: Content audit — detect stale, orphaned, duplicate, and broken content across GHQ
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
argument-hint: [--fix]
visibility: public
---

# /garden - Content Audit & Curation

Single-pass content health check for GHQ. Scans knowledge, skills, and beads tasks for issues, reports findings clearly, and asks before taking any action.

**Arguments:** $ARGUMENTS

- No args — audit only, report findings
- `--fix` — audit then offer to apply safe fixes (stale dates, registry drift)

---

## Step 0: Parse Arguments

Check $ARGUMENTS:
- If `--fix`: run full audit (Steps 1–5), then offer fix options in Step 6
- Otherwise: run full audit (Steps 1–5) and report only

---

## Step 1: Inventory Scan

Collect the raw file list from all scanned directories.

```bash
# Knowledge files
find knowledge/ -name "*.md" 2>/dev/null | sort
find -L companies/*/knowledge/ companies/*/projects/*/knowledge/ -name "*.md" 2>/dev/null | sort

# CLAUDE.md index files (all levels)
find . -name "CLAUDE.md" -not -path "./.git/*" -not -path "./repos/*" -not -path "./workspace/*" -not -path "./.claude/CLAUDE.md" 2>/dev/null | sort

# Exception README.md files (loops/, knowledge/skills/)
find . \( -path "./loops/README.md" -o -path "./knowledge/skills/README.md" \) 2>/dev/null | sort

# Beads tasks (epics)
bd list --type epic --json 2>/dev/null || true

# Skills
find .claude/skills/ -maxdepth 1 -mindepth 1 -type d 2>/dev/null | sort
find .claude/skills/ -name "SKILL.md" 2>/dev/null | sort

# Commands
find .claude/commands/ -name "*.md" 2>/dev/null | sort
```

Store counts for the report header.

---

## Step 2: Staleness Check

**Goal:** Find content with dates older than 90 days that may be out of date.

For each `CLAUDE.md` index file found in Step 1, check the `Updated:` line:

```bash
grep -r "Updated:" knowledge/ companies/*/knowledge/ companies/*/projects/*/knowledge/ --include="CLAUDE.md" -l 2>/dev/null
grep -r "> Auto-generated. Updated:" . --include="CLAUDE.md" 2>/dev/null
```

For each knowledge file, look for embedded dates:

```bash
grep -rn "20[0-9][0-9]-[0-1][0-9]-[0-3][0-9]" knowledge/ companies/*/knowledge/ companies/*/projects/*/knowledge/ --include="*.md" -l 2>/dev/null
```

Flag any CLAUDE.md index whose `Updated:` date is more than 90 days old.
Flag any knowledge file last modified (git log) more than 180 days ago with no recent git touches:

```bash
git log --pretty=format:"%ad %s" --date=short -- knowledge/ 2>/dev/null | head -30
git log --diff-filter=M --name-only --pretty=format:"%ad" --date=short -- knowledge/ companies/*/knowledge/ companies/*/projects/*/knowledge/ 2>/dev/null | head -40
```

Collect: `stale_indexes[]`, `stale_knowledge[]`

---

## Step 3: Orphan Detection

**Goal:** Find files that exist on disk but are not referenced in any CLAUDE.md index.

### 3a: Knowledge orphans

For each knowledge subdirectory, read its `CLAUDE.md` (if any). Extract linked file/dir names. Compare against actual directory listing.

```bash
# List actual knowledge dirs and files
ls -1 knowledge/ 2>/dev/null
ls -1L companies/*/knowledge/ companies/*/projects/*/knowledge/ 2>/dev/null
```

For each `knowledge/{dir}/CLAUDE.md`, extract markdown links:

```bash
grep -oP '\[.*?\]\((.*?)\)' knowledge/*/CLAUDE.md 2>/dev/null | grep -oP '\((.*?)\)' | tr -d '()'
```

Any file in `knowledge/`, `companies/*/knowledge/`, or `companies/*/projects/*/knowledge/` not linked from any index = orphan candidate.

### 3b: Task health (beads)

Check for stale or orphaned beads tasks:

```bash
bd stale --json 2>/dev/null || true
bd list --type epic --json 2>/dev/null || true
```

Flag epics with no children or all children closed but epic still open.

### 3c: Skill orphans

Check skill directories have `SKILL.md`:

```bash
# Dirs that exist
ls -1 .claude/skills/ 2>/dev/null

# Check each dir for SKILL.md
for dir in .claude/skills/*/; do
  skill=$(basename "$dir")
  [[ "$skill" == "_template" ]] && continue
  [[ -f "${dir}SKILL.md" ]] || echo "MISSING SKILL.md: $skill"
done
```

Flag: dirs in `.claude/skills/` that have no `SKILL.md` (and are not `_template`).

Collect: `orphan_knowledge[]`, `stale_tasks[]`, `skill_registry_drift[]`

---

## Step 4: Broken Link Detection

**Goal:** Find markdown links in CLAUDE.md index files and knowledge files that point to non-existent paths.

For each `CLAUDE.md` index and key knowledge file, extract relative links and verify they resolve:

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

### 5b: Duplicate commands

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
  knowledge/                        {N} files
  companies/*/knowledge/             {N} files
  companies/*/projects/*/knowledge/  {N} files
  beads tasks          {N} epics, {N} open subtasks
  .claude/skills/      {N} skills
  .claude/commands/    {N} commands
  CLAUDE.md index files  {N} found

--- STALE CONTENT ---
{if none}  No stale content found.
{else}
  CLAUDE.md index files with outdated timestamps ({count}):
    - {path}  (Updated: {date}, {days} days ago)

  Knowledge files untouched > 180 days ({count}):
    - {path}  (last modified: {date})

--- ORPHANED FILES ---
{if none}  No orphans found.
{else}
  Knowledge files not referenced in any index ({count}):
    - {path}

  Skills in .claude/skills/ missing from registry ({count}):
    - {dir}

  Registry entries with missing directories ({count}):
    - {id}  declared path: {path}

  Stale beads tasks ({count}):
    - {id}: {title}  (not updated in {N} days)

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

--- SUMMARY ---
  {total_issues} issues found.
  {0 issues: "GHQ content is healthy." | else: "Review findings above."}
```

If `--fix` was NOT passed and issues were found, print:

```
Run `/garden --fix` to apply safe automated fixes.
```

---

## Step 7: Fix Offers (only when `--fix` passed)

Present each fixable issue group with a numbered offer. Ask once before taking any action.

```
Fixable issues found:

[1] Refresh {N} stale CLAUDE.md index timestamps
    → Update "Updated: {date}" lines to today
    Files: {list}

[2] Create {N} missing SKILL.md files
    → Scaffold SKILL.md for skill directories missing one
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

## Rules

- **Never take action without asking first** — audit is always read-only unless `--fix` or `--archive` is passed, and even then user confirmation is required before any write
- **Minimal edits only** — fix only what is flagged; do not reformulate, rewrite, or reorganize content that is not an identified issue
- **qmd update after every change** — always reindex after applying fixes or archiving
- **Report first, act second** — always print the full audit report before offering fixes
- **Stale threshold: CLAUDE.md indexes = 90 days, knowledge files = 180 days** — these are guidance thresholds, not hard deletes
- **Skills _template is not a skill** — never flag `.claude/skills/_template/` as an orphan or registry gap
