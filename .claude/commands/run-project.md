---
description: Run all subtasks of a parent task, delegating each to bd-worker
allowed-tools: Read, Bash, AskUserQuestion
argument-hint: <task-id>
visibility: public
---

# /run-project - Execute Task Subtasks

Orchestrates execution of a bd task's subtasks. Each subtask is delegated to `bd-worker` via `ask-claude.sh` in a worktree. The command handles review, commit, retry, and PR creation.

**Arguments:** $ARGUMENTS

**Pipeline:** `/idea` → `/brainstorm` → `/plan-project` → **`/run-project`**

## Step 1: Parse & Validate

Extract `{task-id}` from `$ARGUMENTS`.

If empty: STOP with "Usage: `/run-project <task-id>`"

Resolve company from the task ID prefix. Read `companies/manifest.yaml` to find the matching company slug.

```bash
cd companies/{slug}
bd show {task-id} --json
```

If task **NOT FOUND**: STOP.
```
ERROR: Task {task-id} not found in beads.

Fix: Run /plan-project to create a task with subtasks.
```

## Step 2: Check Subtasks

```bash
cd companies/{slug} && bd children {task-id} --json
```

If no children: STOP with "Task {task-id} has no subtasks. Run `/plan-project {task-id}` to decompose it first."

Count open vs closed subtasks. If all closed: STOP with "All subtasks are already closed."

Display:
```
Run: {task-id} ({title})
Progress: {closed}/{total} subtasks complete

Remaining:
  1. {id}: {title}
  2. {id}: {title}
  ...
```

## Step 3: Resolve Work Directory

Extract `repoPath` from the parent task's metadata. If not set, ask the user:

```
Which repo should the orchestrator work in?
```

Validate the path exists.

## Step 4: Create Worktree

```bash
cd {work-dir}
BRANCH="bd/{task-id}"
git worktree add -b "$BRANCH" ".worktrees/$BRANCH" HEAD
WORKTREE_DIR="{work-dir}/.worktrees/$BRANCH"
```

All subsequent file changes happen inside the worktree.

## Step 5: Mark In-Progress

```bash
cd companies/{slug} && bd update {task-id} --status in_progress
```

## Step 6: The Loop

Process subtasks in dependency order. Use `bd ready --mol {task-id}` from the company directory to respect ordering. Skip any subtask whose `issue_type` is `gate`.

```
for each non-gate subtask in dependency order:

    6a. REPORT
        ────────────────────────────────────
        Next: {subtask-id} - {subtask-title}
        Progress: {completed}/{total} ({percentage}%)
        ────────────────────────────────────

    6b. EXECUTE via bd-worker

        ./companies/ghq/tools/ask-claude.sh \
          -c {slug} \
          -w "$WORKTREE_DIR" \
          -t bd-worker \
          "{subtask-id}"

        Wait for completion.

    6c. REVIEW

        1. Run `cd "$WORKTREE_DIR" && git diff` to see changes.
        2. Run `cd companies/{slug} && bd show {subtask-id}` to re-read acceptance criteria.
        3. If tests exist in the repo, run them.
        4. Evaluate: do the changes satisfy the requirements?

    6d. ACCEPT or REJECT

        If acceptable:
          cd "$WORKTREE_DIR"
          git add -A
          git commit -m "feat({subtask-id}): {brief description}"
          git push -u origin "$BRANCH"
          cd companies/{slug} && bd close {subtask-id}

        If not acceptable (max 2 retries per subtask):
          cd "$WORKTREE_DIR"
          git checkout -- .
          git clean -fd
          Re-run bd-worker with retry instructions:
            ./companies/ghq/tools/ask-claude.sh \
              -c {slug} \
              -w "$WORKTREE_DIR" \
              -t bd-worker \
              "{subtask-id} — RETRY: {describe problems and specific fix guidance}"

        If all retries exhausted: STOP execution. Jump to Step 7.

    6e. GATE CHECK

        If the next subtask is a gate, stop executing and jump to Step 7.
        Gates mean a human needs to review before work can continue.
```

## Step 7: Create PR

Create a PR when either all non-gate subtasks are done, or a gate blocks further progress, or retries were exhausted:

```bash
cd "$WORKTREE_DIR"
gh pr create \
  --title "{task-id}: {task title}" \
  --body "## Summary
<list of completed subtasks and what each one did>

## Subtask Results
- {subtask-1}: completed / failed
- {subtask-2}: completed / failed

## Notes
<any assumptions, skipped tasks, or issues encountered>"
```

If a gate blocked work, update it with the PR:
```bash
cd companies/{slug} && bd comments add {gate-id} "PR ready for review: {pr-url}
Worktree: $WORKTREE_DIR
Branch: $BRANCH"
```

## Step 8: Post-Run

Re-check subtask status:

```bash
cd companies/{slug} && bd children {task-id} --json
```

**If all subtasks closed:** set the parent task to `in_review`:

```bash
cd companies/{slug} && bd update {task-id} --status in_review
```

The parent stays `in_review` until the user explicitly closes it. Do NOT close the parent task or ancestor epics automatically.

**If some subtasks remain open:** leave the parent as `in_progress`.

Display completion summary:

```
════════════════════════════════════
RUN COMPLETE: {task-id} ({title})

Subtasks: {completed}/{total}
PR: {pr-url or "none"}
Status: {in_review | in_progress}
════════════════════════════════════
```

Reindex: `qmd update 2>/dev/null || true`

## Step 9: Cleanup

If no gates are pending, remove the worktree:
```bash
cd {work-dir}
git worktree remove ".worktrees/$BRANCH"
```

If a gate is pending, keep the worktree alive and note the path.

If any subtasks remain open, suggest:
```
Remaining subtasks can be retried:
  /run-project {task-id}    (re-runs remaining open subtasks)
```

## Rules

- **Orchestrator pattern** -- this command IS the orchestrator. It loops through subtasks, delegating each to `bd-worker` via `ask-claude.sh`.
- **No sub-agents** -- uses `ask-claude.sh -t bd-worker`, not Task() or Agent().
- **Beads is the source of truth** -- tasks and state come from `bd`, not files.
- **Max 2 retries per subtask** -- if retries exhausted, stop and create PR with completed work.
- **Gates are not executable** -- when a gate is next, stop and create PR for human review.
- **Do NOT close parent tasks** -- only set `in_review`. The user decides when to close.
- **Do NOT use TodoWrite or EnterPlanMode** -- this command handles orchestration directly.

## Integration

- `/plan-project` creates task + subtasks under a project epic → `/run-project {task-id}` executes them
- `/run-project` can be re-run to pick up remaining open subtasks
