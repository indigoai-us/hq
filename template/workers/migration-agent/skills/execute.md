# execute

Create a full snapshot backup of the current HQ, then execute the migration plan to upgrade the filesystem to the latest template version.

## Usage

```
/run migration-agent execute
```

Requires: a migration plan from the `analyze` skill (saved in `workspace/migration-plans/`).

## Process

### 1. Load Migration Plan

Read the most recent plan from `workspace/migration-plans/plan-*.md`. If no plan exists, abort and instruct the user to run `analyze` first.

Confirm with user before proceeding:
```
Ready to execute migration plan: v{current} -> v{latest}

Changes: {add} to add, {update} to update, {remove} to remove

This will:
1. Create a full backup in .hq-backup/{timestamp}/
2. Apply all changes from the migration plan
3. Update .hq-version to {latest}

Proceed? [Y/n]
```

### 2. Create Full Snapshot Backup

This is the primary safety net for the migration. It MUST be 100% reliable. If the backup fails for any reason, ABORT the entire migration immediately. Do not proceed without a verified backup.

#### 2a. Generate Timestamp and Create Backup Directory

```bash
# Generate ISO-8601 UTC timestamp for the backup directory name
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_DIR=".hq-backup/$TIMESTAMP"
mkdir -p "$BACKUP_DIR"
```

#### 2b. Copy Files (Cross-Platform)

The backup must work on macOS, Linux, and Windows (Git Bash / MSYS2). Different platforms have different `cp` and `rsync` capabilities, so use the right strategy for each.

**Exclusions** (too large, self-referential, or independently versioned):
- `node_modules/` -- package manager artifacts, easily recreated
- `.git/` -- git history, large and not part of HQ structure
- `.hq-backup/` -- never backup backups (self-referential)
- `repos/` -- symlink targets, independently versioned git repos

**Critical requirement: Preserve symlinks AS symlinks.** Knowledge repo symlinks (e.g., `knowledge/some-topic -> ../../repos/public/knowledge-some-topic`) must be stored as the symlink itself, NOT the contents of the target directory.

##### Strategy A: rsync (preferred -- macOS / Linux)

```bash
if command -v rsync &>/dev/null; then
  rsync -a \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='.hq-backup' \
    --exclude='repos' \
    ./ "$BACKUP_DIR/"
fi
```

`rsync -a` preserves permissions, timestamps, symlinks (as symlinks), and directory structure. The `--exclude` flags handle all exclusions cleanly.

##### Strategy B: tar pipe (universal fallback -- all platforms including Windows/Git Bash)

If `rsync` is not available (common on Windows / Git Bash), use a `tar` pipe:

```bash
tar cf - \
  --exclude='./node_modules' \
  --exclude='./.git' \
  --exclude='./.hq-backup' \
  --exclude='./repos' \
  . | (cd "$BACKUP_DIR" && tar xf -)
```

On MSYS2 / Git Bash, `tar` is available and handles symlinks correctly. The `tar cf -` creates a tar stream to stdout, piped to `tar xf -` which extracts in the backup directory. This preserves symlinks as symlinks without following them.

##### Strategy C: PowerShell (native Windows without Git Bash)

If running in a pure Windows environment (no bash), use PowerShell:

```powershell
$timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$backupDir = ".hq-backup\$timestamp"
New-Item -ItemType Directory -Force -Path $backupDir

# Use robocopy with /SL to preserve symlinks
robocopy . $backupDir /E /SL /DCOPY:T /COPY:DT `
  /XD node_modules .git .hq-backup repos `
  /NFL /NDL /NP
```

`robocopy /SL` copies symlinks as symlinks (not following them). `/E` copies all subdirectories including empty ones.

##### Platform Detection Logic

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

case "$PLATFORM" in
  macos|linux)
    # Prefer rsync, fall back to tar
    if command -v rsync &>/dev/null; then
      BACKUP_METHOD="rsync"
      rsync -a \
        --exclude='node_modules' \
        --exclude='.git' \
        --exclude='.hq-backup' \
        --exclude='repos' \
        ./ "$BACKUP_DIR/"
    else
      BACKUP_METHOD="tar"
      tar cf - \
        --exclude='./node_modules' \
        --exclude='./.git' \
        --exclude='./.hq-backup' \
        --exclude='./repos' \
        . | (cd "$BACKUP_DIR" && tar xf -)
    fi
    ;;
  windows-bash)
    # tar pipe (most reliable on MSYS2/Git Bash)
    BACKUP_METHOD="tar"
    tar cf - \
      --exclude='./node_modules' \
      --exclude='./.git' \
      --exclude='./.hq-backup' \
      --exclude='./repos' \
      . | (cd "$BACKUP_DIR" && tar xf -)
    ;;
  *)
    # Unknown platform -- try tar, then fail gracefully
    BACKUP_METHOD="tar"
    tar cf - \
      --exclude='./node_modules' \
      --exclude='./.git' \
      --exclude='./.hq-backup' \
      --exclude='./repos' \
      . | (cd "$BACKUP_DIR" && tar xf -) \
    || { echo "ERROR: Backup failed on unknown platform. Aborting."; exit 1; }
    ;;
esac
```

**Important: Do NOT use `cp -a --exclude`** -- the `--exclude` flag is a GNU extension that does not exist on macOS `cp` or Windows. Always use `rsync` or `tar` which support exclusions natively across platforms.

#### 2c. Generate Backup Manifest

After the copy completes, generate `backup-manifest.json` with full metadata about the backup:

```bash
# Count files in the backup (exclude the manifest itself)
FILE_COUNT=$(find "$BACKUP_DIR" -type f -not -name "backup-manifest.json" | wc -l | tr -d ' ')

# Count symlinks preserved
SYMLINK_COUNT=$(find "$BACKUP_DIR" -type l | wc -l | tr -d ' ')

# Calculate total size in bytes (cross-platform)
if [[ "$PLATFORM" == "macos" ]]; then
  TOTAL_SIZE=$(find "$BACKUP_DIR" -type f -not -name "backup-manifest.json" -exec stat -f%z {} + 2>/dev/null | awk '{s+=$1} END {print s+0}')
else
  # Linux and Windows/Git Bash both support GNU stat
  TOTAL_SIZE=$(find "$BACKUP_DIR" -type f -not -name "backup-manifest.json" -exec stat --printf="%s\n" {} + 2>/dev/null | awk '{s+=$1} END {print s+0}')
fi

# Read current HQ version
HQ_VERSION="unknown"
if [[ -f .hq-version ]]; then
  HQ_VERSION=$(cat .hq-version | tr -d '[:space:]')
fi

# Get HQ absolute path
HQ_PATH=$(pwd)
```

**Human-readable size conversion:**

```bash
human_size() {
  local bytes=$1
  if (( bytes < 1024 )); then echo "${bytes} B"
  elif (( bytes < 1048576 )); then echo "$(( bytes / 1024 )) KB"
  elif (( bytes < 1073741824 )); then
    echo "$(awk "BEGIN {printf \"%.1f\", $bytes/1048576}") MB"
  else
    echo "$(awk "BEGIN {printf \"%.1f\", $bytes/1073741824}") GB"
  fi
}

SIZE_HUMAN=$(human_size "$TOTAL_SIZE")
```

Write the manifest JSON to `{BACKUP_DIR}/backup-manifest.json`:

```json
{
  "version": "1.0",
  "timestamp": "{ISO-8601 UTC timestamp, e.g. 2026-02-14T10:30:00Z}",
  "hqVersion": "{current HQ version from .hq-version or 'unknown'}",
  "hqPath": "{absolute path to HQ installation}",
  "fileCount": {number of regular files backed up},
  "symlinkCount": {number of symlinks preserved as symlinks},
  "totalSizeBytes": {total size of backed up files in bytes},
  "totalSizeHuman": "{human-readable size, e.g. '4.2 MB'}",
  "excludedDirs": ["node_modules", ".git", ".hq-backup", "repos"],
  "platform": "{macos|linux|windows-bash|unknown}",
  "backupMethod": "{rsync|tar|robocopy}",
  "symlinkHandling": "preserved-as-symlinks"
}
```

#### 2d. Verify Backup Integrity

After creating the backup and writing the manifest, verify that the backup is consistent by comparing file counts:

```bash
# Count files in the source (same exclusions as backup)
SOURCE_COUNT=$(find . -type f \
  -not -path './node_modules/*' \
  -not -path './.git/*' \
  -not -path './.hq-backup/*' \
  -not -path './repos/*' \
  | wc -l | tr -d ' ')

# Read backup file count from the manifest
BACKUP_COUNT=$FILE_COUNT

# Compare counts
DIFF=$(( SOURCE_COUNT - BACKUP_COUNT ))
if [[ "$DIFF" -eq 0 ]]; then
  VERIFY_STATUS="VERIFIED"
elif [[ "$DIFF" -ge -2 && "$DIFF" -le 2 ]]; then
  # Allow tolerance of 1-2 files (race conditions, temp files)
  VERIFY_STATUS="VERIFIED (within tolerance: $DIFF files)"
else
  VERIFY_STATUS="MISMATCH"
fi
```

**If verification shows MISMATCH:**
- Display the file count discrepancy clearly
- Ask user: "Backup verification shows a file count mismatch (source: {SOURCE_COUNT}, backup: {BACKUP_COUNT}). Continue anyway? [y/N]"
- Default to NO -- safety first
- If user says no, ABORT the migration. The backup directory remains for inspection.

**If verification passes (VERIFIED):**
- Display success and continue to migration execution

#### 2e. Display Backup Summary

```
Backup Created
==============
Location:  .hq-backup/{timestamp}/
Files:     {file_count} ({symlink_count} symlinks preserved)
Size:      {human_readable_size}
Manifest:  .hq-backup/{timestamp}/backup-manifest.json
Verified:  {VERIFIED | VERIFIED (within tolerance) | MISMATCH}
Platform:  {platform}
Method:    {rsync|tar|robocopy}

To restore from this backup later:
  /migrate --restore
```

**If backup creation fails at ANY point: ABORT the entire migration immediately.** Display:
```
ERROR: Backup creation failed.
Reason: {error description}
Migration ABORTED -- no changes were made to your HQ.
Fix the issue and try again, or create a manual backup first.
```

### 3. Execute Migration Plan

Apply changes in this order (safest first). Each phase completes fully before the next begins. If any phase encounters a critical failure, STOP — do not proceed to later phases.

**Execution state tracking:** Maintain counters and logs throughout execution:

```
execution_state = {
  "phase": "not_started",
  "dirs_created": [],
  "files_added": [],
  "files_updated": [],
  "files_removed": [],
  "files_skipped": [],
  "errors": [],
  "warnings": [],
  "critical_failure": false
}
```

#### Phase 0: Dry-Run Validation

Before writing ANY files, validate that all planned operations CAN succeed. This prevents partial execution.

**Validate all source files exist:**

```
for each entry in plan.NEW:
  source = "$MIGRATE_TMPDIR/template/{entry.path}"
  if source does NOT exist:
    add to errors: "Source missing for NEW file: {entry.path}"

for each entry in plan.MODIFIED:
  source = "$MIGRATE_TMPDIR/template/{entry.path}"
  local_file = "HQ_ROOT/{entry.path}"
  if source does NOT exist:
    add to errors: "Template source missing for MODIFIED file: {entry.path}"
  if local_file does NOT exist AND entry.merge_strategy != "never_overwrite":
    add to warnings: "Local file missing for MODIFIED entry: {entry.path} (will treat as NEW)"

for each entry in plan.RENAMED:
  if "HQ_ROOT/{entry.old_path}" does NOT exist:
    add to warnings: "Source for rename missing: {entry.old_path} (will skip rename)"
```

**Validate directory writability:**

```bash
# Test write permission on HQ root
if ! touch "$HQ_ROOT/.hq-migrate-test" 2>/dev/null; then
  CRITICAL: "Cannot write to HQ root directory. Check permissions."
fi
rm -f "$HQ_ROOT/.hq-migrate-test"

# Test write permission on backup directory
if ! touch "$BACKUP_DIR/.hq-migrate-test" 2>/dev/null; then
  CRITICAL: "Cannot write to backup directory. Check permissions."
fi
rm -f "$BACKUP_DIR/.hq-migrate-test"
```

**Validate disk space (best-effort):**

```bash
# Estimate required space: sum of all NEW + MODIFIED template file sizes
# This is approximate -- actual need includes backup copies of MODIFIED files
REQUIRED_BYTES=$(find "$MIGRATE_TMPDIR/template" -type f -exec stat --printf="%s\n" {} + 2>/dev/null | awk '{s+=$1} END {print s+0}')

# Check available space (cross-platform)
if command -v df &>/dev/null; then
  AVAILABLE_BYTES=$(df -B1 "$HQ_ROOT" 2>/dev/null | tail -1 | awk '{print $4}')
  if [[ -n "$AVAILABLE_BYTES" && "$AVAILABLE_BYTES" -lt "$REQUIRED_BYTES" ]]; then
    add to warnings: "Low disk space: need ~{REQUIRED_BYTES} bytes, have {AVAILABLE_BYTES}"
  fi
fi
```

**If critical errors found in dry-run:**

```
if errors is not empty:
  display "Dry-run validation FAILED. {N} error(s) found:"
  for each error:
    display "  - {error}"
  display ""
  display "Migration ABORTED before any changes were made."
  display "Fix the issues above and re-run /migrate."
  clean up temp directory
  EXIT
```

**If only warnings found:** Display warnings and continue. Warnings are informational — they may indicate skippable actions, not blocking failures.

#### Phase 1: Create Directories

Create any new directories from the template that don't exist locally. This runs first because later phases need these directories to exist for file copies.

```
execution_state.phase = "create_directories"

for each directory in plan.new_directories (sorted by depth, shallowest first):
  full_path = "HQ_ROOT/{directory}"

  if directory already exists:
    skip (already exists)
    continue

  mkdir -p "$full_path"

  if mkdir failed:
    add to errors: "Failed to create directory: {directory}"
    # Non-critical: continue with other directories
  else:
    add to dirs_created: directory
    log: "Created directory: {directory}/"
```

**Depth-first sorting** ensures parent directories are created before children (e.g., `workers/new-worker/` before `workers/new-worker/skills/`).

```bash
# Sort directories by depth (fewest slashes first)
sort_by_depth() {
  while IFS= read -r dir; do
    echo "$(echo "$dir" | tr -cd '/' | wc -c) $dir"
  done | sort -n | cut -d' ' -f2-
}
```

#### Phase 2: Add NEW Files

Copy files from the fetched template that don't exist in local HQ. These are safe additions — no local data is at risk.

```
execution_state.phase = "add_new_files"

for each entry in plan.NEW (sorted alphabetically by path):
  source = "$MIGRATE_TMPDIR/template/{entry.path}"
  destination = "HQ_ROOT/{entry.path}"

  # Skip .gitkeep files if the directory already exists
  if entry.path ends with ".gitkeep":
    dir = dirname(destination)
    if dir exists AND dir is not empty:
      skip (.gitkeep not needed — directory already has content)
      continue

  # Ensure parent directory exists
  parent = dirname(destination)
  if parent does NOT exist:
    mkdir -p "$parent"

  # Handle symlinks: preserve as symlink
  if entry.type == "symlink":
    target = readlink "$source"
    ln -s "$target" "$destination"
    if failed:
      add to errors: "Failed to create symlink: {entry.path} -> {target}"
    else:
      add to files_added: entry.path
      log: "Added symlink: {entry.path} -> {target}"
    continue

  # Copy file (preserve permissions where possible)
  cp -p "$source" "$destination" 2>/dev/null || cp "$source" "$destination"

  if copy failed:
    add to errors: "Failed to add file: {entry.path}"
  else:
    add to files_added: entry.path
    log: "Added: {entry.path}"
```

**Error handling for Phase 2:** Individual file failures are logged but NOT critical. The phase continues. Only a total inability to write (e.g., disk full, permissions) should trigger a critical abort.

```bash
# Detect critical failure: if more than 50% of files fail to copy, abort
FAIL_RATE=$(( ${#errors[@]} * 100 / ${total_new_files} ))
if [[ "$FAIL_RATE" -gt 50 ]]; then
  CRITICAL: "More than 50% of new files failed to copy. Possible disk/permission issue."
  execution_state.critical_failure = true
  ABORT — skip remaining phases
fi
```

#### Phase 3: Update MODIFIED Files

This is the most complex phase. Each modified file is handled according to its merge strategy. The original is ALWAYS backed up before any change is applied.

```
execution_state.phase = "update_modified_files"

# Create the modified-files backup subdirectory
mkdir -p "$BACKUP_DIR/modified"

for each entry in plan.MODIFIED (sorted: HIGH impact first, then MEDIUM, then LOW):
  source = "$MIGRATE_TMPDIR/template/{entry.path}"
  local_file = "HQ_ROOT/{entry.path}"
  backup_path = "$BACKUP_DIR/modified/{entry.path}"
  strategy = entry.merge_strategy  # from the analyze skill's special files registry

  # --- Step 3a: Backup the original BEFORE any modification ---

  # Ensure backup subdirectory exists
  mkdir -p "$(dirname "$backup_path")"

  # Copy original to backup (preserve as-is)
  if local_file is a symlink:
    # Preserve symlink in backup
    target = readlink "$local_file"
    ln -s "$target" "$backup_path"
  else:
    cp -p "$local_file" "$backup_path" 2>/dev/null || cp "$local_file" "$backup_path"

  if backup copy failed:
    add to errors: "CRITICAL: Failed to backup {entry.path} — skipping update"
    add to files_skipped: entry.path
    continue  # NEVER modify a file without backing it up first

  # --- Step 3b: Apply update based on merge strategy ---

  case strategy:

    "overwrite":
      # Simple replacement — template version wins completely
      apply_overwrite(source, local_file, entry)

    "section_merge":
      # CLAUDE.md and similar: preserve user sections, update template sections
      apply_section_merge(source, local_file, entry)

    "yaml_merge":
      # worker.yaml: preserve user instructions, update template structure
      apply_yaml_merge(source, local_file, entry)

    "never_overwrite":
      # agents.md: NEVER touch content. Log and skip.
      apply_never_overwrite(source, local_file, entry)

    "preserve_rules_section":
      # .claude/commands/*.md: preserve ## Rules section, update rest
      apply_preserve_rules(source, local_file, entry)

    "additive_merge":
      # workers/registry.yaml: add new entries, preserve existing
      apply_additive_merge(source, local_file, entry)

    default:
      # Unknown strategy — fall back to overwrite with warning
      add to warnings: "Unknown merge strategy '{strategy}' for {entry.path} — using overwrite"
      apply_overwrite(source, local_file, entry)
```

##### Merge Strategy: `overwrite`

The simplest strategy. Replace the local file entirely with the template version.

```
apply_overwrite(source, local_file, entry):
  cp -p "$source" "$local_file" 2>/dev/null || cp "$source" "$local_file"

  if copy failed:
    add to errors: "Failed to update: {entry.path}"
    add to files_skipped: entry.path
  else:
    add to files_updated: entry.path
    log: "Updated (overwrite): {entry.path}"
```

##### Merge Strategy: `section_merge` (CLAUDE.md)

The most critical merge. CLAUDE.md contains both template-managed structure and user-authored Learned Rules. The merge preserves the user's rules verbatim while updating everything else from the template.

```
apply_section_merge(source, local_file, entry):
  # Read both files completely
  template_content = read_file(source)
  local_content = read_file(local_file)

  # --- Extract user's Learned Rules section ---
  # The section starts with "## Learned Rules" and ends at the next "## " heading
  # or end of file. Capture EVERYTHING between these boundaries verbatim.

  user_rules = extract_section(local_content, "## Learned Rules")

  # extract_section algorithm:
  #   1. Find the line "## Learned Rules" (exact heading match)
  #   2. Capture all lines from there until the next line starting with "## "
  #      (a different level-2 heading) or end of file
  #   3. Include the "## Learned Rules" heading itself
  #   4. Preserve blank lines, comments, numbering, formatting — everything

  if user_rules is empty or not found:
    # User has no learned rules — just use template as-is
    write template_content to local_file
    add to files_updated: entry.path
    log: "Updated (section_merge, no user rules found): {entry.path}"
    return

  # --- Inject user rules into template ---
  # The template CLAUDE.md should have its own "## Learned Rules" section
  # (possibly empty or with placeholder content). Replace it with the user's.

  template_has_rules_section = "## Learned Rules" in template_content

  if template_has_rules_section:
    # Replace the template's Learned Rules section with user's version
    template_rules = extract_section(template_content, "## Learned Rules")
    merged = template_content.replace(template_rules, user_rules)
  else:
    # Template doesn't have a Learned Rules section — append user's at the end
    # (before the last section, or at EOF)
    merged = template_content + "\n" + user_rules

  # --- Validate merge ---
  # Critical check: the user's rules must appear VERBATIM in the merged output
  for each line in user_rules.split("\n"):
    if line.strip() and line not in merged:
      add to warnings: "Learned Rule line may have been lost during merge: '{line[:80]}...'"
      # Fall back to keeping user's version
      add to warnings: "CLAUDE.md merge incomplete — keeping user version for safety"
      write local_content to local_file  # Restore original
      add to files_skipped: entry.path
      return

  write merged to local_file
  add to files_updated: entry.path
  log: "Updated (section_merge): {entry.path} — Learned Rules preserved"
```

**`extract_section` helper — precise section extraction:**

```
extract_section(content, heading):
  lines = content.split("\n")
  section_lines = []
  in_section = false
  heading_level = count leading "#" in heading  # e.g., "## " = 2

  for each line in lines:
    if line starts with heading (exact match or heading + whitespace/newline):
      in_section = true
      section_lines.append(line)
      continue

    if in_section:
      # Check if we've hit the NEXT heading at the same or higher level
      if line matches /^#{1,heading_level}\s/ AND line != heading:
        # We've reached the next section — stop capturing
        break
      section_lines.append(line)

  # Trim trailing blank lines but preserve internal blank lines
  while section_lines and section_lines[-1].strip() == "":
    section_lines.pop()

  return "\n".join(section_lines)
```

**Edge cases for CLAUDE.md merge:**
- If user has added content AFTER the Learned Rules section (custom sections), those will be lost if they're not in the template. To prevent this, also extract any sections that exist in local but NOT in template, and append them after the merge.
- If the user's CLAUDE.md has been heavily customized (more than 50% of lines differ from any known template version), flag for manual review instead of merging.
- HTML comments within the Learned Rules section (like `<!-- Auto-managed by /learn -->`) are preserved — they are part of the section.

##### Merge Strategy: `yaml_merge` (worker.yaml)

Worker YAML files have a clear structure: template-managed fields (skills, context, verification, execution) and user-authored content (instructions block, custom fields).

```
apply_yaml_merge(source, local_file, entry):
  template_content = read_file(source)
  local_content = read_file(local_file)

  # --- Extract user's instructions block ---
  # The instructions block starts with "instructions: |" or "instructions:" followed
  # by an indented block. Capture the entire block verbatim.

  user_instructions = extract_yaml_block(local_content, "instructions")

  # extract_yaml_block algorithm:
  #   1. Find the line starting with "instructions:" (at root level, no leading spaces)
  #   2. If the line is "instructions: |" or "instructions: |+", capture the
  #      indented block that follows (all lines with leading whitespace until
  #      the next root-level key)
  #   3. If the line is "instructions: " followed by inline content, capture just that line
  #   4. Preserve indentation exactly as-is

  if user_instructions is empty:
    # No user instructions — use template as-is
    write template_content to local_file
    add to files_updated: entry.path
    log: "Updated (yaml_merge, no user instructions): {entry.path}"
    return

  # --- Extract user's custom fields ---
  # Custom fields are root-level YAML keys that exist in local but NOT in template.
  # These are user additions that should be preserved.

  template_keys = extract_root_yaml_keys(template_content)
  local_keys = extract_root_yaml_keys(local_content)
  custom_keys = [k for k in local_keys if k not in template_keys]

  custom_blocks = {}
  for key in custom_keys:
    custom_blocks[key] = extract_yaml_block(local_content, key)

  # --- Merge ---
  # Start with template content, replace its instructions block with user's

  template_instructions = extract_yaml_block(template_content, "instructions")

  if template_instructions:
    merged = template_content.replace(template_instructions, user_instructions)
  else:
    # Template has no instructions block — append user's
    merged = template_content + "\n" + user_instructions

  # Append custom fields at the end
  for key, block in custom_blocks:
    if key not in merged:
      merged = merged + "\n" + block

  # --- Validate ---
  # Ensure user instructions appear in merged output
  instruction_content_lines = [
    line for line in user_instructions.split("\n")
    if line.strip() and not line.strip().startswith("instructions:")
  ]
  for line in instruction_content_lines[:5]:  # Check first 5 content lines
    if line not in merged:
      add to warnings: "worker.yaml merge may have lost user instructions — keeping user version"
      write local_content to local_file  # Restore original
      add to files_skipped: entry.path
      return

  write merged to local_file
  add to files_updated: entry.path
  log: "Updated (yaml_merge): {entry.path} — user instructions preserved"
```

**`extract_yaml_block` helper:**

```
extract_yaml_block(content, key):
  lines = content.split("\n")
  block_lines = []
  in_block = false
  block_indent = -1

  for each line in lines:
    if not in_block:
      # Look for root-level key (no leading whitespace)
      if line matches /^{key}:/:
        in_block = true
        block_lines.append(line)

        # Determine if this is a block scalar (| or |+)
        if line matches /^{key}:\s*\|/:
          block_indent = "detect"  # Will detect from next line
        elif line matches /^{key}:\s*$/:
          block_indent = "detect"
        else:
          # Inline value — just this one line
          break
        continue

    if in_block:
      if block_indent == "detect":
        # First indented line determines the indent level
        leading_spaces = count leading whitespace in line
        if leading_spaces > 0:
          block_indent = leading_spaces
        elif line.strip() == "":
          block_lines.append(line)  # Blank lines within block
          continue
        else:
          break  # Next root key reached

      # Check if this line continues the block
      if line starts with " " * block_indent OR line.strip() == "":
        block_lines.append(line)
      else:
        # Non-indented, non-blank line = next root key
        break

  # Trim trailing blank lines
  while block_lines and block_lines[-1].strip() == "":
    block_lines.pop()

  return "\n".join(block_lines)

extract_root_yaml_keys(content):
  keys = []
  for line in content.split("\n"):
    if line matches /^[a-zA-Z_][a-zA-Z0-9_-]*:/:
      key = line.split(":")[0]
      keys.append(key)
  return keys
```

##### Merge Strategy: `never_overwrite` (agents.md)

The simplest strategy — do nothing. `agents.md` is sacred user data.

```
apply_never_overwrite(source, local_file, entry):
  # NEVER overwrite agents.md or any file flagged with this strategy
  add to files_skipped: entry.path
  log: "Skipped (never_overwrite): {entry.path} — user data preserved"

  # Optional: structural format check
  # If the template version has a significantly different structure
  # (e.g., new sections, renamed headings), add a warning
  template_headings = extract_headings(read_file(source))
  local_headings = extract_headings(read_file(local_file))
  new_headings = [h for h in template_headings if h not in local_headings]

  if new_headings:
    add to warnings: "{entry.path}: Template has new sections ({', '.join(new_headings)}). Manual update may be needed."
```

##### Merge Strategy: `preserve_rules_section` (.claude/commands/*.md)

Command files may have a user-maintained `## Rules` section at the bottom. Preserve it while updating the rest from the template.

```
apply_preserve_rules(source, local_file, entry):
  template_content = read_file(source)
  local_content = read_file(local_file)

  # Extract user's ## Rules section (same algorithm as CLAUDE.md Learned Rules)
  user_rules = extract_section(local_content, "## Rules")

  if user_rules is empty:
    # No user rules — use template as-is
    write template_content to local_file
    add to files_updated: entry.path
    log: "Updated (preserve_rules): {entry.path} — no user rules found"
    return

  # Check if template has a ## Rules section
  template_rules = extract_section(template_content, "## Rules")

  if template_rules:
    # Template has rules section too — merge both
    # User rules take priority, but template rules that don't conflict are added
    merged_rules = merge_rules_sections(template_rules, user_rules)
    merged = template_content.replace(template_rules, merged_rules)
  else:
    # Template has no rules section — append user's at the end
    merged = template_content.rstrip() + "\n\n" + user_rules + "\n"

  write merged to local_file
  add to files_updated: entry.path
  log: "Updated (preserve_rules): {entry.path} — user Rules section preserved"
```

**`merge_rules_sections` — combining template and user rules:**

```
merge_rules_sections(template_rules, user_rules):
  # Strategy: start with user's rules (they are authoritative)
  # Then append any template rules that are NOT already in user's section

  user_rule_lines = [
    line.strip() for line in user_rules.split("\n")
    if line.strip().startswith("- ")
  ]

  template_rule_lines = [
    line for line in template_rules.split("\n")
    if line.strip().startswith("- ")
  ]

  # Find template rules not already in user rules (by content comparison)
  new_template_rules = []
  for tline in template_rule_lines:
    tline_normalized = tline.strip().lower()
    already_exists = any(
      uline.lower() in tline_normalized or tline_normalized in uline.lower()
      for uline in user_rule_lines
    )
    if not already_exists:
      new_template_rules.append(tline)

  if new_template_rules:
    # Append new template rules after user's rules
    return user_rules.rstrip() + "\n" + "\n".join(new_template_rules)
  else:
    return user_rules
```

##### Merge Strategy: `additive_merge` (workers/registry.yaml)

The registry tracks all workers. The merge adds new workers from the template while preserving existing entries (which may have user customizations like enabled/disabled flags).

```
apply_additive_merge(source, local_file, entry):
  template_content = read_file(source)
  local_content = read_file(local_file)

  # Parse worker entries from both files
  # Worker entries in registry.yaml are typically:
  #   - id: worker-name
  #     path: workers/...
  #     description: ...

  template_workers = extract_registry_entries(template_content)
  local_workers = extract_registry_entries(local_content)

  local_worker_ids = [w.id for w in local_workers]

  # Find new workers in template not in local
  new_workers = [w for w in template_workers if w.id not in local_worker_ids]

  if not new_workers:
    # No new workers — check if header/metadata changed
    # Compare everything EXCEPT the worker list entries
    template_header = extract_before_workers(template_content)
    local_header = extract_before_workers(local_content)

    if template_header != local_header:
      # Update header/metadata from template, keep worker list
      merged = template_header + extract_worker_list(local_content)
      write merged to local_file
      add to files_updated: entry.path
      log: "Updated (additive_merge): {entry.path} — metadata updated, workers preserved"
    else:
      add to files_skipped: entry.path
      log: "Skipped (additive_merge): {entry.path} — no new workers"
    return

  # Append new worker entries to local registry
  merged = local_content.rstrip() + "\n"
  for worker in new_workers:
    merged += "\n" + worker.raw_block + "\n"
    log: "  Added worker to registry: {worker.id}"

  write merged to local_file
  add to files_updated: entry.path
  log: "Updated (additive_merge): {entry.path} — {len(new_workers)} new worker(s) added"
```

**Phase 3 error handling:**

```
# After processing all MODIFIED files, check error rate
if execution_state.critical_failure:
  ABORT — skip remaining phases

# If more than 30% of updates failed, treat as critical
update_fail_count = len([e for e in errors if "Failed to update" in e])
if update_fail_count > 0 AND update_fail_count / len(plan.MODIFIED) > 0.3:
  execution_state.critical_failure = true
  add to errors: "CRITICAL: Too many update failures ({update_fail_count}/{len(plan.MODIFIED)})"
  ABORT — skip remaining phases
```

#### Phase 4: Remove DELETED Files

Files that were removed from the template. These are never hard-deleted — they are archived to the backup directory.

```
execution_state.phase = "remove_deleted_files"

# Create the removed-files backup subdirectory
mkdir -p "$BACKUP_DIR/removed"

for each entry in plan.DELETED:
  local_file = "HQ_ROOT/{entry.path}"
  archive_path = "$BACKUP_DIR/removed/{entry.path}"

  # Skip if file doesn't exist locally (already removed or never existed)
  if local_file does NOT exist:
    add to warnings: "File marked for removal but not found locally: {entry.path}"
    continue

  # Ensure archive subdirectory exists
  mkdir -p "$(dirname "$archive_path")"

  # Move to archive (preserving the file, not copying then deleting)
  mv "$local_file" "$archive_path"

  if move failed:
    # Try copy + delete as fallback
    cp -p "$local_file" "$archive_path" 2>/dev/null && rm "$local_file"

    if still failed:
      add to errors: "Failed to archive removed file: {entry.path}"
      continue

  add to files_removed: entry.path
  log: "Removed (archived): {entry.path} -> .hq-backup/{timestamp}/removed/"

  # Clean up empty parent directories left behind
  parent = dirname(local_file)
  while parent != HQ_ROOT:
    if directory is empty:
      rmdir "$parent" 2>/dev/null  # Only removes if truly empty
    else:
      break
    parent = dirname(parent)
```

#### Phase 5: Handle RENAMED Files

Files that were moved to a new location in the template. The local file at the old path is moved to the new path.

```
execution_state.phase = "rename_files"

for each entry in plan.RENAMED:
  old_path = "HQ_ROOT/{entry.old_path}"
  new_path = "HQ_ROOT/{entry.new_path}"

  if old_path does NOT exist:
    add to warnings: "Rename source missing: {entry.old_path} (skipping)"
    continue

  # Ensure new parent directory exists
  mkdir -p "$(dirname "$new_path")"

  # Backup the old file first (in case something goes wrong)
  backup_path = "$BACKUP_DIR/modified/{entry.old_path}"
  mkdir -p "$(dirname "$backup_path")"
  cp -p "$old_path" "$backup_path" 2>/dev/null

  # Move the file
  mv "$old_path" "$new_path"

  if move failed:
    add to errors: "Failed to rename: {entry.old_path} -> {entry.new_path}"
    continue

  add to files_updated: "{entry.old_path} -> {entry.new_path}"
  log: "Renamed: {entry.old_path} -> {entry.new_path}"
```

#### Phase 6: Update .hq-version

Write the new version string to `.hq-version` in the HQ root. This file is the authoritative version marker used by `/migrate --status` and future migration runs.

**ONLY execute this phase if ALL previous phases completed without critical failure.**

```
execution_state.phase = "update_version"

if execution_state.critical_failure:
  log: "SKIPPED: .hq-version NOT updated due to critical failure in earlier phase"
  add to warnings: ".hq-version was NOT updated — migration incomplete"
  return

# Write version (single semver string with trailing newline)
echo "{latest_version}" > .hq-version

if write failed:
  add to errors: "Failed to update .hq-version"
else:
  log: "Updated .hq-version: {current_version} -> {latest_version}"
```

**Format:** Single line containing a semver string (e.g. `5.4.0`), followed by a newline. No prefix (no `v`), no other content.

**When to write:** Only after ALL previous phases (1-5) have completed without critical failure. If any phase had a critical failure, do NOT update `.hq-version` — the version should reflect the last successful migration state.

**First-time installs:** If `.hq-version` did not previously exist (legacy installation), creating it is the primary marker that this HQ has been through the migration tool.

#### Critical Failure Handling

At any point during execution, if `execution_state.critical_failure` is set to `true`:

```
display ""
display "MIGRATION FAILED"
display "================"
display ""
display "Phase: {execution_state.phase}"
display "Errors:"
for each error in execution_state.errors:
  display "  - {error}"
display ""
display "Completed before failure:"
display "  Directories created: {len(dirs_created)}"
display "  Files added: {len(files_added)}"
display "  Files updated: {len(files_updated)}"
display "  Files removed: {len(files_removed)}"
display "  Files skipped: {len(files_skipped)}"
display ""
display ".hq-version was NOT updated (migration incomplete)."
display ""
display "To restore your HQ to its pre-migration state:"
display "  /migrate --restore"
display "  Select backup: .hq-backup/{timestamp}/"
display ""
display "The backup is intact and contains your complete pre-migration HQ."

# Clean up temp directory even on failure
if [[ -n "$MIGRATE_TMPDIR" && -d "$MIGRATE_TMPDIR" ]]; then
  rm -rf "$MIGRATE_TMPDIR"
fi
```

### 4. Data Integrity Rules

These rules are enforced during execution. Violation = critical failure.

1. **Every modified file backed up BEFORE change** -- no exceptions. If the backup of a single file fails, that file is SKIPPED entirely (never modified without backup).
2. **User content preserved verbatim** -- never interpreted, summarized, rewritten, paraphrased, or "improved". The merge strategies copy user content byte-for-byte.
3. **Symlinks preserved as-is** -- never followed, replaced, or modified. Symlinks in the local HQ are backed up as symlinks and restored as symlinks.
4. **Atomic-ish execution** -- if any phase fails critically, STOP immediately
   - Do not continue with remaining phases
   - Report what succeeded and what failed
   - Instruct user: "Run `/migrate --restore` to roll back"
5. **Dry-run before write** -- Phase 0 validates all operations before any files are touched. If validation fails, the migration is aborted with zero side effects.
6. **agents.md is NEVER overwritten** -- the `never_overwrite` strategy is enforced regardless of what the diff says. Even if agents.md appears in the MODIFIED list, only a structural format warning is emitted.
7. **CLAUDE.md Learned Rules preserved verbatim** -- the `section_merge` strategy extracts the entire `## Learned Rules` section (heading, comments, rules, blank lines) and injects it into the template version. No rewriting, no reordering, no summarization.
8. **worker.yaml instructions preserved verbatim** -- the `yaml_merge` strategy extracts the user's `instructions:` block and injects it into the template version. User-added custom YAML keys are also preserved.
9. **Deleted files archived, never hard-deleted** -- files removed from the template are moved to `.hq-backup/{timestamp}/removed/`, preserving the full directory structure.

### 5. Generate Migration Report

After all execution phases complete (whether fully successful or partially failed), generate a detailed migration report. The report serves two purposes: (1) a persistent record saved to disk, and (2) a condensed console summary displayed to the user.

#### 5a. Determine Report Status

```
if execution_state.critical_failure:
  REPORT_STATUS = "INCOMPLETE"
  REPORT_TITLE = "HQ Migration Report (INCOMPLETE)"
else if len(execution_state.errors) > 0:
  REPORT_STATUS = "COMPLETED_WITH_WARNINGS"
  REPORT_TITLE = "HQ Migration Report"
else:
  REPORT_STATUS = "SUCCESS"
  REPORT_TITLE = "HQ Migration Report"
```

#### 5b. Full Report Template

Save to `workspace/reports/migration-{timestamp}.md`:

```markdown
# {REPORT_TITLE}

**Date:** {ISO-8601 UTC, e.g. 2026-02-14T10:30:00Z}
**From:** v{current_version} -> **To:** v{latest_version}
**Status:** {SUCCESS | COMPLETED_WITH_WARNINGS | INCOMPLETE}
**Backup:** `.hq-backup/{timestamp}/`

---

## Backup Details

| Detail | Value |
|--------|-------|
| Location | `.hq-backup/{timestamp}/` |
| Files backed up | {file_count} |
| Symlinks preserved | {symlink_count} |
| Backup size | {human_readable_size} |
| Verification | {VERIFIED / VERIFIED (within tolerance) / MISMATCH} |
| Platform | {macos / linux / windows-bash} |
| Method | {rsync / tar / robocopy} |

---

## Summary Statistics

| Category | Count |
|----------|------:|
| Directories created | {len(dirs_created)} |
| Files added | {len(files_added)} |
| Files updated | {len(files_updated)} |
| Files removed | {len(files_removed)} |
| Files skipped | {len(files_skipped)} |
| Warnings | {len(warnings)} |
| Errors | {len(errors)} |
| **Total files processed** | **{len(files_added) + len(files_updated) + len(files_removed) + len(files_skipped)}** |

---

## Detailed Actions

### Directories Created ({len(dirs_created)})

{if dirs_created is empty:}
_None_
{else:}
{for each dir in dirs_created:}
- `{dir}/`
{end for}

### Files Added ({len(files_added)})

{if files_added is empty:}
_None_
{else:}
{for each path in files_added:}
- `{path}` -- new from template
{end for}

### Files Updated ({len(files_updated)})

{if files_updated is empty:}
_None_
{else:}
{for each path in files_updated:}
- `{path}` -- original backed up to `.hq-backup/{timestamp}/modified/{path}`
{end for}

### Files Removed ({len(files_removed)})

{if files_removed is empty:}
_None_
{else:}
{for each path in files_removed:}
- `{path}` -- archived to `.hq-backup/{timestamp}/removed/{path}`
{end for}

### Files Skipped ({len(files_skipped)})

{if files_skipped is empty:}
_None_
{else:}
{for each path in files_skipped:}
- `{path}` -- {reason: e.g. "never_overwrite", "backup failed", "merge validation failed"}
{end for}

---

{if REPORT_STATUS == "INCOMPLETE":}
## Incomplete -- Migration Did Not Finish

The migration stopped during phase: **{execution_state.phase}**

### What WAS completed:
{for each completed phase before the failure:}
- Phase {N}: {phase_name} -- {count} actions
{end for}

### What was NOT completed:
{for each remaining phase after the failure:}
- Phase {N}: {phase_name} -- SKIPPED (not started)
{end for}

### Errors that caused the failure:
{for each error in execution_state.errors:}
- {error}
{end for}

**`.hq-version` was NOT updated** -- your HQ version still reads as v{current_version}.

---
{end if}

{if len(warnings) > 0:}
## Warnings

{for each warning in execution_state.warnings:}
- {warning}
{end for}

---
{end if}

{if len(errors) > 0 AND REPORT_STATUS != "INCOMPLETE":}
## Errors

{for each error in execution_state.errors:}
- {error}
{end for}

---
{end if}

## Restore Instructions

To roll back this migration and return to v{current_version}:

1. **Run the restore command:**
   ```
   /migrate --restore
   ```

2. **Select the backup from this migration:**
   - Backup timestamp: `{timestamp}`
   - Backup location: `.hq-backup/{timestamp}/`
   - Backup manifest: `.hq-backup/{timestamp}/backup-manifest.json`

3. **Confirm the restore** when prompted. This will:
   - Replace all current files with the backed-up versions
   - Revert `.hq-version` to v{current_version}
   - Preserve the backup directory (it is NOT deleted after restore)

4. **Verify after restore:**
   - Check `.hq-version` reads `{current_version}`
   - Spot-check a few files that were modified
   - Run `/migrate --status` to confirm version

**Manual restore (if `/migrate --restore` is unavailable):**

```bash
# From the HQ root directory:
BACKUP_DIR=".hq-backup/{timestamp}"

# Option A: rsync (macOS/Linux)
rsync -a --delete \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='.hq-backup' \
  --exclude='repos' \
  "$BACKUP_DIR/" ./

# Option B: tar pipe (all platforms)
cd "$BACKUP_DIR" && tar cf - . | (cd "$HQ_ROOT" && tar xf -)
```

---

_Report generated by HQ Migration Agent v1.0_
_Timestamp: {ISO-8601 UTC}_
```

#### 5c. Console Output (Condensed Summary)

After saving the full report, display a condensed summary to the console. This gives the user immediate feedback without overwhelming them with file-by-file detail.

**For successful migrations (`SUCCESS` or `COMPLETED_WITH_WARNINGS`):**

```
Migration Complete!
===================
From: v{current_version} -> To: v{latest_version}
Date: {ISO-8601 UTC}

Summary:
  Directories created:  {len(dirs_created)}
  Files added:          {len(files_added)}
  Files updated:        {len(files_updated)}
  Files removed:        {len(files_removed)}
  Files skipped:        {len(files_skipped)}
  ─────────────────────────────
  Total processed:      {total}

Backup: .hq-backup/{timestamp}/  ({human_readable_size})

{if len(warnings) > 0:}
Warnings ({len(warnings)}):
{for each warning in warnings (max 5):}
  - {warning}
{end for}
{if len(warnings) > 5:}
  ... and {len(warnings) - 5} more (see full report)
{end if}
{end if}

{if len(errors) > 0:}
Errors ({len(errors)}):
{for each error in errors (max 3):}
  - {error}
{end for}
{if len(errors) > 3:}
  ... and {len(errors) - 3} more (see full report)
{end if}
{end if}

Full report: workspace/reports/migration-{timestamp}.md

To undo this migration:
  /migrate --restore
```

**For incomplete migrations (`INCOMPLETE`):**

```
MIGRATION INCOMPLETE
====================
From: v{current_version} -> To: v{latest_version} (FAILED)
Date: {ISO-8601 UTC}
Stopped at phase: {execution_state.phase}

What was completed before failure:
  Directories created:  {len(dirs_created)}
  Files added:          {len(files_added)}
  Files updated:        {len(files_updated)}
  Files removed:        {len(files_removed)}
  Files skipped:        {len(files_skipped)}

Errors:
{for each error in errors:}
  - {error}
{end for}

.hq-version was NOT updated (still at v{current_version}).

Backup: .hq-backup/{timestamp}/  ({human_readable_size})

Full report: workspace/reports/migration-{timestamp}.md

To restore your HQ to its pre-migration state:
  /migrate --restore
  Select backup: {timestamp}
```

#### 5d. Save Report to Disk

```
# Ensure workspace/reports/ exists
mkdir -p "workspace/reports"

# Generate filename with same timestamp as backup
REPORT_PATH="workspace/reports/migration-{timestamp}.md"

# Write the full report (from 5b template above)
write report_content to REPORT_PATH

if write failed:
  add to warnings: "Failed to save migration report to disk"
  # Still display console output — the report data is in memory
  display console summary (from 5c above)
else:
  display console summary (from 5c above)
  log: "Report saved: {REPORT_PATH}"
```

**Report filename convention:** `migration-{YYYYMMDDTHHMMSSZ}.md` using the same timestamp as the backup directory. This makes it easy to correlate reports with their backups.

## Backup Retention Policy

Old backups are NOT auto-deleted. The user controls cleanup of `.hq-backup/` manually. Each backup is self-contained with its own manifest, so any backup can be used for restore independently.

To see all backups:
```bash
ls -la .hq-backup/
```

To manually remove old backups:
```bash
rm -rf .hq-backup/{old-timestamp}/
```

### 6. Clean Up Temp Directory

After the migration report is generated and saved (Step 5), clean up the temp directory used for fetching the template:

```bash
if [[ -n "$MIGRATE_TMPDIR" && -d "$MIGRATE_TMPDIR" ]]; then
  rm -rf "$MIGRATE_TMPDIR"
  echo "Cleaned up temp directory: $MIGRATE_TMPDIR"
fi
```

This is the final step. The temp directory (`$MIGRATE_TMPDIR`) was created in the `analyze` skill (Step 3b) and has been used throughout the diff and execution phases to read template files from `$MIGRATE_TMPDIR/template/`.

**Also clean up on failure:** If the migration fails at any phase, clean up the temp directory before displaying the error message and abort instructions.

## Output

- Backup confirmation (location, file count, size, verification status)
- Per-file action log
- Migration report (displayed and saved)
- Updated .hq-version
- Temp directory cleaned up

## Error Handling

- **Backup creation fails**: ABORT immediately, do not proceed with any migration steps
- **Disk space insufficient**: Detect before starting backup if possible (check available space vs estimated size). Abort with clear message if insufficient.
- **File copy fails during backup**: Log error, abort backup, abort migration
- **File copy fails during migration**: Log error, skip file, continue (unless critical)
- **CLAUDE.md merge fails**: Keep user version, flag for manual merge
- **Permission errors**: Log specific files affected, suggest running with appropriate permissions
- **Symlink handling fails**: Fall back to recording symlink targets in manifest for manual recreation
