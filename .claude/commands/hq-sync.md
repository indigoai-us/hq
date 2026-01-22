---
description: Sync HQ modules from configured repositories
allowed-tools: Bash, Read, AskUserQuestion
---

# HQ Sync

Run `hq modules sync` to synchronize modules defined in your manifest.

## Prerequisites

Ensure the CLI is built:
```bash
cd modules/cli && npm run build
```

## Execution

### Step 1: Run the sync command

Execute `hq modules sync` with `--no-interactive` flag to capture output:

```bash
npx hq modules sync --no-interactive 2>&1
```

### Step 2: Parse and handle output

The sync command produces structured output. Parse for these patterns:

**Success indicators:**
- `✓ {module}: Updated, N copied` - module synced successfully
- `✓ {module}: Already up to date` - no changes needed
- `Sync complete: N succeeded, 0 failed`

**Conflict indicators:**
- `Conflict: {path}` - local file modified since last sync
- `kept local: N` - files where local version was preserved

**Failure indicators:**
- `✗ {module}: {error}` - module sync failed
- `Sync complete: N succeeded, M failed`

### Step 3: Handle conflicts interactively

If conflicts are detected (look for "kept local" count > 0 in summary), offer to re-run with interactive mode:

Use AskUserQuestion with:
- Question: "Some files had conflicts and kept local versions. Would you like to review these conflicts individually?"
- Options:
  1. "Yes, review conflicts" - Re-run specific modules with interactive prompts
  2. "No, keep local versions" - Done, local files preserved
  3. "Show conflict details" - Read `.hq-sync-state.json` and report which files

### Step 4: Interactive conflict resolution

If user chooses to review conflicts, for each conflicting file:

1. Run `hq modules sync --module {module-name}` (without --no-interactive)
2. When you see conflict prompt, use AskUserQuestion:
   - Question: "Conflict in `{file-path}`. Local file modified since last sync."
   - Options:
     1. "Keep local" - preserve local changes
     2. "Take incoming" - overwrite with module version
     3. "Show diff" - display differences first

3. Based on user choice, send the appropriate key to stdin:
   - Keep: `k`
   - Take: `t`
   - Diff: `d` (then ask again after showing)

## Output Format

Report results to user in this format:

```
## HQ Sync Results

**Modules synced:** N
**Files updated:** N
**Conflicts:** N (kept local)

### Summary
- ✓ module-name: Updated, 5 copied
- ✓ other-module: Already up to date

### Conflicts (if any)
- `path/to/file.ts` - kept local version
```

## Options

Support these variations via user request:

- **Sync specific module:** `hq modules sync --module {name}`
- **Dry run:** `hq modules sync --dry-run` - show what would change
- **Locked versions:** `hq modules sync --locked` - use exact versions from lock file

## Error Handling

If sync fails:
1. Report the error message
2. Common fixes:
   - "Manifest not found" → Run from HQ root directory
   - "Git error" → Check network/credentials
   - "Permission denied" → Check file permissions
