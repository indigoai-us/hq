# restore

List available HQ backups and restore the installation from a selected snapshot.

## Usage

```
/run migration-agent restore
```

Or via the `/migrate --restore` command.

## Process

### 1. Locate Backup Directory

Check that `.hq-backup/` exists at the HQ root:

```bash
if [[ ! -d ".hq-backup" ]]; then
  echo "No .hq-backup/ directory found."
  echo "Nothing to restore."
  # Exit -- no backups have ever been created
fi
```

If `.hq-backup/` does not exist, display the message and stop. No further action.

### 2. Scan and List Available Backups

Scan `.hq-backup/` for subdirectories. Each valid backup has a `backup-manifest.json` file (written by the `execute` skill during migration).

#### 2a. Read Manifests

For each subdirectory in `.hq-backup/`, attempt to read `backup-manifest.json` and extract key metadata fields:

| Manifest Field | Display Label | Example |
|----------------|--------------|---------|
| `timestamp` | Timestamp | 2026-02-14T10:30:00Z |
| `hqVersion` | Version | v5.4.0 |
| `fileCount` | Files | 325 |
| `symlinkCount` | Symlinks | 12 |
| `totalSizeHuman` | Size | 4.2 MB |
| `backupMethod` | Method | rsync |
| `platform` | Platform | windows-bash |

**Manifest parsing without jq:** Since `jq` may not be installed on all platforms, use `grep` and `sed` to extract values:

```bash
read_manifest_field() {
  local file="$1" field="$2"
  grep -o "\"$field\": *\"[^\"]*\"" "$file" 2>/dev/null | sed 's/.*: *"//;s/"$//' || echo ""
}

read_manifest_number() {
  local file="$1" field="$2"
  grep -o "\"$field\": *[0-9]*" "$file" 2>/dev/null | grep -o '[0-9]*$' || echo "0"
}
```

#### 2b. Build Backup List

Sort backup directories by name (which is the timestamp, so chronological order is preserved). Build a numbered list of valid backups:

```bash
BACKUP_LIST=()
INDEX=0

for dir in .hq-backup/*/; do
  [[ -d "$dir" ]] || continue
  MANIFEST="$dir/backup-manifest.json"

  if [[ -f "$MANIFEST" ]]; then
    TIMESTAMP=$(read_manifest_field "$MANIFEST" "timestamp")
    VERSION=$(read_manifest_field "$MANIFEST" "hqVersion")
    FILE_COUNT=$(read_manifest_number "$MANIFEST" "fileCount")
    SYMLINK_COUNT=$(read_manifest_number "$MANIFEST" "symlinkCount")
    SIZE=$(read_manifest_field "$MANIFEST" "totalSizeHuman")
    METHOD=$(read_manifest_field "$MANIFEST" "backupMethod")
    PLATFORM=$(read_manifest_field "$MANIFEST" "platform")

    INDEX=$((INDEX + 1))
    BACKUP_LIST+=("$dir")
    # Store metadata for display
  else
    INDEX=$((INDEX + 1))
    BACKUP_LIST+=("$dir")
    # Mark as "manifest missing -- unverified"
  fi
done
```

If no backups found (empty BACKUP_LIST):
```
No backups found in .hq-backup/
Nothing to restore.
```

#### 2c. Display Backup List

Present all available backups to the user with full metadata. Use AskUserQuestion to let them choose:

```
Available Backups:

  1. 2026-02-14T10:30:00Z
     Version: v5.4.0
     Files: 325 (12 symlinks)
     Size: 4.2 MB
     Method: rsync | Platform: macos

  2. 2026-02-10T08:15:00Z
     Version: v5.2.0
     Files: 310 (10 symlinks)
     Size: 3.8 MB
     Method: tar | Platform: windows-bash

  3. 2026-02-01T12:00:00Z
     (manifest missing -- unverified)
     Directory: .hq-backup/20260201T120000Z/

Select backup to restore [1-3] or 'cancel':
```

For backups without a manifest, still list them but mark as "manifest missing -- unverified". These can still be restored but file count verification will be skipped.

**Use AskUserQuestion** to get the user's selection. Accept a number (1-N) or "cancel".

### 3. Confirm Restore

After user selects a backup, display a clear confirmation prompt with full details about what will happen:

```
Restore from Backup
====================
Backup:   .hq-backup/{selected_timestamp}/
Version:  v{backup_version}
Files:    {file_count} ({symlink_count} symlinks)
Size:     {size}

WARNING: This will overwrite your current HQ files with the backup.
Your current files will NOT be backed up automatically.
The .hq-backup/ directory itself will be preserved (not overwritten).

Proceed with restore? [Y/n]
```

**Use AskUserQuestion** for the confirmation. Default to Y (proceed). If user says no or cancel, exit with:
```
Restore cancelled. No changes made.
```

**Important:** Warn the user that current files will be overwritten WITHOUT an automatic pre-restore backup. If the user wants to save their current state first, they should create a manual backup.

### 4. Execute Restore

Copy all files from the selected backup directory back to the HQ root, overwriting existing files.

#### 4a. Platform Detection

Use the same platform detection logic as the backup step (see `execute` skill, section 2b):

```bash
detect_platform() {
  case "$(uname -s 2>/dev/null)" in
    Darwin)  echo "macos" ;;
    Linux)   echo "linux" ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows-bash" ;;
    *)       echo "unknown" ;;
  esac
}

PLATFORM=$(detect_platform)
```

#### 4b. Copy Files Back (Cross-Platform)

Restore from the selected backup directory to the HQ root. The strategy mirrors the backup approach from the `execute` skill but in reverse.

**Critical exclusions during restore:**
- `backup-manifest.json` -- this is metadata about the backup, not an HQ file
- `.hq-backup/` -- NEVER overwrite the backup directory itself (this preserves all backups including the one being restored from)
- `.git/` -- git history should not be restored from backup (it lives independently)
- `repos/` -- symlink targets, independently versioned

##### Strategy A: rsync (preferred -- macOS / Linux)

```bash
if command -v rsync &>/dev/null; then
  RESTORE_METHOD="rsync"
  rsync -a \
    --exclude='backup-manifest.json' \
    "$BACKUP_DIR/" ./
fi
```

`rsync -a` preserves permissions, timestamps, symlinks (as symlinks), and directory structure. It will overwrite existing files with the backup versions.

**Note:** We do NOT exclude `.hq-backup/` or `.git/` from rsync here because they should not exist in the backup directory itself (they were excluded during backup creation). However, if they somehow ended up in the backup, rsync will write them -- which is harmless since they'd be the same versions.

##### Strategy B: tar pipe (universal fallback -- all platforms including Windows/Git Bash)

```bash
RESTORE_METHOD="tar"
(cd "$BACKUP_DIR" && tar cf - --exclude='backup-manifest.json' .) | tar xf -
```

The `tar` pipe preserves symlinks as symlinks. It extracts into the current directory (HQ root), overwriting existing files.

##### Strategy C: PowerShell (native Windows without Git Bash)

```powershell
$restoreMethod = "robocopy"
robocopy $backupDir . /E /SL /DCOPY:T /COPY:DT `
  /XF backup-manifest.json `
  /NFL /NDL /NP
```

`robocopy /SL` preserves symlinks. `/XF` excludes the manifest file.

##### Platform Selection Logic

```bash
BACKUP_DIR=".hq-backup/{selected_timestamp}"

case "$PLATFORM" in
  macos|linux)
    # Prefer rsync, fall back to tar
    if command -v rsync &>/dev/null; then
      RESTORE_METHOD="rsync"
      rsync -a \
        --exclude='backup-manifest.json' \
        "$BACKUP_DIR/" ./
    else
      RESTORE_METHOD="tar"
      (cd "$BACKUP_DIR" && tar cf - --exclude='backup-manifest.json' .) | tar xf -
    fi
    ;;
  windows-bash)
    # tar pipe (most reliable on MSYS2/Git Bash)
    RESTORE_METHOD="tar"
    (cd "$BACKUP_DIR" && tar cf - --exclude='backup-manifest.json' .) | tar xf -
    ;;
  *)
    # Unknown platform -- try tar, then fail gracefully
    RESTORE_METHOD="tar"
    (cd "$BACKUP_DIR" && tar cf - --exclude='backup-manifest.json' .) | tar xf - \
    || { echo "ERROR: Restore failed on unknown platform."; exit 1; }
    ;;
esac
```

**Do NOT use `cp -a --exclude`** -- the `--exclude` flag is a GNU extension not available on macOS or Windows.

#### 4c. Revert .hq-version

After restoring files, explicitly handle `.hq-version`:

```bash
if [[ -f "$BACKUP_DIR/.hq-version" ]]; then
  # Backup had a .hq-version -- copy it to HQ root
  cp "$BACKUP_DIR/.hq-version" ./.hq-version
  RESTORED_VERSION=$(cat .hq-version | tr -d '[:space:]')
  echo ".hq-version reverted to: $RESTORED_VERSION"
elif [[ -f .hq-version ]]; then
  # Backup did NOT have .hq-version (pre-migration-tool installation)
  # Remove the current .hq-version since it wasn't part of that version
  rm .hq-version
  echo ".hq-version removed (backup predates migration tool)"
  RESTORED_VERSION="unknown (pre-migration-tool)"
else
  # Neither had .hq-version -- nothing to do
  RESTORED_VERSION="unknown"
fi
```

This ensures `.hq-version` accurately reflects the backup state:
- If the backup was from a version that had `.hq-version`, it gets restored
- If the backup predates the migration tool (no `.hq-version`), the current one is removed
- The version in the restore report reflects the actual restored state

**Note:** The rsync/tar restore in Step 4b will handle `.hq-version` if it exists in the backup. This explicit step is a safety net for the case where `.hq-version` exists in the current HQ but NOT in the backup (meaning it should be removed).

#### 4d. Preserve the Backup

**NEVER delete the backup after restore.** The user may need it again, or may need to restore a second time. All backups in `.hq-backup/` are preserved indefinitely. Cleanup is the user's responsibility.

The `.hq-backup/` directory is safe because:
1. It was excluded from the original backup (via `--exclude='.hq-backup'` during backup creation)
2. The restore excludes `backup-manifest.json` but not the backup contents
3. Since `.hq-backup/` does not exist inside any backup directory, the restore will never touch it

### 5. Verify Restore

After the restore completes, verify the result by comparing file counts against the backup manifest.

#### 5a. Count Restored Files

```bash
MANIFEST="$BACKUP_DIR/backup-manifest.json"

if [[ -f "$MANIFEST" ]]; then
  EXPECTED=$(read_manifest_number "$MANIFEST" "fileCount")
  ACTUAL=$(find . -type f \
    -not -path './node_modules/*' \
    -not -path './.git/*' \
    -not -path './.hq-backup/*' \
    -not -path './repos/*' \
    | wc -l | tr -d ' ')

  DIFF=$(( ACTUAL - EXPECTED ))

  if [[ "$DIFF" -ge -5 && "$DIFF" -le 5 ]]; then
    VERIFY_STATUS="MATCH"
  else
    VERIFY_STATUS="MISMATCH"
  fi
else
  EXPECTED="unknown"
  ACTUAL=$(find . -type f \
    -not -path './node_modules/*' \
    -not -path './.git/*' \
    -not -path './.hq-backup/*' \
    -not -path './repos/*' \
    | wc -l | tr -d ' ')
  VERIFY_STATUS="UNVERIFIED (no manifest)"
fi
```

**Note on tolerance:** We use a tolerance of 5 files (wider than the 2-file tolerance in backup verification) because:
- The HQ may have acquired new files since the backup was created
- Some temp files or lock files may exist now but not in the backup
- The important thing is that the backup files were successfully restored

#### 5b. Display Verification Results

```
Restore Verification
====================
Expected files: {expected}
Actual files:   {actual}
Difference:     {diff}
Status:         {MATCH | MISMATCH -- manual verification recommended | UNVERIFIED}
```

If MISMATCH, warn the user:
```
WARNING: File count mismatch detected. This may be normal if files were
added or removed since the backup was created. Manual verification is
recommended. The backup is still available at: .hq-backup/{timestamp}/
```

### 6. Generate Restore Report

Save a detailed restore report to `workspace/reports/restore-{ISO-timestamp}.md`.

**Ensure the workspace/reports/ directory exists:**
```bash
mkdir -p workspace/reports
```

**Report format:**

```markdown
# HQ Restore Report

**Date:** {current ISO-8601 timestamp}
**Restored from:** .hq-backup/{selected_timestamp}/
**Restored version:** v{backup_version}
**Restore method:** {rsync|tar|robocopy}
**Platform:** {macos|linux|windows-bash}

## Backup Details
- Backup timestamp: {backup_timestamp}
- HQ version at backup: v{backup_version}
- Files in backup: {file_count} ({symlink_count} symlinks)
- Backup size: {total_size_human}

## Verification
- Expected file count: {expected}
- Actual file count: {actual}
- Difference: {diff}
- Status: {MATCH | MISMATCH | UNVERIFIED}

## .hq-version
- Reverted to: {restored_version}
- Method: {copied from backup | removed (backup predates migration tool) | unchanged}

## Notes
- Backup preserved at: .hq-backup/{selected_timestamp}/
- All other backups in .hq-backup/ are also preserved
- If files seem incorrect, the backup is still available for manual recovery
- To run another migration: /migrate
- To see available backups: /migrate --restore
```

**Display the report** to the user after saving, and confirm the file location:

```
Restore Report
==============
Report saved: workspace/reports/restore-{timestamp}.md

Restore complete.
  Version: v{backup_version}
  Files restored: {file_count}
  Verification: {status}
  Backup preserved at: .hq-backup/{selected_timestamp}/
```

### 7. Update Search Index

If qmd is available, update the search index to reflect the restored state:

```bash
qmd update 2>/dev/null || true
```

## Output

- Numbered list of available backups with metadata (timestamp, version, file count, size)
- User selection prompt via AskUserQuestion
- Confirmation prompt with warnings via AskUserQuestion
- Restore execution with progress
- Verification results (file count comparison)
- Restore report (displayed and saved to workspace/reports/)

## Error Handling

| Scenario | Action |
|----------|--------|
| `.hq-backup/` directory missing | Display "No backups found." and exit |
| No valid backup subdirectories | Display "No backups found." and exit |
| Manifest missing from backup | List backup as "unverified", allow restore but skip verification |
| Manifest JSON malformed | Treat as missing manifest -- extract what fields are readable |
| Permission errors during restore | Log specific files, continue with remaining files, report at end |
| Partial restore (some files fail) | Report which files failed, note backup is still intact |
| Disk space insufficient | Detect before starting if possible, abort with clear message |
| User cancels at selection | Exit with "No changes made" |
| User cancels at confirmation | Exit with "No changes made" |
| Invalid selection input | Re-prompt with valid range |

## Safety Rules

1. **NEVER delete the backup** after restore -- user might need it again
2. **NEVER auto-restore** -- always require explicit user confirmation via AskUserQuestion
3. **Warn about current state** -- current files will be overwritten without automatic backup
4. **Verify after restore** -- compare file counts against manifest
5. **Preserve .hq-backup/** -- the backup directory itself is never touched during restore
6. **Preserve .git/** -- git history is independent of HQ filesystem state
7. **Handle .hq-version correctly** -- revert to backup version, or remove if backup predates migration tool
8. **Report everything** -- every action logged in the restore report
