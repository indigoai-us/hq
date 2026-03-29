---
description: Bump version, update CHANGELOG.md & MIGRATION.md, and prepare a release PR
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion
argument-hint: [patch | minor | major] [--dry-run]
visibility: public
---

# /release - Prepare a Release

Bump the HQ version, update CHANGELOG.md and MIGRATION.md, recompute core checksums, and prepare the changes for a PR.

**User's input:** $ARGUMENTS

## Argument Parsing

Parse `$ARGUMENTS` for:
- `patch` / `minor` / `major` → set `BUMP_TYPE` (default: `patch`)
- `--dry-run` → set `DRY_RUN=true` (show what would change, write nothing)

---

## Step 1: Detect Current Version

Read `core.yaml` at repo root (inside `template/` if running from the indigoai-us/hq repo, or HQ root if running from a live HQ).

```bash
yq '.hqVersion' core.yaml
```

If `core.yaml` doesn't exist, fall back to CHANGELOG.md first `## v{X.Y.Z}` heading.

Set `CURRENT_VERSION` from result.

Display: `Current version: v{CURRENT_VERSION}`

---

## Step 2: Compute New Version

Parse `CURRENT_VERSION` as `{major}.{minor}.{patch}` (split on `.`).

Apply bump:
- `patch` → increment patch
- `minor` → increment minor, reset patch to 0
- `major` → increment major, reset minor and patch to 0

Set `NEW_VERSION`.

Display: `New version: v{CURRENT_VERSION} → v{NEW_VERSION}`

---

## Step 3: Gather Changes

Collect what changed since the last version tag. Use git log:

```bash
git log --oneline v{CURRENT_VERSION}..HEAD 2>/dev/null
```

If no tag exists, use recent commits:
```bash
git log --oneline -20
```

Also check for uncommitted/staged changes:
```bash
git diff --stat HEAD
git diff --stat --staged
```

Categorize changes into:
- **Added** — new files, features, commands, workers, skills, policies
- **Changed** — updated existing files
- **Fixed** — bug fixes
- **Removed** — deleted files or features
- **Breaking Changes** — anything that requires migration steps

Present the categorized list and ask:
```
These changes will be included in v{NEW_VERSION}:

Added:
  - {list}
Changed:
  - {list}
...

Edit this list? [Y to edit / N to proceed]
```

If user wants to edit: use AskUserQuestion to get corrections, then re-display.

---

## Step 4: Update CHANGELOG.md

Read current CHANGELOG.md. Insert a new version section after the `# Changelog` header (before existing entries):

```markdown
## v{NEW_VERSION} ({YYYY-MM-DD})

{one-line summary of the release}

### Added
- {items from Step 3}

### Changed
- {items from Step 3}

### Fixed
- {items from Step 3}

### Removed
- {items from Step 3, if any}
```

Only include sections that have items. If `DRY_RUN`: show what would be written, don't write.

---

## Step 5: Update MIGRATION.md

If there are **Breaking Changes** or **new required files/directories**, prepend a new migration section to MIGRATION.md (after the header, before existing entries):

```markdown
## Migrating to v{NEW_VERSION} (from v{CURRENT_VERSION})

{description of what changed and why}

### New Files
- `{path}` — {purpose}

### Updated Files
- `{path}` — {what changed}

### Breaking Changes
- {description}

### Migration Steps
{step-by-step instructions for existing users}
```

If there are NO breaking changes and no new required files: add a minimal entry:

```markdown
## Migrating to v{NEW_VERSION} (from v{CURRENT_VERSION})

No migration steps required — all changes are backward-compatible.
```

If `DRY_RUN`: show what would be written, don't write.

---

## Step 6: Update core.yaml Version

Update the `hqVersion` field in `core.yaml`:

```bash
yq -i ".hqVersion = \"$NEW_VERSION\"" core.yaml
```

Also update `updatedAt` to current timestamp.

If `DRY_RUN`: report what would change, don't write.

---

## Step 7: Recompute Checksums

Since CHANGELOG.md, MIGRATION.md, and core.yaml are all locked files that just changed:

```bash
bash scripts/compute-checksums.sh
```

Verify:
```bash
bash scripts/core-integrity.sh
```

Must pass. If it doesn't, something went wrong — stop and report.

If `DRY_RUN`: skip (no files were changed).

---

## Step 8: Stage and Report

If not `DRY_RUN`:

```bash
git add core.yaml CHANGELOG.md MIGRATION.md
```

Display:
```
Release v{NEW_VERSION} prepared.

Files staged:
  - core.yaml (version bump)
  - CHANGELOG.md (new entry)
  - MIGRATION.md (new entry)

Checksums recomputed and verified.

Next steps:
  1. Review staged changes: git diff --staged
  2. Commit: git commit -m "release: v{NEW_VERSION}"
  3. Create PR and merge
  4. Tag: git tag v{NEW_VERSION} && git push origin v{NEW_VERSION}
```

If `DRY_RUN`:
```
DRY RUN — no files changed.

Would update:
  - core.yaml: hqVersion {CURRENT} → {NEW_VERSION}
  - CHANGELOG.md: new v{NEW_VERSION} section
  - MIGRATION.md: new migration entry

Run /release {BUMP_TYPE} to apply.
```

---

## Rules

- **Always update all three files** — core.yaml, CHANGELOG.md, MIGRATION.md ship together
- **Never skip MIGRATION.md** — even if no breaking changes, add a "no migration needed" entry
- **Checksums must pass** — if integrity check fails after updates, stop and investigate
- **Don't auto-commit** — stage files and let the contributor review before committing
- **Don't auto-tag** — tagging is a separate step after the PR is merged
- **Changelog format** — follow Keep a Changelog conventions (Added/Changed/Fixed/Removed)
- **Dry run is safe** — never writes when --dry-run is set
