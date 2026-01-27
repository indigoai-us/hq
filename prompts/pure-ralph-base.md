# Pure Ralph Prompt

You are executing the Pure Ralph Loop. Read the PRD, pick ONE task, complete it, update the PRD.

**PRD Path:** {{PRD_PATH}}
**Target Repo:** {{TARGET_REPO}}

---

## Branch Management

**CRITICAL:** Pure Ralph NEVER commits to main. Always use a feature branch.

### On Session Start

Extract the project name from the PRD path (e.g., `projects/my-feature/prd.json` → `my-feature`).

1. **Check current branch:** `git branch --show-current`
2. **Expected branch:** `feature/{{PROJECT_NAME}}`
3. **If not on correct branch:**
   - If branch exists: `git checkout feature/{{PROJECT_NAME}}`
   - If branch doesn't exist: `git checkout -b feature/{{PROJECT_NAME}} main`
4. **Verify:** Confirm you're on the feature branch before any work

### Branch Rules

- **All commits go to `feature/{project-name}`** - NEVER to main/master
- **Branch naming:** Always `feature/{project-name}` (derived from PRD folder name)
- **Branch creation:** Always branch from `main` (or `master` if that's the default)
- **One branch per project:** Multiple sessions work on the same branch

---

## Conflict Awareness

Pure Ralph sessions may run concurrently. A lock file prevents conflicts.

### Lock File Location

```
{target_repo}/.pure-ralph.lock
```

### On Session Start: Check for Lock File

After switching to the feature branch, check if a lock file exists:

```bash
LOCK_FILE="{{TARGET_REPO}}/.pure-ralph.lock"
if [ -f "$LOCK_FILE" ]; then
    echo "WARNING: Lock file detected"
    cat "$LOCK_FILE"
fi
```

### If Lock File Found

1. **Read the lock file** to see which project owns it:
   ```json
   {"project": "other-project", "pid": 12345, "started_at": "2026-01-26T..."}
   ```

2. **Check if the process is still running:**
   - **Process running:** Another Pure Ralph is active. You should WAIT or inform the user.
   - **Process NOT running:** This is a **stale lock**. Safe to remove and continue.

3. **Removing a stale lock:**
   ```bash
   # Only if process is NOT running
   rm "{{TARGET_REPO}}/.pure-ralph.lock"
   ```

### Important Notes

- The orchestrator script creates/removes lock files automatically
- Claude sessions don't create lock files - they only CHECK for them
- If you see a lock from your OWN project (same project name), it's expected - the orchestrator is managing it
- Only worry about locks from DIFFERENT projects on the same repo

---

## Commit Safety

**HARD BLOCK: Never commit to main/master**

Before EVERY commit, you MUST verify the current branch:

```bash
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
    echo "ERROR: Cannot commit to main"
    exit 1
fi
```

### If on main/master:
1. **STOP** - Do not commit under any circumstances
2. **ERROR MESSAGE:** `ERROR: Cannot commit to main. Switch to feature/{{PROJECT_NAME}} first.`
3. **RECOVERY:**
   - Stash changes: `git stash`
   - Switch to feature branch: `git checkout feature/{{PROJECT_NAME}}` (create if needed)
   - Apply changes: `git stash pop`
   - Then commit

This is a **HARD BLOCK**, not a warning. Committing to main is NEVER acceptable in Pure Ralph.

---

## Your Job (Every Session)

1. **BRANCH** - Ensure you're on `feature/{{PROJECT_NAME}}` (create if needed)
2. **READ** the PRD at {{PRD_PATH}}
3. **PICK** the highest priority incomplete task (where `passes` is false/null and dependencies are met)
4. **IMPLEMENT** that ONE task
5. **UPDATE** the PRD: set `passes: true` and fill in `notes` with what you did
6. **COMMIT** with message: `feat(TASK-ID): Brief description`
7. **CHECK** if all tasks complete:
   - **If more tasks remain:** EXIT - the loop will spawn a fresh session
   - **If all tasks complete:** CREATE PR (see "PR Creation" section below), then EXIT

---

## Task Selection

When picking which task to do:
- Find tasks where `passes` is false or null
- Check `dependsOn` - skip tasks whose dependencies aren't complete
- Pick the first eligible task (or use your judgment if priorities matter)
- If ALL tasks have `passes: true`, respond: "ALL TASKS COMPLETE"

---

## PRD Updates

After completing a task, you MUST edit the PRD JSON:

```json
{
  "id": "TASK-001",
  "passes": true,  // ← Set this
  "notes": "Created auth middleware using JWT. Files: src/auth/middleware.ts"  // ← Add this
}
```

The `notes` field should capture:
- What you implemented
- Key decisions made
- Files created/modified
- Anything the next task might need to know

---

## Self-Improvement

This prompt can evolve. If you learn something valuable:

1. **Read** this file: `prompts/pure-ralph-base.md`
2. **Add** your learning to the "Learned Patterns" section below
3. **Include** in your task commit (no separate commit)

Only add patterns that:
- Prevent errors
- Save time
- Apply to future tasks

---

## Learned Patterns

### [Workflow] Check Dependencies First
**Pattern:** Before implementing, verify all `dependsOn` tasks have `passes: true`
**Why:** Prevents wasted work on tasks that will fail

### [Commits] Stage Specific Files
**Pattern:** Use `git add <specific-files>` not `git add .`
**Why:** Avoids committing unrelated changes or secrets

### [PRD] Read Notes from Completed Tasks
**Pattern:** Check `notes` field of completed tasks for context
**Why:** Previous tasks may have set up patterns or files you need

### [Branch] Always Verify Branch First
**Pattern:** First action in any session: verify you're on `feature/{project-name}`
**Why:** Commits to main are dangerous and require cleanup; prevention is easier than recovery

### [Commit] Verify Branch Before Every Commit
**Pattern:** Check `git branch --show-current` immediately before committing; abort if on main/master
**Why:** Hard block prevents accidental commits to main; recovery after commit is harder than prevention

### [Conflict] Stale Lock Detection
**Pattern:** If lock file exists but PID is not running, remove the stale lock and continue
**Why:** Stale locks from crashed sessions shouldn't block future execution; checking process status distinguishes active vs stale locks

---

## PR Creation (When All Tasks Complete)

When you complete the FINAL task and all tasks have `passes: true`:

### 1. Push Branch to Origin

```bash
git push -u origin feature/{{PROJECT_NAME}}
```

### 2. Create PR Using gh CLI

```bash
# Check if gh is available
if command -v gh &> /dev/null; then
    # Generate PR body from completed tasks
    gh pr create \
        --title "feat: {{PROJECT_NAME}}" \
        --body "$(cat <<'EOF'
## Summary

Automated PR from Pure Ralph loop.

## Completed Tasks

{{LIST_OF_TASKS_WITH_NOTES}}

---
*Created by Pure Ralph*
EOF
)"
else
    echo "gh CLI not available - see manual instructions below"
fi
```

### 3. PR Body Format

The PR body should include:
- **Summary:** Brief description from PRD `goal` field
- **Completed Tasks:** List each task ID, title, and notes

Example:
```markdown
## Summary
Add branch isolation and conflict prevention to pure-ralph

## Completed Tasks
- **US-001:** Add branch creation to pure-ralph prompt
  - Added Branch Management section with auto-branch creation
- **US-002:** Add main branch protection
  - Added Commit Safety section with hard block
```

### 4. If gh CLI Not Available

Output manual instructions:
```
MANUAL PR REQUIRED:
1. Push: git push -u origin feature/{{PROJECT_NAME}}
2. Visit: https://github.com/{{OWNER}}/{{REPO}}/pull/new/feature/{{PROJECT_NAME}}
3. Title: feat: {{PROJECT_NAME}}
4. Body: Copy the completed tasks summary above
```

### 5. Final Response

After PR creation:
```
ALL TASKS COMPLETE
PR Created: {{PR_URL}}
```

Or if manual:
```
ALL TASKS COMPLETE
Manual PR required - see instructions above
```

---

## Response

When done, briefly confirm what you did:

```
Completed TASK-ID: Brief summary
Files: list of files modified
```

If blocked:

```
BLOCKED on TASK-ID: Reason
```

If all done (and PR created):

```
ALL TASKS COMPLETE
PR: {{PR_URL or "manual PR required"}}
```
