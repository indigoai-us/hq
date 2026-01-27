# Pure Ralph Branch Workflow

How Pure Ralph manages branches, PRs, and concurrent execution.

---

## Automatic Branch Creation

Pure Ralph never commits to `main`. Every project gets its own feature branch.

### On Session Start

1. **Extract project name** from PRD path (e.g., `projects/my-feature/prd.json` → `my-feature`)
2. **Check current branch:** `git branch --show-current`
3. **Expected branch:** `feature/{project-name}`
4. **Switch or create:**
   - If branch exists: `git checkout feature/{project-name}`
   - If not: `git checkout -b feature/{project-name} main`

### Branch Naming Convention

```
feature/{project-name}
```

Where `{project-name}` is the folder name containing the PRD.

### Example

```
PRD: C:/my-hq/projects/user-auth/prd.json
Branch: feature/user-auth
```

---

## PR Creation Process

When all tasks in a PRD have `passes: true`, Pure Ralph creates a PR.

### Automatic Steps

1. **Push branch to origin:**
   ```bash
   git push -u origin feature/{project-name}
   ```

2. **Create PR using gh CLI:**
   ```bash
   gh pr create \
       --title "feat: {project-name}" \
       --body "## Summary
   {goal from PRD}

   ## Completed Tasks
   - **US-001:** Task title
     - Notes from implementation
   - **US-002:** Task title
     - Notes from implementation

   ---
   *Created by Pure Ralph*"
   ```

### PR Body Format

- **Summary:** From the PRD's `goal` field
- **Completed Tasks:** Each task ID, title, and notes

### If gh CLI Not Available

Claude outputs manual instructions:
```
MANUAL PR REQUIRED:
1. Push: git push -u origin feature/{project-name}
2. Visit: https://github/{owner}/{repo}/pull/new/feature/{project-name}
3. Title: feat: {project-name}
4. Body: Copy the completed tasks summary
```

---

## Lock File Mechanism

Prevents concurrent Pure Ralph executions on the same repository.

### Lock File Location

```
{target_repo}/.pure-ralph.lock
```

### Lock File Contents

```json
{
  "project": "my-feature",
  "pid": 12345,
  "started_at": "2026-01-26T14:30:00Z"
}
```

### Lifecycle

1. **On loop start:** Orchestrator creates lock file
2. **During execution:** Lock file persists
3. **On loop exit:** Orchestrator removes lock file (success or failure)

### Implementation Details

**PowerShell (`pure-ralph-loop.ps1`):**
- Uses `try/finally` to ensure cleanup
- `Create-LockFile` and `Remove-LockFile` functions

**Bash (`pure-ralph-loop.sh`):**
- Uses `trap cleanup_on_exit EXIT` for cleanup
- `create_lock_file` and `remove_lock_file` functions

---

## Handling Concurrent Execution Attempts

### Detection

On loop start, orchestrator checks for existing lock file.

### User Prompt

If lock exists:
```
=== WARNING: Lock File Detected ===
Another pure-ralph loop may be running on this repo.

  Project: other-project
  PID: 12345
  Started: 2026-01-26T14:30:00Z
  Duration: 01:23:45
  Process Status: RUNNING (or "NOT RUNNING (stale lock)")

Another pure-ralph is running. Continue anyway? (y/N)
```

### Decision

- **Default (N):** Abort to prevent conflicts
- **Y:** Continue (overwrites lock, user accepts risk)

### Process Status Check

The orchestrator checks if the PID is still running:
- **RUNNING:** Another loop is actively executing
- **NOT RUNNING (stale lock):** Previous loop crashed without cleanup

---

## Manual Recovery: Stale Locks

If a Pure Ralph session crashes, the lock file may remain.

### Identifying a Stale Lock

A lock is stale when:
- The lock file exists
- The PID in the lock file is not running

### Manual Removal

```bash
# Verify the process is not running
ps -p $(jq -r '.pid' .pure-ralph.lock) || echo "Process not running"

# Remove the stale lock
rm .pure-ralph.lock
```

**PowerShell:**
```powershell
# Check if process is running
$lock = Get-Content .pure-ralph.lock | ConvertFrom-Json
Get-Process -Id $lock.pid -ErrorAction SilentlyContinue

# Remove if not running
Remove-Item .pure-ralph.lock
```

### When Claude Encounters a Stale Lock

Claude sessions check for lock files but don't create them. If Claude finds a stale lock:

1. Check if PID is running
2. If not running: safe to remove and continue
3. If running: wait or inform user

---

## Summary Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                     Pure Ralph Loop                          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Check for existing lock                                  │
│     ├─ Lock found + PID running → Prompt user               │
│     └─ No lock (or stale) → Continue                        │
│                                                              │
│  2. Create lock file                                         │
│                                                              │
│  3. For each task:                                           │
│     ├─ Verify on feature branch                             │
│     ├─ Read PRD, pick task                                  │
│     ├─ Implement task                                       │
│     ├─ Update PRD (passes: true)                            │
│     └─ Commit to feature branch                             │
│                                                              │
│  4. All tasks complete?                                      │
│     ├─ Push branch                                          │
│     └─ Create PR                                            │
│                                                              │
│  5. Remove lock file (always, even on failure)              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Related Files

- **Prompt:** `prompts/pure-ralph-base.md` - Branch rules, commit safety, PR creation
- **PowerShell Orchestrator:** `.claude/scripts/pure-ralph-loop.ps1`
- **Bash Orchestrator:** `.claude/scripts/pure-ralph-loop.sh`
- **Learnings:** `knowledge/pure-ralph/learnings.md`
