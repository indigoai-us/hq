# analyze

Detect the current HQ version, fetch the latest template from GitHub, diff the local filesystem against it, and generate a categorized migration plan.

## Usage

```
/run migration-agent analyze
```

## Process

### 1. Detect Current Version

#### 1a. Direct Detection (preferred)

Check if `.hq-version` exists in the HQ root. If present, read it — the file contains a single semver string (e.g. `5.4.0`), optionally with a trailing newline. Trim whitespace and use it directly.

```bash
if [[ -f .hq-version ]]; then
  CURRENT_VERSION=$(cat .hq-version | tr -d '[:space:]')
  DETECTION_METHOD=".hq-version file"
fi
```

#### 1b. Version Inference (fallback for legacy installations)

If `.hq-version` is missing, this is a pre-migration installation. Infer the version by checking structural clues in order from newest to oldest. Use the **highest matching version** as the inferred version.

Run these checks in order. Each match sets a floor — continue checking all clues, then take the highest match:

| Priority | Check | Command / Method | If Present | Version Floor |
|----------|-------|------------------|------------|---------------|
| 1 | CHANGELOG.md latest entry | Read `CHANGELOG.md`, parse first `## v{X.Y.Z}` heading | Extract exact version | Exact match |
| 2 | `/setup` has CLI checks (gh, vercel) | `grep -q "vercel" .claude/commands/setup.md 2>/dev/null` | v5.2+ setup with CLI scaffolding | 5.2.0 |
| 3 | Knowledge dirs are symlinks to `repos/` | `find knowledge/ -maxdepth 1 -type l 2>/dev/null \| head -1` | Symlinked knowledge repos | 5.2.0 |
| 4 | Context Diet in CLAUDE.md | `grep -q "Context Diet" .claude/CLAUDE.md 2>/dev/null` | Lazy-loading rules | 5.1.0 |
| 5 | `workers/sample-worker/` exists | `test -d workers/sample-worker` | v5.0 sample worker scaffold | 5.0.0 |
| 6 | `/personal-interview` command | `test -f .claude/commands/personal-interview.md` | v5.0 interview flow | 5.0.0 |
| 7 | `workers/registry.yaml` version field | `grep "^version:" workers/registry.yaml 2>/dev/null` | Parse version number (e.g. "5.0" -> 5.0.0) | from field |
| 8 | `.claude/commands/learn.md` exists | `test -f .claude/commands/learn.md` | Learning pipeline | 4.0.0 |
| 9 | INDEX.md system active | `test -f knowledge/hq-core/index-md-spec.md` | INDEX.md navigation | 4.0.0 |
| 10 | Auto-Handoff in CLAUDE.md | `grep -q "Auto-Handoff" .claude/CLAUDE.md 2>/dev/null` | Auto-handoff at 70% context | 3.3.0 |
| 11 | `/remember` command exists | `test -f .claude/commands/remember.md` | Learning capture | 3.2.0 |
| 12 | `/search` uses qmd | `grep -q "qmd" .claude/commands/search.md 2>/dev/null` | qmd-powered search | 3.0.0 |
| 13 | `workspace/orchestrator/` exists | `test -d workspace/orchestrator` | Project orchestration | 2.0.0 |
| 14 | `workspace/threads/` exists | `test -d workspace/threads` | Auto-checkpoint system | 2.0.0 |
| 15 | `workers/dev-team/` has 10+ workers | `ls workers/dev-team/ 2>/dev/null \| wc -l` | Dev team workers | 2.0.0 |
| 16 | `.claude/commands/` exists | `test -d .claude/commands` | Basic HQ structure | 1.0.0 |

**Inference algorithm:**

```
version_floor = "1.0.0"

# Check CHANGELOG first for exact version
if CHANGELOG.md exists:
  parse first "## v{X.Y.Z}" line
  if found: version_floor = X.Y.Z (exact match — skip structural checks)

# If no CHANGELOG or unparseable, use structural checks
if version_floor == "1.0.0":
  for each check in priority order (2-16):
    if check passes AND check.version > version_floor:
      version_floor = check.version

CURRENT_VERSION = version_floor
DETECTION_METHOD = "filesystem inference"
```

**Edge cases:**
- If NO structural clues match at all, set version to `"unknown"` and warn the user: "Could not determine HQ version. This may not be an HQ installation."
- If CHANGELOG.md exists but has no parseable version heading, fall through to structural checks.
- If multiple clues conflict (e.g. registry says 5.0 but learn.md is missing), trust the highest structural clue and note the discrepancy.

#### 1c. Report Version

Report detected version to user:
```
Detected HQ version: v{version}
Detection method: {.hq-version file | filesystem inference}
{if inferred: "Structural clues: {list of matched clues}"}
```

### 2. Determine Latest Available Version

After fetching the template (Step 3 below), determine the latest version:

1. **Check fetched `template/.hq-version`** — If present, read the version string (preferred, authoritative)
2. **Fallback: parse fetched `template/CHANGELOG.md`** — Extract first `## v{X.Y.Z}` heading
3. **If neither works**: abort with error "Cannot determine template version"

```
Latest template version: v{latest}
Source: {.hq-version from template | CHANGELOG.md from template}
```

**Version comparison:** If current version >= latest version, report "Already up to date" and exit (unless `--force` is passed).

### 3. Fetch Latest Template from GitHub

Download the latest `template/` directory from the HQ GitHub repository (`github.com/indigoai-us/hq`, `main` branch). Only the `template/` directory is needed — NOT the full monorepo.

#### 3a. Clean Up Stale Temp Directories

Before creating a new temp directory, clean up any leftovers from previous failed migrations:

```bash
# Remove stale hq-migrate temp dirs older than 60 minutes
find "${TMPDIR:-/tmp}" -maxdepth 1 -name "hq-migrate-*" -type d -mmin +60 -exec rm -rf {} + 2>/dev/null
```

#### 3b. Create Temp Directory

Create a dedicated temp directory with a predictable prefix. This directory persists for the entire migration session and is cleaned up afterward (even on error or cancellation).

```bash
MIGRATE_TMPDIR=$(mktemp -d "${TMPDIR:-/tmp}/hq-migrate-XXXXXX")

if [[ ! -d "$MIGRATE_TMPDIR" ]]; then
  echo "ERROR: Failed to create temp directory."
  echo "Check disk space and permissions on ${TMPDIR:-/tmp}/"
  echo "Migration aborted. No changes were made."
  exit 1
fi
```

**Store the path** — `$MIGRATE_TMPDIR` is referenced throughout the rest of the migration. The temp directory holds:
- Downloaded archive (tarball) or cloned repo
- Extracted template files at `$MIGRATE_TMPDIR/template/`
- No user data is ever stored here

#### 3c. Fetch Template (Tiered Fallback Strategy)

Try three methods in order. Each extracts `template/` contents into `$MIGRATE_TMPDIR/template/`. Move to the next method only if the current one fails.

**Display progress at each step:**
```
Fetching latest HQ template...
  Strategy: {current strategy name}
  Source: github.com/indigoai-us/hq (main branch)
```

##### Strategy 1: GitHub API Tarball via `gh` CLI (Preferred)

Fastest and most bandwidth-efficient. Downloads a tarball of the entire repo but extracts only `template/`. Requires `gh` CLI installed and authenticated.

```bash
echo "Fetching latest HQ template..."
echo "  Strategy: GitHub API tarball (gh CLI)"

# Pre-flight: check gh availability and auth
if ! command -v gh &>/dev/null; then
  echo "  gh CLI not found. Trying next strategy..."
  STRATEGY1_FAILED=true
fi

if [[ -z "$STRATEGY1_FAILED" ]]; then
  if ! gh auth status &>/dev/null 2>&1; then
    echo "  gh CLI not authenticated. Trying next strategy..."
    STRATEGY1_FAILED=true
  fi
fi

if [[ -z "$STRATEGY1_FAILED" ]]; then
  # Download tarball
  echo "  Downloading archive..."
  gh api repos/indigoai-us/hq/tarball/main > "$MIGRATE_TMPDIR/hq-repo.tar.gz" 2>/dev/null

  # Validate download
  if [[ ! -s "$MIGRATE_TMPDIR/hq-repo.tar.gz" ]]; then
    echo "  Download failed or empty. Trying next strategy..."
    rm -f "$MIGRATE_TMPDIR/hq-repo.tar.gz"
    STRATEGY1_FAILED=true
  fi
fi

if [[ -z "$STRATEGY1_FAILED" ]]; then
  # Extract archive
  echo "  Extracting template/ directory..."
  mkdir -p "$MIGRATE_TMPDIR/extracted"
  tar -xzf "$MIGRATE_TMPDIR/hq-repo.tar.gz" -C "$MIGRATE_TMPDIR/extracted" 2>/dev/null

  if [[ $? -ne 0 ]]; then
    echo "  Extraction failed. Trying next strategy..."
    rm -rf "$MIGRATE_TMPDIR/extracted" "$MIGRATE_TMPDIR/hq-repo.tar.gz"
    STRATEGY1_FAILED=true
  fi
fi

if [[ -z "$STRATEGY1_FAILED" ]]; then
  # The tarball has a top-level dir like "indigoai-us-hq-{sha}/"
  EXTRACTED_ROOT=$(ls -d "$MIGRATE_TMPDIR/extracted"/*/ 2>/dev/null | head -1)

  if [[ -z "$EXTRACTED_ROOT" || ! -d "${EXTRACTED_ROOT}template/" ]]; then
    echo "  template/ not found in archive. Trying next strategy..."
    rm -rf "$MIGRATE_TMPDIR/extracted" "$MIGRATE_TMPDIR/hq-repo.tar.gz"
    STRATEGY1_FAILED=true
  fi
fi

if [[ -z "$STRATEGY1_FAILED" ]]; then
  # Move template/ to final location
  mv "${EXTRACTED_ROOT}template" "$MIGRATE_TMPDIR/template"
  rm -rf "$MIGRATE_TMPDIR/extracted" "$MIGRATE_TMPDIR/hq-repo.tar.gz"
  echo "  Template fetched successfully via GitHub API."
  FETCH_SUCCESS=true
fi
```

##### Strategy 2: Git Sparse Checkout (Fallback)

If `gh` is unavailable or fails, use git sparse-checkout to fetch only the `template/` directory metadata and blobs. This avoids downloading the full repo contents.

```bash
if [[ -z "$FETCH_SUCCESS" ]]; then
  echo "  Strategy: git sparse-checkout"

  git clone --depth 1 --filter=blob:none --sparse \
    https://github.com/indigoai-us/hq.git \
    "$MIGRATE_TMPDIR/hq-repo" 2>/dev/null

  if [[ $? -ne 0 ]]; then
    echo "  Git clone failed. Trying next strategy..."
    rm -rf "$MIGRATE_TMPDIR/hq-repo"
  else
    cd "$MIGRATE_TMPDIR/hq-repo"
    git sparse-checkout set template/ 2>/dev/null

    if [[ $? -ne 0 || ! -d "$MIGRATE_TMPDIR/hq-repo/template/" ]]; then
      echo "  Sparse checkout failed. Trying next strategy..."
      rm -rf "$MIGRATE_TMPDIR/hq-repo"
    else
      mv "$MIGRATE_TMPDIR/hq-repo/template" "$MIGRATE_TMPDIR/template"
      rm -rf "$MIGRATE_TMPDIR/hq-repo"
      echo "  Template fetched successfully via git sparse-checkout."
      FETCH_SUCCESS=true
    fi
  fi
fi
```

##### Strategy 3: Full Shallow Clone (Last Resort)

If sparse-checkout is blocked (some git configs, corporate firewalls, or older git versions), fall back to a full shallow clone. Downloads more data but is the most universally compatible.

```bash
if [[ -z "$FETCH_SUCCESS" ]]; then
  echo "  Strategy: full shallow clone (last resort)"

  git clone --depth 1 \
    https://github.com/indigoai-us/hq.git \
    "$MIGRATE_TMPDIR/hq-repo" 2>/dev/null

  if [[ $? -ne 0 ]]; then
    # ALL strategies failed — display comprehensive error
    echo ""
    echo "ERROR: All fetch strategies failed."
    echo ""
    echo "Possible causes:"
    echo "  - No internet connection"
    echo "  - GitHub is unreachable (check https://githubstatus.com)"
    echo "  - Repository access denied (may be private — run 'gh auth login')"
    echo "  - Firewall or proxy blocking git/HTTPS traffic"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check internet:  curl -s https://api.github.com/rate_limit"
    echo "  2. Check GitHub:    gh auth status"
    echo "  3. Manual test:     git ls-remote https://github.com/indigoai-us/hq.git"
    echo ""

    # Clean up temp directory on total failure
    rm -rf "$MIGRATE_TMPDIR"
    echo "Migration aborted. No changes were made."
    exit 1
  fi

  if [[ ! -d "$MIGRATE_TMPDIR/hq-repo/template/" ]]; then
    echo "ERROR: Repository cloned but template/ directory not found."
    echo "The HQ repository structure may have changed."
    rm -rf "$MIGRATE_TMPDIR"
    echo "Migration aborted. No changes were made."
    exit 1
  fi

  mv "$MIGRATE_TMPDIR/hq-repo/template" "$MIGRATE_TMPDIR/template"
  rm -rf "$MIGRATE_TMPDIR/hq-repo"
  echo "  Template fetched successfully via full shallow clone."
  FETCH_SUCCESS=true
fi
```

#### 3d. Validate Fetched Template

After successful fetch (regardless of strategy), validate the template directory contains expected structure:

```bash
# Verify template directory exists
if [[ ! -d "$MIGRATE_TMPDIR/template" ]]; then
  echo "ERROR: Template directory missing after fetch. This is unexpected."
  rm -rf "$MIGRATE_TMPDIR"
  echo "Migration aborted."
  exit 1
fi

# Count files for sanity check
TEMPLATE_FILE_COUNT=$(find "$MIGRATE_TMPDIR/template" -type f | wc -l)

if [[ "$TEMPLATE_FILE_COUNT" -lt 10 ]]; then
  echo "WARNING: Template contains only $TEMPLATE_FILE_COUNT files (expected ~325)."
  echo "The fetch may be incomplete. Proceeding with caution."
fi

# Verify key structural markers exist
MARKERS_OK=true
for marker in ".claude/CLAUDE.md" "workers/registry.yaml" "MIGRATION.md"; do
  if [[ ! -f "$MIGRATE_TMPDIR/template/$marker" ]]; then
    echo "WARNING: Expected file missing from template: $marker"
    MARKERS_OK=false
  fi
done

if [[ "$MARKERS_OK" == "false" ]]; then
  echo "WARNING: Some expected template files are missing. The template may be from a different version."
fi

echo "Template validated: $TEMPLATE_FILE_COUNT files"
```

#### 3e. Extract Latest Version from Fetched Template

Read the version from the fetched template (this feeds into the version comparison from Step 2):

```bash
if [[ -f "$MIGRATE_TMPDIR/template/.hq-version" ]]; then
  LATEST_VERSION=$(cat "$MIGRATE_TMPDIR/template/.hq-version" | tr -d '[:space:]')
  VERSION_SOURCE=".hq-version"
elif [[ -f "$MIGRATE_TMPDIR/template/CHANGELOG.md" ]]; then
  LATEST_VERSION=$(grep -m1 -oP '##\s+v?\K[\d.]+' "$MIGRATE_TMPDIR/template/CHANGELOG.md")
  VERSION_SOURCE="CHANGELOG.md"
else
  echo "WARNING: Cannot determine template version from fetched files."
  LATEST_VERSION="unknown"
  VERSION_SOURCE="none"
fi
```

#### 3f. Display Fetch Summary

```
Fetching latest HQ template... done.
============================================
Latest template version: v{latest} (from {source})
Fetched from: github.com/indigoai-us/hq (main branch)
Template files: {count}
Temp directory: {path}
============================================
```

#### 3g. Version Gate (Early Exit)

If the local version matches or exceeds the latest, exit early and clean up:

```bash
if [[ "$CURRENT_VERSION" == "$LATEST_VERSION" ]]; then
  echo ""
  echo "Already up to date (v$CURRENT_VERSION). No migration needed."
  echo ""
  rm -rf "$MIGRATE_TMPDIR"
  echo "Cleaned up temp directory."
  exit 0
fi

echo ""
echo "Update available: v$CURRENT_VERSION -> v$LATEST_VERSION"
echo "Proceeding to filesystem diff..."
```

Exit unless `--force` was passed, in which case continue regardless.

#### 3h. Temp Directory Lifecycle

The temp directory `$MIGRATE_TMPDIR` follows this lifecycle:

| Event | Action |
|-------|--------|
| Created | Step 3b, at start of fetch |
| Populated | Step 3c, with fetched template files |
| Used | Step 4 (diff) reads from `$MIGRATE_TMPDIR/template/` |
| Used | Execute skill reads from `$MIGRATE_TMPDIR/template/` to copy files |
| Cleaned up (success) | After migration report in execute skill |
| Cleaned up (cancel) | After user cancels in the /migrate command |
| Cleaned up (error) | In error handler before exit |
| Cleaned up (up-to-date) | Step 3g, immediately after version match |
| Stale cleanup | Step 3a, on next run if crash left orphan dirs |

**Rule:** NEVER leave temp directories behind. Every exit path must clean up `$MIGRATE_TMPDIR`.

### 4. Diff Filesystem

Compare every file in the fetched `$MIGRATE_TMPDIR/template/` against the local HQ installation. The mapping is direct: `template/X` corresponds to local `HQ_ROOT/X`.

#### 4a. Ignore List Configuration

Define the ignore list BEFORE walking any file trees. These paths are inherently local -- they exist only in the user's HQ and should never be compared, categorized, or reported. Any file or directory matching these patterns is completely invisible to the diff engine.

```
IGNORE_PATTERNS:

# User data directories (entire subtrees)
workspace/threads/              # Session history JSON files
workspace/learnings/            # Captured learning JSON files
workspace/orchestrator/         # Project execution state (state.json, subdirs)
workspace/checkpoints/          # Manual checkpoint saves
workspace/reports/              # Generated reports
workspace/content-ideas/        # Idea capture
companies/                      # All company-scoped resources
projects/                       # User project PRDs and data
repos/                          # Symlink-target code repositories
social-content/drafts/          # Content drafts (x/, linkedin/)

# System/build directories
.git/                           # Git internals
.hq-backup/                     # Migration backups
node_modules/                   # Package manager artifacts
dist/                           # Build output
.beads/                         # Bead system data

# User-authored files (content sacred, structure only)
agents.md                       # Personal profile — NEVER diff content
                                # (structure comparison handled separately in 4g)

# Runtime/temp files
*.log                           # Log files
*.lock                          # Lock files (pnpm-lock.yaml, etc.)
.DS_Store                       # macOS metadata
Thumbs.db                       # Windows metadata
nul                             # Windows null device artifacts
*.stackdump                     # Crash dumps
```

**Matching rules:**
- Trailing `/` means "match this directory and everything inside it"
- Leading `*` means "match any file with this extension anywhere"
- Exact names (like `agents.md`) match at the HQ root only (not subdirectory files with the same name)
- Patterns are matched against the RELATIVE path from HQ root (e.g., `workspace/threads/foo.json` matches `workspace/threads/`)

**Implementation:** Before adding any path to the diff results, check it against the ignore list:

```
is_ignored(relative_path):
  for pattern in IGNORE_PATTERNS:
    if pattern ends with "/":
      # Directory pattern — match if path starts with this prefix
      if relative_path starts with pattern OR relative_path == pattern.rstrip("/"):
        return true
    elif pattern starts with "*":
      # Extension pattern — match if path ends with this suffix
      if relative_path ends with pattern.lstrip("*"):
        return true
    else:
      # Exact match — match only at root level
      if relative_path == pattern:
        return true
  return false
```

#### 4b. File Categories

Categorize each file into exactly one of these categories:

| Category | Meaning | Action in execute skill |
|----------|---------|------------------------|
| **NEW** | In template, not in local HQ | Copy from template to local |
| **MODIFIED** | Both exist, contents differ | Backup original, apply template (with merge for special files) |
| **DELETED** | In previous template version, removed in current template | Archive to backup, remove from local |
| **UNCHANGED** | Both exist, contents identical | No action |
| **LOCAL_ONLY** | In local HQ, not in template, not ignored | No action (user-created, leave alone) |
| **RENAMED** | Same content exists at a different path in template vs local | Move/rename to new path |

**Note on DELETED:** Detection of DELETED files requires knowledge of what was in the PREVIOUS template version. Two approaches:

1. **If `.hq-version` is known and a previous template can be reconstructed** — compare what files existed at that version vs current template. Files in previous but not current = DELETED.
2. **If previous template is unavailable** — skip DELETED detection entirely. Only NEW, MODIFIED, UNCHANGED, LOCAL_ONLY, and RENAMED are reported. Flag this in the plan: "DELETED detection skipped (no previous template baseline available). Orphaned template files may remain."

For the initial migration (no `.hq-version` exists), always use approach 2.

#### 4c. Walk Both File Trees

Build two file inventories: one for the template, one for the local HQ. Each inventory entry contains metadata needed for comparison.

**Template inventory** — walk `$MIGRATE_TMPDIR/template/` recursively:

```
template_files = {}

for each file in recursive_walk("$MIGRATE_TMPDIR/template/"):
  relative_path = path relative to "$MIGRATE_TMPDIR/template/"

  # Skip if ignored
  if is_ignored(relative_path): continue

  entry = {
    "relative_path": relative_path,
    "absolute_path": full path to file in temp dir,
    "type": "file" | "symlink" | "directory",
    "size": file size in bytes (0 for symlinks/dirs),
    "hash": SHA-256 hex digest of file contents (null for symlinks/dirs),
    "symlink_target": readlink value (null if not a symlink),
    "is_binary": true if file contains null bytes in first 8192 bytes,
    "is_gitkeep": true if filename is ".gitkeep"
  }

  template_files[relative_path] = entry
```

**Local HQ inventory** — walk the HQ root directory recursively:

```
local_files = {}

for each file in recursive_walk(HQ_ROOT):
  relative_path = path relative to HQ_ROOT

  # Skip if ignored
  if is_ignored(relative_path): continue

  entry = {
    "relative_path": relative_path,
    "absolute_path": full path to file,
    "type": "file" | "symlink" | "directory",
    "size": file size in bytes (0 for symlinks/dirs),
    "hash": SHA-256 hex digest of file contents (null for symlinks/dirs),
    "symlink_target": readlink value (null if not a symlink),
    "is_binary": true if file contains null bytes in first 8192 bytes,
    "is_gitkeep": true if filename is ".gitkeep"
  }

  local_files[relative_path] = entry
```

**Implementation notes:**

- Use `find` for the walk, or read directory entries recursively via Glob/Bash.
- **Hashing:** Use `sha256sum` (Linux/Git Bash) or `shasum -a 256` (macOS) to compute file hashes. For large files (>10MB), hash only if sizes differ first (optimization).
- **Binary detection:** Read the first 8192 bytes. If any null byte (`\0`) is present, classify as binary.
- **Symlink detection:** Use `test -L "$path"` to check for symlinks. If symlink, record the target via `readlink "$path"` and do NOT follow it. Do not hash symlink contents.
- **Empty directories:** Record directories that contain ONLY `.gitkeep` files. The `.gitkeep` itself is metadata, not content.
- **Cross-platform path normalization:** Normalize all paths to use forward slashes (`/`), even on Windows/Git Bash. This ensures template paths (always `/`) match local paths.

```bash
# Cross-platform hash function
compute_hash() {
  local file="$1"
  if command -v sha256sum &>/dev/null; then
    sha256sum "$file" | cut -d' ' -f1
  elif command -v shasum &>/dev/null; then
    shasum -a 256 "$file" | cut -d' ' -f1
  else
    # Fallback: use md5 (less ideal but universally available)
    md5sum "$file" 2>/dev/null | cut -d' ' -f1 || md5 -q "$file" 2>/dev/null
  fi
}

# Binary detection
is_binary_file() {
  local file="$1"
  # Check first 8192 bytes for null bytes
  head -c 8192 "$file" 2>/dev/null | grep -qP '\x00' && return 0 || return 1
  # Fallback for systems without grep -P:
  # file --mime-encoding "$file" | grep -q "binary"
}

# Path normalization (Windows compatibility)
normalize_path() {
  echo "$1" | sed 's|\\|/|g' | sed 's|//|/|g'
}
```

#### 4d. Compare and Categorize

With both inventories built, compare them to produce the diff result set.

```
diff_results = {
  "NEW": [],
  "MODIFIED": [],
  "DELETED": [],
  "UNCHANGED": [],
  "LOCAL_ONLY": [],
  "RENAMED": []
}

# --- Pass 1: Classify template files against local ---

for relative_path, template_entry in template_files:

  if relative_path NOT IN local_files:
    # Template has it, local doesn't => NEW (might be RENAMED, checked in Pass 3)
    diff_results["NEW"].append({
      "path": relative_path,
      "template_entry": template_entry,
      "description": describe_new_file(template_entry)
    })

  else:
    local_entry = local_files[relative_path]

    # Both exist — compare contents
    if entries_are_identical(template_entry, local_entry):
      diff_results["UNCHANGED"].append({
        "path": relative_path
      })
    else:
      diff_results["MODIFIED"].append({
        "path": relative_path,
        "template_entry": template_entry,
        "local_entry": local_entry,
        "diff_summary": generate_diff_summary(template_entry, local_entry),
        "is_special": is_special_file(relative_path),
        "merge_strategy": get_merge_strategy(relative_path)
      })

# --- Pass 2: Find LOCAL_ONLY files ---

for relative_path, local_entry in local_files:
  if relative_path NOT IN template_files:
    # Local has it, template doesn't => LOCAL_ONLY (might be RENAMED source, checked in Pass 3)
    diff_results["LOCAL_ONLY"].append({
      "path": relative_path,
      "local_entry": local_entry
    })

# --- Pass 3: Rename/Move Detection (see 4e) ---

detect_renames(diff_results)

# --- Pass 4: DELETED Detection (conditional) ---

detect_deleted(diff_results)  # See 4b for approach
```

**Comparison function (`entries_are_identical`):**

```
entries_are_identical(template_entry, local_entry):
  # Type mismatch = not identical (e.g., file became symlink)
  if template_entry.type != local_entry.type:
    return false

  # Symlinks: compare targets
  if template_entry.type == "symlink":
    return template_entry.symlink_target == local_entry.symlink_target

  # .gitkeep files: always identical (they're empty markers)
  if template_entry.is_gitkeep AND local_entry.is_gitkeep:
    return true

  # Binary files: compare by size AND hash
  if template_entry.is_binary OR local_entry.is_binary:
    return template_entry.size == local_entry.size
       AND template_entry.hash == local_entry.hash

  # Text files: compare by hash (content equality)
  return template_entry.hash == local_entry.hash
```

#### 4e. Rename/Move Detection

After the initial classification (Pass 1 and Pass 2), check if any NEW files are actually RENAMED versions of LOCAL_ONLY files (same content, different path).

```
detect_renames(diff_results):
  # Build hash-to-path maps for potential rename candidates
  new_by_hash = {}
  for entry in diff_results["NEW"]:
    hash = entry.template_entry.hash
    if hash is not null AND hash not in new_by_hash:
      new_by_hash[hash] = entry

  local_only_by_hash = {}
  for entry in diff_results["LOCAL_ONLY"]:
    hash = entry.local_entry.hash
    if hash is not null AND hash not in local_only_by_hash:
      local_only_by_hash[hash] = entry

  # Find matches: same hash = same content = likely rename
  renamed = []
  for hash in new_by_hash:
    if hash in local_only_by_hash:
      new_entry = new_by_hash[hash]
      local_entry = local_only_by_hash[hash]

      # Confirm it's a genuine rename (not a coincidence):
      # - Same file extension
      # - Same filename (just moved) OR same parent dir pattern
      # - File size matches exactly
      if is_likely_rename(new_entry, local_entry):
        renamed.append({
          "old_path": local_entry.path,
          "new_path": new_entry.path,
          "hash": hash,
          "description": "Moved from {old_path} to {new_path}"
        })

  # Reclassify: remove from NEW and LOCAL_ONLY, add to RENAMED
  for rename in renamed:
    diff_results["NEW"].remove(entry where path == rename.new_path)
    diff_results["LOCAL_ONLY"].remove(entry where path == rename.old_path)
    diff_results["RENAMED"].append(rename)
```

**Rename confidence heuristics (`is_likely_rename`):**

```
is_likely_rename(new_entry, local_entry):
  new_name = basename(new_entry.path)
  local_name = basename(local_entry.path)
  new_ext = extension(new_entry.path)
  local_ext = extension(local_entry.path)

  # Must have same extension
  if new_ext != local_ext:
    return false

  # High confidence: same filename, different directory
  if new_name == local_name:
    return true

  # Medium confidence: same directory depth and similar structure
  new_depth = count_slashes(new_entry.path)
  local_depth = count_slashes(local_entry.path)
  if abs(new_depth - local_depth) <= 1:
    return true

  # Low confidence: completely different path and name
  # Still report as RENAMED if content hash matches exactly,
  # but flag as "possible rename (verify manually)"
  return true  # Hash match is sufficient for reporting
```

**Edge cases for rename detection:**
- If multiple NEW files have the same hash as a LOCAL_ONLY file, pick the one with the most similar path (fewest path segments changed).
- If a file was both renamed AND modified, it will appear as NEW + LOCAL_ONLY (not RENAMED). This is correct -- the content changed, so it's not a pure rename.
- Skip rename detection for very small files (<50 bytes) to avoid false positives on boilerplate.
- Skip rename detection for `.gitkeep` files (they're all identical).

#### 4f. Generate Readable Diff Summaries for MODIFIED Files

For every MODIFIED file, produce a human-readable summary describing WHAT changed -- not a raw unified diff, but a structured description suitable for the migration plan.

```
generate_diff_summary(template_entry, local_entry):

  # Type change (rare but important)
  if template_entry.type != local_entry.type:
    return "File type changed: {local_entry.type} -> {template_entry.type}"

  # Symlink target change
  if template_entry.type == "symlink":
    return "Symlink target changed: {local_entry.symlink_target} -> {template_entry.symlink_target}"

  # Binary file change
  if template_entry.is_binary OR local_entry.is_binary:
    size_delta = template_entry.size - local_entry.size
    direction = "grew" if size_delta > 0 else "shrank"
    return "Binary file {direction} by {abs(size_delta)} bytes ({local_entry.size} -> {template_entry.size})"

  # Text file change — compute structural diff summary
  return summarize_text_diff(template_entry, local_entry)
```

**Text diff summarization (`summarize_text_diff`):**

Read both files fully and produce a summary based on line-level analysis:

```
summarize_text_diff(template_entry, local_entry):
  template_lines = read_lines(template_entry.absolute_path)
  local_lines = read_lines(local_entry.absolute_path)

  template_count = len(template_lines)
  local_count = len(local_lines)

  # Count added and removed lines (simple diff)
  # Use set difference for a rough count, or line-by-line comparison
  template_set = set(template_lines)
  local_set = set(local_lines)

  lines_added = len(template_set - local_set)
  lines_removed = len(local_set - template_set)

  # Build summary parts
  parts = []

  # Line count change
  if template_count != local_count:
    delta = template_count - local_count
    if delta > 0:
      parts.append("+{delta} lines".format(delta=delta))
    else:
      parts.append("{delta} lines".format(delta=delta))

  # Content change summary
  if lines_added > 0:
    parts.append("{n} lines added".format(n=lines_added))
  if lines_removed > 0:
    parts.append("{n} lines removed".format(n=lines_removed))

  # Detect section-level changes for structured files
  if template_entry.path.endswith(".md"):
    section_changes = detect_markdown_section_changes(template_lines, local_lines)
    if section_changes:
      parts.append("sections changed: " + ", ".join(section_changes))

  elif template_entry.path.endswith(".yaml") or template_entry.path.endswith(".yml"):
    key_changes = detect_yaml_key_changes(template_lines, local_lines)
    if key_changes:
      parts.append("keys changed: " + ", ".join(key_changes))

  return "; ".join(parts) if parts else "content differs (minor changes)"
```

**Section change detection for markdown files:**

```
detect_markdown_section_changes(template_lines, local_lines):
  # Extract headings (lines starting with #)
  template_headings = [line for line in template_lines if line.startswith("#")]
  local_headings = [line for line in local_lines if line.startswith("#")]

  new_sections = [h for h in template_headings if h not in local_headings]
  removed_sections = [h for h in local_headings if h not in template_headings]

  changes = []
  for h in new_sections:
    changes.append("added '{heading}'".format(heading=h.strip("# ").strip()))
  for h in removed_sections:
    changes.append("removed '{heading}'".format(heading=h.strip("# ").strip()))

  return changes
```

**Key change detection for YAML files:**

```
detect_yaml_key_changes(template_lines, local_lines):
  # Extract top-level keys (lines matching /^\w+:/)
  template_keys = [line.split(":")[0] for line in template_lines if re.match(r'^\w+:', line)]
  local_keys = [line.split(":")[0] for line in local_lines if re.match(r'^\w+:', line)]

  new_keys = [k for k in template_keys if k not in local_keys]
  removed_keys = [k for k in local_keys if k not in template_keys]

  changes = []
  for k in new_keys:
    changes.append("added '{key}'".format(key=k))
  for k in removed_keys:
    changes.append("removed '{key}'".format(key=k))

  return changes
```

#### 4g. Special File Handling

Certain files require special treatment during comparison AND during execution. The diff engine must flag these so the execution skill knows to use merge strategies instead of overwrite.

**Special files registry:**

```
SPECIAL_FILES = {
  ".claude/CLAUDE.md": {
    "merge_strategy": "section_merge",
    "preserve_sections": ["## Learned Rules"],
    "description": "Template structure updated; user Learned Rules will be preserved",
    "impact": "HIGH — affects all Claude sessions"
  },

  "workers/*/worker.yaml": {
    "merge_strategy": "yaml_merge",
    "preserve_fields": ["instructions"],
    "description": "Worker definition updated; user instructions will be preserved",
    "impact": "MEDIUM — affects worker behavior",
    "pattern_match": true  # This is a glob pattern, not a literal path
  },

  "agents.md": {
    "merge_strategy": "never_overwrite",
    "description": "User profile — content never modified, structure-only comparison",
    "impact": "HIGH — personal data"
  },

  "workers/registry.yaml": {
    "merge_strategy": "additive_merge",
    "description": "Worker registry updated; new workers added, existing entries preserved",
    "impact": "MEDIUM — affects worker discovery"
  },

  ".claude/commands/*.md": {
    "merge_strategy": "preserve_rules_section",
    "preserve_sections": ["## Rules"],
    "description": "Command updated; user-added rules will be preserved",
    "impact": "MEDIUM — affects command behavior",
    "pattern_match": true
  },

  ".hq-version": {
    "merge_strategy": "overwrite",
    "description": "Version marker updated by migration tool",
    "impact": "LOW — metadata only"
  },

  "CHANGELOG.md": {
    "merge_strategy": "overwrite",
    "description": "Changelog replaced with latest version",
    "impact": "LOW — reference only"
  },

  "MIGRATION.md": {
    "merge_strategy": "overwrite",
    "description": "Migration guide updated",
    "impact": "LOW — reference only"
  }
}
```

**Pattern matching for special files:**

```
is_special_file(relative_path):
  for pattern, config in SPECIAL_FILES:
    if config.pattern_match:
      if glob_match(pattern, relative_path):
        return true
    else:
      if pattern == relative_path:
        return true
  return false

get_merge_strategy(relative_path):
  for pattern, config in SPECIAL_FILES:
    if config.pattern_match:
      if glob_match(pattern, relative_path):
        return config.merge_strategy
    else:
      if pattern == relative_path:
        return config.merge_strategy
  return "overwrite"  # Default: template replaces local
```

When a MODIFIED file is flagged as special, its diff summary is augmented:

```
if is_special_file(relative_path):
  config = get_special_file_config(relative_path)
  diff_entry["merge_strategy"] = config.merge_strategy
  diff_entry["preserve_sections"] = config.get("preserve_sections", [])
  diff_entry["impact"] = config.impact
  diff_entry["description"] = config.description + " — " + diff_summary
```

#### 4h. .gitkeep and Empty Directory Handling

Template `.gitkeep` files are directory existence markers, not content files. They ensure that git tracks otherwise-empty directories.

**Rules:**
- If template has a `.gitkeep` in a directory, the diff engine records a "ensure directory exists" directive, NOT a file copy.
- If the local HQ already has files in that directory (even without `.gitkeep`), the directory exists -- record as UNCHANGED.
- If the local HQ has a `.gitkeep` where the template does not, leave it alone (LOCAL_ONLY).
- Never report `.gitkeep` as MODIFIED (they're always identical -- empty files).

```
handle_gitkeep(relative_path, template_entry, local_files):
  dir_path = dirname(relative_path)

  # Check if directory exists locally (with or without .gitkeep)
  local_dir_exists = any(
    entry.path.startswith(dir_path + "/")
    for entry in local_files.values()
  ) OR directory_exists(HQ_ROOT + "/" + dir_path)

  if local_dir_exists:
    return "UNCHANGED"  # Directory exists, .gitkeep purpose fulfilled
  else:
    return "NEW"  # Directory needs to be created (via mkdir, not file copy)
```

#### 4i. Symlink Handling

Symlinks in the template and local HQ are compared by their TARGET, not by the content of the file they point to. This is critical for knowledge repo symlinks.

```
compare_symlinks(template_entry, local_entry):
  if template_entry.type == "symlink" AND local_entry.type == "symlink":
    # Both are symlinks — compare targets
    template_target = normalize_path(template_entry.symlink_target)
    local_target = normalize_path(local_entry.symlink_target)

    if template_target == local_target:
      return "UNCHANGED"
    else:
      return "MODIFIED"  # Target changed (e.g., repo path restructured)

  elif template_entry.type == "symlink" AND local_entry.type == "file":
    # Template expects symlink but local has a regular file
    # This is MODIFIED — flag for manual review
    return "MODIFIED"
    # diff_summary: "Expected symlink (-> {target}) but found regular file"

  elif template_entry.type == "file" AND local_entry.type == "symlink":
    # Template has regular file but local has symlink (user customization)
    # Flag as LOCAL_ONLY variation — don't overwrite user's symlink
    return "MODIFIED"
    # diff_summary: "Template has regular file but local is symlink (-> {target})"
```

**Never follow symlinks during diff.** The diff engine operates on the symlink metadata (target path), not the contents of the target.

#### 4j. Binary File Handling

Binary files (images, compiled assets, archives) cannot be meaningfully diffed at the text level. The diff engine handles them by size and hash comparison only.

**Binary detection heuristic:**

```bash
is_binary_file() {
  local file="$1"
  # Method 1: Check for null bytes in first 8KB (fast)
  if head -c 8192 "$file" 2>/dev/null | LC_ALL=C grep -qP '\x00' 2>/dev/null; then
    return 0  # Binary
  fi
  # Method 2: Use file(1) command (more accurate, slightly slower)
  if command -v file &>/dev/null; then
    local mime
    mime=$(file --mime-encoding "$file" 2>/dev/null)
    if echo "$mime" | grep -q "binary"; then
      return 0  # Binary
    fi
  fi
  return 1  # Text
}
```

**Known binary extensions** (skip null-byte check, classify immediately):

```
BINARY_EXTENSIONS = [
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg",
  ".woff", ".woff2", ".ttf", ".eot",
  ".pdf", ".zip", ".tar", ".gz", ".bz2",
  ".exe", ".dll", ".so", ".dylib",
  ".db", ".sqlite", ".sqlite3"
]
```

**Diff summary for binary files:**
```
"Binary file changed: {old_size} -> {new_size} bytes ({+/-delta})"
```
If sizes are identical but hashes differ: `"Binary file changed (same size, different content)"`

#### 4k. Compile Diff Results

After all passes complete, compile the final diff results into a structured report object:

```
diff_report = {
  "timestamp": current ISO-8601 UTC timestamp,
  "current_version": CURRENT_VERSION,
  "latest_version": LATEST_VERSION,
  "template_file_count": len(template_files),
  "local_file_count": len(local_files),  # excluding ignored
  "categories": {
    "NEW": [
      {"path": "...", "description": "...", "type": "file|symlink|directory"},
      ...
    ],
    "MODIFIED": [
      {
        "path": "...",
        "diff_summary": "...",
        "is_special": true|false,
        "merge_strategy": "overwrite|section_merge|yaml_merge|...",
        "impact": "HIGH|MEDIUM|LOW",
        "description": "..."  # For special files, includes merge note
      },
      ...
    ],
    "DELETED": [...],  # May be empty if no previous baseline
    "UNCHANGED": [{"path": "..."}],
    "LOCAL_ONLY": [{"path": "..."}],
    "RENAMED": [
      {"old_path": "...", "new_path": "...", "description": "Moved from X to Y"},
      ...
    ]
  },
  "summary": {
    "new_count": N,
    "modified_count": N,
    "deleted_count": N,
    "unchanged_count": N,
    "local_only_count": N,
    "renamed_count": N,
    "total_template_files": N,
    "total_local_files": N,
    "special_files_count": N  # Files requiring merge strategies
  },
  "special_files": [
    {
      "path": "...",
      "merge_strategy": "...",
      "impact": "HIGH|MEDIUM|LOW",
      "preserve_sections": ["..."]
    }
  ],
  "warnings": [
    # Any anomalies detected during diffing
    "DELETED detection skipped (no previous template baseline)",
    "Binary file at X could not be hashed",
    ...
  ]
}
```

#### 4l. Display Diff Summary

Display a concise summary to the user after diffing completes:

```
Filesystem Diff: v{current} -> v{latest}
==========================================

Template files scanned: {template_file_count}
Local files scanned: {local_file_count} (excluding ignored paths)

  NEW:        {new_count} files (in template, not in local)
  MODIFIED:   {modified_count} files (contents differ)
  DELETED:    {deleted_count} files (removed from template)
  UNCHANGED:  {unchanged_count} files
  LOCAL_ONLY: {local_only_count} files (your custom files, untouched)
  RENAMED:    {renamed_count} files (moved to new path)

Special files requiring merge: {special_files_count}
  {list each special file with impact level}

{if warnings: display each warning}

Proceeding to generate migration plan...
```

### 5. Generate Migration Plan

Transform the raw diff results from Step 4 into a human-friendly, categorized migration plan. This is NOT a raw diff dump — it's a readable document designed for a human to quickly understand what will change, why, and what to watch out for.

#### 5a. High-Impact File Detection

Before building the plan, identify files that deserve special attention. These are changes that affect how HQ behaves globally or contain user data that must be handled with care.

```
HIGH_IMPACT_PATTERNS = {
  ".claude/CLAUDE.md": {
    "warning": "HEADS UP: This affects ALL Claude sessions. Your Learned Rules will be preserved.",
    "icon": "[!]"
  },
  "workers/*/worker.yaml": {
    "warning": "Worker behavior may change. Your custom instructions will be preserved.",
    "icon": "[!]"
  },
  "workers/registry.yaml": {
    "warning": "Worker discovery index updated. New workers added, your entries preserved.",
    "icon": "[!]"
  },
  ".claude/commands/*.md": {
    "warning": "Command behavior may change. Your custom Rules section will be preserved.",
    "icon": "[!]"
  },
  "agents.md": {
    "warning": "Personal profile — NEVER overwritten. Structure-only comparison.",
    "icon": "[!!]"
  }
}

is_high_impact(relative_path):
  for pattern, config in HIGH_IMPACT_PATTERNS:
    if glob_match(pattern, relative_path):
      return config
  return null
```

#### 5b. Build Plan Sections

Organize the diff results into human-readable sections. Each section groups related changes and presents them with clear action indicators and rationale.

**Section order (most impactful first):**

1. Summary Stats (always shown first)
2. High-Impact Changes (flagged items requiring attention)
3. Files to Update (MODIFIED — template wins, originals backed up)
4. Files to Add (NEW — from template)
5. Files to Remove (DELETED — removed from template)
6. Structural Changes (RENAMED/moved files)
7. Directories to Create (new directory structures)
8. Unchanged & Local Only (counts only, not listed)

#### 5c. Generate Plan Entry Format

Each plan entry includes three parts: the file path, the action being taken, and a brief rationale explaining WHY the change is happening.

```
generate_plan_entry(category, entry):

  if category == "NEW":
    action = "ADD"
    rationale = describe_new_file_purpose(entry.path)
    # e.g., "New worker definition" or "New slash command" or "Template documentation"
    return {
      "path": entry.path,
      "action": action,
      "rationale": rationale,
      "is_high_impact": is_high_impact(entry.path) is not null
    }

  elif category == "MODIFIED":
    action = "UPDATE"
    rationale = entry.diff_summary
    if entry.is_special:
      rationale += " — " + entry.description  # Includes merge strategy note
    return {
      "path": entry.path,
      "action": action,
      "rationale": rationale,
      "merge_strategy": entry.merge_strategy,
      "is_high_impact": is_high_impact(entry.path) is not null,
      "impact": entry.impact or "LOW"
    }

  elif category == "DELETED":
    action = "REMOVE"
    rationale = "Removed from template (will be archived to backup, not hard-deleted)"
    return {
      "path": entry.path,
      "action": action,
      "rationale": rationale,
      "is_high_impact": false
    }

  elif category == "RENAMED":
    action = "MOVE"
    rationale = "Moved from {old} to {new}".format(old=entry.old_path, new=entry.new_path)
    return {
      "old_path": entry.old_path,
      "new_path": entry.new_path,
      "action": action,
      "rationale": rationale,
      "is_high_impact": false
    }
```

**File purpose inference (`describe_new_file_purpose`):**

```
describe_new_file_purpose(path):
  if "worker" in path and path.endswith("worker.yaml"):
    return "New worker definition"
  elif "worker" in path and "skills/" in path:
    return "New worker skill"
  elif path.startswith(".claude/commands/"):
    return "New slash command"
  elif path.startswith("knowledge/"):
    return "New knowledge base content"
  elif path.endswith(".gitkeep"):
    return "Directory placeholder"
  elif path.startswith("workspace/"):
    return "Workspace structure"
  elif path == "MIGRATION.md" or path == "CHANGELOG.md":
    return "Template documentation"
  elif path == ".hq-version":
    return "Version marker"
  else:
    ext = extension(path)
    if ext == ".md": return "Documentation"
    elif ext == ".yaml" or ext == ".yml": return "Configuration"
    elif ext == ".json": return "Data/config file"
    else: return "Template file"
```

#### 5d. Compile Plan Document

Assemble the full migration plan as a markdown document. This document is both displayed to the user AND saved to disk.

```markdown
# Migration Plan: v{current_version} -> v{latest_version}

Generated: {ISO-8601 timestamp}

## Summary

| Metric | Count |
|--------|-------|
| Files to add | {new_count} |
| Files to update | {modified_count} |
| Files to remove | {deleted_count} |
| Files to move/rename | {renamed_count} |
| Directories to create | {new_dirs_count} |
| **Total changes** | **{total_changes}** |
| Unchanged files | {unchanged_count} |
| Your custom files (untouched) | {local_only_count} |

{if special_files_count > 0:}
**{special_files_count} file(s) require smart merge** (user data preserved, template structure updated)
{end if}

{if any high-impact changes:}
## [!] High-Impact Changes

These changes affect core HQ behavior. Your data is safe — merge strategies
preserve your customizations — but review these to understand what's changing.

{for each high-impact entry:}
- **{path}** — {warning message}
  Action: {action} | Strategy: {merge_strategy}
  {rationale}
{end for}
{end if}

## Files to Update ({modified_count})

Originals will be backed up before any changes are applied.

{for each MODIFIED entry, sorted by impact (HIGH first, then MEDIUM, then LOW):}
{if is_high_impact:}
- [!] `{path}` — {rationale}
  Strategy: {merge_strategy} | Impact: {impact}
{else:}
- `{path}` — {rationale}
{end if}
{end for}

## Files to Add ({new_count})

New files from the latest template. These don't exist in your current HQ.

{for each NEW entry, grouped by directory:}
- `{path}` — {rationale}
{end for}

## Files to Remove ({deleted_count})

{if deleted_count == 0:}
No files to remove.
{if deleted_detection_skipped:}
> Note: Deleted file detection was skipped (no previous template baseline available).
> Orphaned template files from previous versions may remain.
{end if}
{else:}
These files were removed from the template. They will be archived to your
backup directory (never hard-deleted).

{for each DELETED entry:}
- `{path}` — {rationale}
{end for}
{end if}

## Structural Changes ({renamed_count})

{if renamed_count == 0:}
No files moved or renamed.
{else:}
Files that moved to a new location in the template.

{for each RENAMED entry:}
- `{old_path}` -> `{new_path}`
  {rationale}
{end for}
{end if}

## Directories to Create ({new_dirs_count})

{if new_dirs_count == 0:}
No new directories needed.
{else:}
{for each new directory:}
- `{dir_path}/`
{end for}
{end if}

---

**Unchanged:** {unchanged_count} files are identical to the template (no action needed)
**Local Only:** {local_only_count} of your custom files will not be touched

{if warnings exist:}
## Warnings

{for each warning:}
- {warning text}
{end for}
{end if}
```

#### 5e. Directory Detection for Plan

Extract directories that need to be created from the NEW file list. A directory needs creation when:

```
new_directories = set()

for entry in diff_results["NEW"]:
  dir_path = dirname(entry.path)
  while dir_path and dir_path != ".":
    # Check if this directory exists locally
    if not directory_exists(HQ_ROOT + "/" + dir_path):
      new_directories.add(dir_path)
    dir_path = dirname(dir_path)

# Also add directories from .gitkeep entries
for entry in diff_results["NEW"]:
  if entry.is_gitkeep:
    new_directories.add(dirname(entry.path))
```

#### 5f. Sort and Group Entries

Within each section, entries are sorted for readability:

- **MODIFIED:** Sort by impact level (HIGH -> MEDIUM -> LOW), then alphabetically
- **NEW:** Group by parent directory, then alphabetically within each group
- **DELETED:** Alphabetically
- **RENAMED:** By old path, alphabetically

```
sort_modified(entries):
  impact_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
  return sorted(entries, key=lambda e: (
    impact_order.get(e.get("impact", "LOW"), 2),
    e["path"]
  ))

group_new_by_directory(entries):
  groups = {}
  for entry in entries:
    dir = dirname(entry["path"]) or "(root)"
    if dir not in groups:
      groups[dir] = []
    groups[dir].append(entry)
  # Sort groups by directory name, entries within each group alphabetically
  return OrderedDict(sorted(groups.items()))
```

### 6. Save Plan

Save the migration plan to `workspace/migration-plans/` regardless of whether the user proceeds with the migration. This creates an audit trail of what was proposed.

#### 6a. Create Plan Directory

```bash
mkdir -p workspace/migration-plans
```

#### 6b. Generate Plan Filename

Use ISO-8601 timestamp in the filename for chronological sorting:

```bash
PLAN_TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
PLAN_FILE="workspace/migration-plans/migrate-${PLAN_TIMESTAMP}.md"
```

#### 6c. Write Plan File

Write the compiled plan document from Step 5d to `$PLAN_FILE`. The saved file is identical to what the user sees — same markdown, same formatting, same content.

#### 6d. Display Save Confirmation

```
Migration plan saved: {PLAN_FILE}
```

The plan file persists regardless of whether the user approves, cancels, or runs in YOLO mode. This enables:
- Reviewing past migration plans
- Comparing what was proposed vs what was actually executed
- Debugging migration issues after the fact

## Output

- Detected version (current and latest)
- Categorized diff summary
- Migration plan (displayed and saved)
- Plan file path

## Error Handling

### Fetch Errors (Step 3)

| Error | Cause | Message | Action |
|-------|-------|---------|--------|
| `gh` not found | CLI not installed | "gh CLI not found. Trying next strategy..." | Fall to Strategy 2 |
| `gh` not authenticated | No login or expired token | "gh CLI not authenticated. Trying next strategy..." | Fall to Strategy 2 |
| Tarball download empty | Network interruption, rate limit | "Download failed or empty. Trying next strategy..." | Fall to Strategy 2 |
| Tar extraction fails | Corrupt download | "Extraction failed. Trying next strategy..." | Fall to Strategy 2 |
| `template/` not in archive | Repo structure changed | "template/ not found in archive. Trying next strategy..." | Fall to Strategy 2 |
| Git clone fails | Network, auth, firewall | "Git clone failed. Trying next strategy..." | Fall to Strategy 3 |
| Sparse checkout fails | Git version, server config | "Sparse checkout failed. Trying next strategy..." | Fall to Strategy 3 |
| All strategies fail | No connectivity or access | Full diagnostic message with troubleshooting steps | Clean up temp dir, abort |
| Temp dir creation fails | Disk full, permissions | "Failed to create temp directory." | Abort immediately |
| Template validation fails | Incomplete fetch | "Template directory missing after fetch." | Clean up temp dir, abort |

**Key principle:** Each strategy failure is non-fatal and triggers the next fallback. Only when ALL three strategies fail does the migration abort. Every abort path cleans up the temp directory.

### Diff Errors (Step 4)

| Error | Cause | Handling | Impact |
|-------|-------|----------|--------|
| Permission denied on file | OS permissions, locked file | Log warning, skip file, add to `warnings[]` | File excluded from diff — may appear as LOCAL_ONLY or missing |
| Hash computation fails | Corrupt file, disk error | Log warning, set hash to `null`, treat as MODIFIED | File flagged for manual review |
| Symlink target unresolvable | Broken symlink, removed target | Record symlink with target as-is, flag in warnings | Symlink preserved, user notified of broken target |
| Binary detection fails | No `grep -P`, no `file` command | Treat as text file (safe — worst case is garbled diff summary) | Diff summary may be unhelpful for actual binary files |
| File read error during diff summary | I/O error, encoding issue | Use fallback summary: "content differs (could not read for detailed summary)" | Diff still categorized correctly, just less detail |
| Extremely large file (>50MB) | Large assets in template | Skip content-level diff, compare by size+hash only | Summary: "Large file ({size}) — compared by hash only" |
| Path encoding issues (Unicode) | Non-ASCII filenames | Normalize via `LC_ALL=C`, use byte-level comparison | May display garbled in summary, but comparison is correct |
| Too many files (>10,000 in template) | Unusual template size | Warn user, continue processing | Performance may be slow; suggest `--force` if timeout |
