---
description: Upgrade HQ to the latest version — fetch template, diff, backup, and migrate
allowed-tools: Task, Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion
argument-hint: [--restore | --status | --yolo]
visibility: public
---

# /migrate - HQ Auto-Migration

Upgrade your HQ installation to the latest filesystem structure from the canonical template on GitHub. Full backup and restore capabilities included.

**User's input:** $ARGUMENTS

## Modes

- **No args**: Interactive migration — detect, diff, review plan, approve, execute
- **--yolo**: Skip plan review — detect, diff, backup, execute immediately
- **--restore**: List backups and restore from a selected snapshot
- **--status**: Show current version and available updates (no changes)

## The Flow

### Step 1: Parse Arguments

**If `--restore`:**
- Load the migration-agent restore skill: `workers/migration-agent/skills/restore.md`
- The restore skill will:
  1. Scan `.hq-backup/` and list available backups with metadata (timestamp, version, file count, size)
  2. Prompt user to select a backup via AskUserQuestion
  3. Confirm before executing (WARNING: overwrites current files)
  4. Copy backup files back to HQ root (rsync/tar/robocopy, cross-platform)
  5. Revert `.hq-version` to the backup's version
  6. Verify restore (file count check against manifest)
  7. Generate restore report at `workspace/reports/restore-{timestamp}.md`
  8. Preserve the backup (never delete it)
- Run: `/run migration-agent restore`
- Exit after restore completes (or if user cancels)

**If `--status`:**
- Detect current version:
  - If `.hq-version` exists: read version string directly (trim whitespace)
  - If missing: infer from filesystem (see Step 2 below for full inference logic)
- Fetch latest version from GitHub (lightweight — single file, no temp directory needed):
  - **Preferred:** `gh api repos/indigoai-us/hq/contents/template/.hq-version --jq '.content' | base64 -d`
  - **Fallback 1:** `gh api repos/indigoai-us/hq/contents/template/CHANGELOG.md --jq '.content' | base64 -d` and parse first `## v{X.Y.Z}` heading
  - **Fallback 2:** `curl -sL https://raw.githubusercontent.com/indigoai-us/hq/main/template/.hq-version`
  - **If all fail:** Display "Could not fetch latest version. Check internet connection." and show current version only
- Display:
  ```
  HQ Version Status
  =================
  Current: v{local} ({detected via .hq-version | inferred from filesystem})
  Latest:  v{latest}
  Status:  {Up to date | Update available (v{local} -> v{latest})}
  ```
- If update available, suggest: "Run `/migrate` to upgrade"
- If latest version could not be determined, suggest: "Run `/migrate` to check for updates (requires fetching full template)"
- Exit (no temp directory to clean up — status mode uses single-file API calls)

**If no args or `--yolo`:**
- Continue to Step 2

### Step 2: Detect Current Version

#### .hq-version File Format

The `.hq-version` file lives at the HQ root and contains a single semver string (e.g. `5.4.0`), optionally with a trailing newline. No other content. This file is the authoritative version marker, written by the migration tool after each successful upgrade.

#### Detection Logic

**If `.hq-version` exists:** Read and trim whitespace. This is the current version.

**If `.hq-version` is missing (legacy installation):** Infer from filesystem structural clues. Check all clues and use the highest matching version:

| Clue | Check | Version |
|------|-------|---------|
| CHANGELOG.md latest entry | Parse first `## v{X.Y.Z}` heading | exact match |
| `/setup` has CLI checks | `grep -q "vercel" .claude/commands/setup.md` | v5.2+ |
| Knowledge dirs are symlinks | `find knowledge/ -maxdepth 1 -type l` | v5.2+ |
| Context Diet in CLAUDE.md | `grep -q "Context Diet" .claude/CLAUDE.md` | v5.1+ |
| `workers/sample-worker/` exists | `test -d workers/sample-worker` | v5.0+ |
| `/personal-interview` command | `test -f .claude/commands/personal-interview.md` | v5.0+ |
| `workers/registry.yaml` version field | Parse `version:` value | from field |
| `.claude/commands/learn.md` exists | `test -f .claude/commands/learn.md` | v4.0+ |
| INDEX.md system active | `test -f knowledge/hq-core/index-md-spec.md` | v4.0+ |
| Auto-Handoff in CLAUDE.md | `grep -q "Auto-Handoff" .claude/CLAUDE.md` | v3.3+ |
| `/remember` command exists | `test -f .claude/commands/remember.md` | v3.2+ |
| `/search` uses qmd | `grep -q "qmd" .claude/commands/search.md` | v3.0+ |
| `workspace/orchestrator/` exists | `test -d workspace/orchestrator` | v2.0+ |
| `workspace/threads/` exists | `test -d workspace/threads` | v2.0+ |

If no clues match, version is `unknown` — warn user this may not be an HQ installation.

See the migration-agent `analyze` skill for the full inference algorithm with edge cases.

Display:
```
Current HQ version: v{version}
Detection method: {.hq-version file | filesystem inference}
```

### Step 3: Fetch Latest Template

Fetch the `template/` directory from `github.com/indigoai-us/hq` (main branch). See the migration-agent `analyze` skill (Step 3) for the full detailed implementation. Summary below.

#### 3a. Prep

Clean up any stale temp directories from previously failed migrations:
```bash
find "${TMPDIR:-/tmp}" -maxdepth 1 -name "hq-migrate-*" -type d -mmin +60 -exec rm -rf {} + 2>/dev/null
```

Create a new temp directory:
```bash
MIGRATE_TMPDIR=$(mktemp -d "${TMPDIR:-/tmp}/hq-migrate-XXXXXX")
```

If temp dir creation fails, abort with error. No changes are made.

#### 3b. Tiered Fetch (3 strategies, automatic fallback)

Try each strategy in order. Stop at the first success:

| # | Strategy | Requires | Bandwidth |
|---|----------|----------|-----------|
| 1 | `gh api` tarball | `gh` CLI + auth | Medium (full tarball, extract template/) |
| 2 | `git sparse-checkout` | `git` | Low (metadata + template/ blobs only) |
| 3 | `git clone --depth 1` | `git` | High (full shallow clone) |

Display progress at each step:
```
Fetching latest HQ template...
  Strategy: {strategy name}
  Downloading...
  Extracting template/ directory...
  Template fetched successfully via {strategy}.
```

If ALL strategies fail, display comprehensive troubleshooting:
```
ERROR: All fetch strategies failed.

Possible causes:
  - No internet connection
  - GitHub is unreachable (check https://githubstatus.com)
  - Repository access denied (run 'gh auth login')
  - Firewall or proxy blocking git/HTTPS traffic

Troubleshooting:
  1. Check internet:  curl -s https://api.github.com/rate_limit
  2. Check GitHub:    gh auth status
  3. Manual test:     git ls-remote https://github.com/indigoai-us/hq.git
```
Clean up temp directory and abort. Do not proceed without a template.

#### 3c. Validate and Version

After successful fetch:
- Validate template has expected structure (CLAUDE.md, registry.yaml, MIGRATION.md)
- Count files (expect ~325; warn if fewer than 10)
- Extract latest version from `template/.hq-version` (preferred) or `CHANGELOG.md` (fallback)
- If version cannot be determined, abort

Display:
```
Fetching latest HQ template... done.
Latest version: v{latest}
Template files: {count}
```

#### 3d. Version Gate

If current version equals latest:
```
Already up to date (v{version}). No migration needed.
```
Clean up temp directory and exit.

If update available, continue to Step 4.

### Step 4: Diff Filesystem

Compare the fetched template against the local HQ installation. The migration-agent `analyze` skill (Step 4, sections 4a–4l) contains the full diff engine implementation. Summary below.

**Process:**
1. Apply the ignore list to exclude user-only paths from both file tree walks
2. Walk both `$MIGRATE_TMPDIR/template/` and local HQ root recursively, building file inventories with SHA-256 hashes, type metadata, and symlink targets
3. Compare inventories — categorize every file as: NEW, MODIFIED, DELETED, UNCHANGED, LOCAL_ONLY, or RENAMED
4. For MODIFIED files, generate readable diff summaries (line counts, section changes for `.md`, key changes for `.yaml`) — never raw unified diffs
5. Detect renames/moves via hash comparison across paths (same content, different path)
6. Flag special files (CLAUDE.md, worker.yaml, commands, registry) with their merge strategies
7. Handle `.gitkeep` as "ensure directory exists" directives
8. Compare symlinks by target path, binary files by size+hash

**Ignore list** (user-only data, never diff):
- `workspace/threads/`, `workspace/learnings/`, `workspace/orchestrator/`, `workspace/checkpoints/`, `workspace/reports/`, `workspace/content-ideas/`
- `companies/`, `projects/`, `repos/`
- `agents.md` (content — structure-only comparison for schema changes)
- `social-content/drafts/`
- `.hq-backup/`, `.git/`, `.beads/`, `node_modules/`, `dist/`
- `*.log`, `*.lock`, `.DS_Store`, `Thumbs.db`, `*.stackdump`

**Special files** (merge, don't replace):
- `.claude/CLAUDE.md` — preserve `## Learned Rules` section (HIGH impact)
- `workers/*/worker.yaml` — preserve `instructions:` field (MEDIUM impact)
- `.claude/commands/*.md` — preserve `## Rules` section (MEDIUM impact)
- `workers/registry.yaml` — additive merge (MEDIUM impact)
- `agents.md` — NEVER overwrite (HIGH impact)

Display summary after diff completes:
```
Filesystem Diff: v{current} -> v{latest}
==========================================
  NEW: {n}  MODIFIED: {n}  DELETED: {n}  RENAMED: {n}
  UNCHANGED: {n}  LOCAL_ONLY: {n}
  Special files requiring merge: {n}
```

### Step 5: Generate Migration Plan

Build a categorized, human-friendly migration plan from the diff results. This is a readable document, not a raw diff dump. See the migration-agent `analyze` skill (Step 5, sections 5a-5f) for the full plan generation implementation. Summary below.

**Plan structure (in order):**

1. **Summary Stats** -- counts at the top for quick scanning
2. **High-Impact Changes** -- flagged items that deserve attention (CLAUDE.md, worker.yaml, registry.yaml, commands)
3. **Files to Update** -- MODIFIED files, sorted by impact level (HIGH -> MEDIUM -> LOW)
4. **Files to Add** -- NEW files from template, grouped by directory
5. **Files to Remove** -- DELETED files (archived to backup, never hard-deleted)
6. **Structural Changes** -- RENAMED/moved files with old -> new paths
7. **Directories to Create** -- new directory structures needed

**Each plan entry includes:**
- File path
- Action (ADD / UPDATE / REMOVE / MOVE)
- Brief rationale (WHY the change is happening, not just what changed)

**High-impact file detection:** Files matching these patterns get a `[!]` warning marker:
- `.claude/CLAUDE.md` -- affects all Claude sessions
- `workers/*/worker.yaml` -- affects worker behavior
- `workers/registry.yaml` -- affects worker discovery
- `.claude/commands/*.md` -- affects slash commands
- `agents.md` -- personal profile (never overwritten)

**Plan display format:**

```markdown
# Migration Plan: v{current} -> v{latest}

## Summary

| Metric | Count |
|--------|-------|
| Files to add | {n} |
| Files to update | {n} |
| Files to remove | {n} |
| Files to move/rename | {n} |
| Directories to create | {n} |
| **Total changes** | **{n}** |

{special_files_count} file(s) require smart merge (your data preserved)

## [!] High-Impact Changes

- **{path}** -- {warning}
  Action: {action} | Strategy: {merge_strategy}

## Files to Update ({count})

- [!] `{path}` -- {rationale}  (high-impact)
- `{path}` -- {rationale}

## Files to Add ({count})

- `{path}` -- {rationale}

## Files to Remove ({count})

- `{path}` -- archived to backup

## Structural Changes ({count})

- `{old_path}` -> `{new_path}`
```

**Save plan** to `workspace/migration-plans/migrate-{ISO-timestamp}.md` regardless of what the user chooses next. This creates an audit trail.

Display: `Migration plan saved: workspace/migration-plans/migrate-{timestamp}.md`

### Step 6: User Decision

The migration plan is ready. Now present the user with an interactive choice.

#### 6a. YOLO Mode (--yolo flag)

**If `--yolo` was passed as an argument:**
- Skip the interactive prompt entirely
- Display:
  ```
  YOLO mode activated! Skipping plan review.
  Sending it. Hold onto your hat...

  Plan saved: workspace/migration-plans/migrate-{timestamp}.md
  Proceeding directly to backup + execution...
  ```
- Continue to Step 7 (Create Backup)

#### 6b. Interactive Mode (default -- no flags)

**Present the user with a choice using AskUserQuestion:**

```
Migration plan ready!

  {add_count} files to add
  {update_count} files to update
  {remove_count} files to remove
  {rename_count} files to move/rename
  {special_count} files with smart merge (your data preserved)

How would you like to proceed?

1. Review plan and approve -- see full details, then decide
2. YOLO -- skip the review, just do it
3. Cancel -- abort migration, no changes made

Plan has been saved to workspace/migration-plans/migrate-{timestamp}.md
```

**Handle user response:**

#### Option 1: Review and Approve

1. Display the FULL migration plan (the complete markdown document from Step 5)
2. After displaying, use AskUserQuestion again:

```
That's the full plan. {total_changes} total changes.

{if high_impact_count > 0:}
Note: {high_impact_count} high-impact change(s) flagged above -- your data
will be preserved via smart merge strategies.
{end if}

Proceed with migration?

1. Yes -- create backup and execute
2. No -- cancel (plan is saved for reference)
```

- **If Yes:** Continue to Step 7 (Create Backup)
- **If No:**
  - Clean up temp directory: `rm -rf "$MIGRATE_TMPDIR"`
  - Display:
    ```
    Migration cancelled. No changes were made.
    Plan saved: workspace/migration-plans/migrate-{timestamp}.md
    Temp files cleaned up.

    You can review the plan anytime and re-run /migrate when ready.
    ```
  - Exit

#### Option 2: YOLO

- Display:
  ```
  YOLO it is! Skipping the boring part.

  Plan saved: workspace/migration-plans/migrate-{timestamp}.md
  Proceeding directly to backup + execution...
  ```
- Continue to Step 7 (Create Backup)

#### Option 3: Cancel

- Clean up temp directory: `rm -rf "$MIGRATE_TMPDIR"`
- Display:
  ```
  Migration cancelled. No changes were made.
  Plan saved: workspace/migration-plans/migrate-{timestamp}.md
  Temp files cleaned up.

  The plan is saved for reference -- take your time, run /migrate when ready.
  ```
- Exit

#### 6c. Edge Cases

- **No changes detected** (all files unchanged): Skip the choice entirely. Display:
  ```
  No changes needed! Your HQ matches the latest template exactly.
  ```
  Clean up temp directory and exit.

- **Only LOW-impact changes:** Still present the full choice, but note:
  ```
  All changes are low-impact (documentation, metadata). No user data affected.
  ```

- **User input not recognized:** Re-prompt with the same AskUserQuestion. Do not proceed on ambiguous input.

### Step 7: Create Backup

Create a full snapshot backup before any changes. This is the primary safety net — it MUST succeed or the entire migration is aborted.

See the migration-agent `execute` skill (section 2) for the complete cross-platform backup implementation. The summary:

```bash
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_DIR=".hq-backup/$TIMESTAMP"
mkdir -p "$BACKUP_DIR"
```

**What gets backed up:** Everything in the HQ root.

**Exclusions** (too large, self-referential, or independently versioned):
- `node_modules/` — recreated by package manager
- `.git/` — git history, not HQ structure
- `.hq-backup/` — never backup backups
- `repos/` — symlink targets, independently versioned

**Symlinks:** Preserved AS symlinks (not followed). Knowledge repo symlinks like `knowledge/topic -> ../../repos/public/knowledge-topic` are stored as the symlink itself.

**Cross-platform copy strategy:**
- macOS/Linux: `rsync -a` with `--exclude` flags (preferred)
- All platforms fallback: `tar cf - --exclude=... . | (cd $BACKUP_DIR && tar xf -)`
- Native Windows (no bash): `robocopy /E /SL /XD ...`
- **Never use `cp -a --exclude`** — the `--exclude` flag is GNU-only, not portable

**Backup manifest** (`{BACKUP_DIR}/backup-manifest.json`):
```json
{
  "version": "1.0",
  "timestamp": "{ISO-8601}",
  "hqVersion": "{current version}",
  "hqPath": "{absolute path to HQ}",
  "fileCount": 0,
  "symlinkCount": 0,
  "totalSizeBytes": 0,
  "totalSizeHuman": "0 B",
  "excludedDirs": ["node_modules", ".git", ".hq-backup", "repos"],
  "platform": "{macos|linux|windows-bash}",
  "backupMethod": "{rsync|tar|robocopy}",
  "symlinkHandling": "preserved-as-symlinks"
}
```

**Verification:** Compare file count in source (with same exclusions) against file count in backup. Allow tolerance of 1-2 files for race conditions. If mismatch exceeds tolerance, warn user and ask to confirm before proceeding.

**Display:**
```
Backup Created
==============
Location:  .hq-backup/{timestamp}/
Files:     {count} ({symlink_count} symlinks preserved)
Size:      {human_readable_size}
Verified:  {VERIFIED | MISMATCH}
```

**Old backups are NOT auto-deleted.** User controls cleanup manually.

**If backup fails: ABORT.** Do not proceed with migration. Display clear error and exit.

### Step 8: Execute Migration

Apply changes following the phased execution process defined in the migration-agent `execute` skill (Step 3). The execution is managed through 7 phases, each completing before the next begins. See `workers/migration-agent/skills/execute.md` for the full implementation with merge strategies, error handling, and validation logic.

**Phase summary (order matters -- safest first):**

0. **Dry-run validation** -- verify all source files exist, directories are writable, disk space sufficient. If validation fails, abort with zero side effects.
1. **Create directories** -- new directories from template, sorted shallowest first
2. **Add NEW files** -- copy from template to local (symlinks preserved as symlinks)
3. **Update MODIFIED files** -- backup each original BEFORE change, then apply based on merge strategy:
   - `overwrite` -- template replaces local entirely (default for most files)
   - `section_merge` -- **CLAUDE.md**: extract user's `## Learned Rules` verbatim, update everything else from template, re-inject user rules
   - `yaml_merge` -- **worker.yaml**: extract user's `instructions:` block and custom fields, update template structure, re-inject user content
   - `never_overwrite` -- **agents.md**: NEVER touch content, only warn about structural format differences
   - `preserve_rules_section` -- **commands/*.md**: preserve user's `## Rules` section, update rest from template
   - `additive_merge` -- **registry.yaml**: add new worker entries, preserve existing entries
4. **Remove DELETED files** -- move to `.hq-backup/{timestamp}/removed/` (never hard-delete), clean up empty parent dirs
5. **Handle RENAMED files** -- move from old path to new path, backup old location first
6. **Update `.hq-version`** -- write new version string ONLY if all phases completed without critical failure

**Data integrity enforcement:**
- Every modified file is backed up to `.hq-backup/{timestamp}/modified/` BEFORE any change
- If backup of a single file fails, that file is SKIPPED (never modified without backup)
- User content (Learned Rules, instructions, agents.md) is copied byte-for-byte, never interpreted
- Merge validation: after each merge, verify user content appears verbatim in output; fall back to keeping user version on failure

**If any critical step fails:**
- Stop immediately (do not proceed to later phases)
- Do NOT update `.hq-version` (version reflects last successful state)
- Clean up temp directory: `rm -rf "$MIGRATE_TMPDIR"`
- Report what succeeded and what failed (per-phase counters)
- Instruct: "Run `/migrate --restore` to roll back using backup at {backup_dir}"

### Step 9: Report

Generate a detailed migration report and display a condensed summary to the console. See the migration-agent `execute` skill (Step 5, sections 5a-5d) for the complete report generation implementation with full template and partial failure handling.

**Two outputs are produced:**

1. **Full report** (saved to disk): `workspace/reports/migration-{timestamp}.md` -- contains every file action, backup details, summary statistics table, warnings, errors, and restore instructions. Uses the same timestamp as the backup directory for easy correlation.

2. **Console summary** (displayed): A condensed version showing counts by category, backup location, and restore command. Truncates warnings/errors lists to keep output readable.

**For successful migrations:**

```
Migration Complete!
===================
From: v{old} -> To: v{new}
Date: {ISO-8601 UTC}

Summary:
  Directories created:  {count}
  Files added:          {count}
  Files updated:        {count}
  Files removed:        {count}
  Files skipped:        {count}
  ─────────────────────────────
  Total processed:      {total}

Backup: .hq-backup/{timestamp}/  ({size})

Full report: workspace/reports/migration-{timestamp}.md

To undo this migration:
  /migrate --restore
```

**For incomplete/failed migrations:**

```
MIGRATION INCOMPLETE
====================
From: v{old} -> To: v{new} (FAILED)
Date: {ISO-8601 UTC}
Stopped at phase: {phase_name}

What was completed before failure:
  Directories created:  {count}
  Files added:          {count}
  Files updated:        {count}
  Files removed:        {count}
  Files skipped:        {count}

Errors:
  - {error_1}
  - {error_2}

.hq-version was NOT updated (still at v{old}).

Backup: .hq-backup/{timestamp}/  ({size})

Full report: workspace/reports/migration-{timestamp}.md

To restore your HQ to its pre-migration state:
  /migrate --restore
  Select backup: {timestamp}
```

**The full report includes sections not shown in console output:**
- File-by-file action listings (added, updated, removed, skipped with reasons)
- "Incomplete" section listing what was NOT done (for partial failures)
- Summary statistics table with counts by category
- Complete restore instructions (both `/migrate --restore` and manual `rsync`/`tar` commands)
- Backup verification status and manifest reference

**Report is always generated** -- even if the migration failed partway through. The report documents exactly what succeeded and what did not, giving the user a clear picture for deciding whether to restore or continue manually.

### Step 10: Cleanup

Remove the temporary directory used for the fetched template. This MUST happen in all exit paths — success, failure, and cancellation.

```bash
# Clean up the temp directory
if [[ -n "$MIGRATE_TMPDIR" && -d "$MIGRATE_TMPDIR" ]]; then
  rm -rf "$MIGRATE_TMPDIR"
  echo "Cleaned up temp directory."
fi
```

**Cleanup is mandatory in ALL exit paths:**
- After successful migration (this step)
- After user cancels (Step 6, option 3)
- After version-match early exit (Step 3d)
- After fetch failure (Step 3b, all strategies fail)
- After any critical error that aborts the migration

Update the search index if qmd is available:
```bash
qmd update 2>/dev/null || true
```

---

## Rules

- **Backup before everything** — never modify files without a backup existing
- **User approval required** — unless `--yolo` flag is passed
- **Data integrity is non-negotiable** — see migration-agent worker.yaml instructions
- **Clean up temp files** — always remove the fetched template after migration, cancellation, or failure
- **Report everything** — every action logged, every change documented
- **Fail safe** — on error, stop, clean up temp files, and point user to restore
- **Never modify user data** — agents.md, companies/, learned rules are sacred
- **Preserve symlinks** — knowledge repo symlinks are never followed or replaced
- **Never leave temp directories behind** — every exit path cleans up `$MIGRATE_TMPDIR`
