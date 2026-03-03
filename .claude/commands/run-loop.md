---
description: Run all subtasks of a parent task through the orchestrator loop
allowed-tools: Task, Read, Write, Edit, Glob, Grep, Bash
argument-hint: [task-id] or [--resume task-id] or [--status]
visibility: public
---

# /run-loop - Task Orchestrator Loop

Ultra-lean state machine with fresh context per subtask. Delegates each subtask entirely to a sub-agent via `/execute-task`, receiving only a structured JSON summary back. Each subtask gets clean context; nothing accumulates.

**Arguments:** $ARGUMENTS

## Core Pattern (Fresh-Context)

The orchestrator is an **ultra-lean state machine**. It picks subtasks and delegates each one entirely to a sub-agent via `/execute-task`. The orchestrator:
- Fetches open subtasks from beads via `bd children {task-id} --json`
- Spawns ONE sub-agent per subtask (fresh context per subtask)
- Receives only a structured JSON summary back
- Appends state transitions to `loops/state.jsonl`
- Never accumulates worker outputs, handoff blobs, or implementation details

## Usage

```bash
/run-loop ghq-abc123              # Run all subtasks of task ghq-abc123
/run-loop --resume ghq-abc123     # Resume paused loop
/run-loop --status                # Check active loops
```

## Process

### 1. Parse Arguments

**If `--status`:**
- Read last entries from `loops/state.jsonl` and `loops/history.jsonl`
- Display active and completed loop statuses
- Exit

**If `--resume {task-id}`:**
- Read `loops/state.jsonl` to find last state for this task
- Fetch subtasks from beads, skip already-closed ones
- Continue from next open + unblocked subtask
- Orchestrator starts with ZERO accumulated context -- only state.jsonl + beads

**If `{task-id}`:**
- Validate task exists: `bd show {task-id} --json`
- If task **NOT FOUND**: STOP immediately.
  ```
  ERROR: Task {task-id} not found in beads.

  Fix: Run /create-task to create a task with subtasks.
  ```
- Fetch subtasks: `bd children {task-id} --json`
- If no children: STOP with "Task {task-id} has no subtasks. Add subtasks with `bd create --parent {task-id}`."
- Check if a loop is already in progress for this task (scan state.jsonl for `loop_start` without `loop_end`)

### 2. Load Subtasks

```bash
bd children {task-id} --json
```

Parse the JSON output. Filter to open subtasks:

```javascript
const allChildren = JSON.parse(bdOutput)
const open = allChildren.filter(t => t.status === "open" || t.status === "in_progress")
const closed = allChildren.filter(t => t.status === "closed")
const total = allChildren.length
const completed = closed.length
const remaining = open

if (remaining.length === 0) {
  STOP: "All subtasks are already closed."
}
```

Load parent task metadata for quality gates and repo path:

```bash
bd show {task-id} --json
```

Extract from parent's metadata (stored as JSON in the metadata field):
- `qualityGates` -- commands to run after each skill
- `repoPath` -- target repository path
- `relatedSkills` -- skill IDs from registry

### 3. Ask Work Mode

**ALWAYS ask the user before starting. GHQ never uses feature branches.**

```
Loop: {task-id} ({parent.title})
Progress: {completed}/{total} ({percentage}%)

Remaining subtasks:
  1. {id}: {title} (next)
  2. {id}: {title}
  ...

Work mode (GHQ never uses feature branches):
  1. Work on main (simple, direct)
  2. Use a git worktree (isolated, parallel-safe)

Which mode?
```

Use the user's answer to determine work mode. If worktree:
- Create a worktree using `git worktree add`
- All sub-agents work in the worktree directory

If main:
- Verify currently on `main` branch
- All sub-agents work in the repo directory on main

**NEVER create feature branches.** The only two options are main or worktree.

### 4. Initialize State

Append a `loop_start` entry to `loops/state.jsonl`:

```jsonl
{"ts":"{ISO8601}","type":"loop_start","data":{"task_id":"{task-id}","stories_total":{total},"stories_pending":{remaining.length}}}
```

### 4b. Build Dependency Graph and Batch Plan

Before entering the loop, build a dependency DAG from all subtasks and group them into parallel execution batches. This determines the execution order and which subtasks can run concurrently.

**Generate batches:**

```bash
BATCHES=$(scripts/dep-graph.sh {task-id})
# Output: [["taskA","taskB"], ["taskC"], ["taskD","taskE"]]
# Each inner array is a batch of independent subtasks that can run in parallel.
# Batches are ordered: batch 0 must complete before batch 1 starts.
```

**Algorithm (Kahn topological sort with level tracking):**

1. Fetch all subtasks via `bd children {task-id} --json`
2. Filter to open/in_progress subtasks only (closed = already resolved)
3. Extract `blocks`-type dependencies (ignore `parent-child` which is structural)
4. Build in-degree map (count of unresolved blocking deps per subtask)
5. Iteratively:
   - Collect all subtasks with in-degree 0 (no unresolved deps) into a batch
   - Remove them from the graph
   - Decrement in-degrees of their dependents
   - Repeat until all subtasks are placed

**Edge cases handled:**

| Scenario | Result |
|----------|--------|
| No dependencies between subtasks | All subtasks in a single batch (maximum parallelism) |
| Linear chain (A blocks B blocks C) | Each subtask in its own batch (fully sequential) |
| Diamond (A blocks B+C, B+C block D) | Batches: [A], [B,C], [D] |
| Closed dependency | Treated as resolved (does not block) |
| Cycle detected | All remaining subtasks dumped in final batch (fallback) |

**Display the batch plan:**

```
Batch Plan for {task-id}:
  Batch 1: {id1}, {id2}  (parallel)
  Batch 2: {id3}          (sequential)
  Batch 3: {id4}, {id5}  (parallel)
Total: {N} batches, {M} subtasks
```

### 5. The Loop

The orchestrator is an **ultra-lean state machine**. It picks subtasks and delegates everything to sub-agents. Classification, skill selection, skill chains, and learning capture all happen inside the sub-agent via `/execute-task`. The orchestrator NEVER accumulates implementation context.

```
while (open subtasks remain):

    5a. SELECT next subtask
        - Priority order from beads (sorted by priority field)
        - Respect dependencies: `bd dep list {subtask-id}` -- skip if deps are open
        - First open + unblocked subtask

        Report:
        ```
        ────────────────────────────────────
        Next: {subtask.id} - {subtask.title}
        Progress: {completed}/{total} ({percentage}%)
        ────────────────────────────────────
        ```

    5b. EXECUTE subtask via sub-agent

        Spawn a SINGLE sub-agent for the entire subtask.
        The sub-agent handles classification, skill selection,
        the full skill chain, task closure, execution state,
        and learning capture -- all via /execute-task.

        Task({
          description: "Execute {subtask.id}: {subtask.title}",
          prompt: "IMPORTANT: Do NOT use EnterPlanMode or TodoWrite.
                   Execute /execute-task IMMEDIATELY -- it handles all planning,
                   classification, skill selection, and execution internally.

                   Run /execute-task {subtask.id}

                   After completion, output ONLY this structured JSON:
                   {
                     \"task_id\": \"{subtask.id}\",
                     \"status\": \"completed|failed|blocked\",
                     \"summary\": \"1-sentence summary\",
                     \"workers_used\": [\"list\"],
                     \"models_used\": {},
                     \"back_pressure\": {
                       \"tests\": \"pass|fail|skipped\",
                       \"lint\": \"pass|fail|skipped\",
                       \"typecheck\": \"pass|fail|skipped\",
                       \"build\": \"pass|fail|skipped\"
                     }
                   }"
        })

        The sub-agent's full context (skill outputs, handoff blobs,
        file diffs, error traces) is freed when it returns.
        Only the structured JSON crosses the boundary.

    5c. POST-SUBTASK (orchestrator side -- minimal)

        Parse the sub-agent's JSON output.

        i. If status == "completed":
           - Append to loops/state.jsonl:
             {"ts":"{now}","type":"story_complete","story_id":"{subtask.id}","data":{"skills_run":[...]}}
           - Increment completed count

        ii. If status == "failed" or "blocked":
            - Append to loops/state.jsonl:
              {"ts":"{now}","type":"story_blocked","story_id":"{subtask.id}","data":{"reason":"{summary}"}}
            - Ask user:
              1. Retry this subtask
              2. Skip and continue
              3. Pause loop (run /run-loop --resume {task-id})

    5d. PROGRESS DISPLAY

        After each subtask completes, show progress:
        ```
        ════════════════════════════════════
        LOOP: {task-id} ({parent.title})
        PROGRESS: {completed}/{total} ({percentage}%)

        Completed this session:
          {id}: {summary}
          {id}: {summary}

        Remaining:
          {id}: {title}
          {id}: {title}
        ════════════════════════════════════
        ```

    5e. AUTO-REANCHOR (between subtasks, silent)

        After processing each subtask result, refresh context:
        1. Re-fetch subtasks from beads: `bd children {task-id} --json`
        2. Refresh git state: `git log --oneline -3`
        3. If subtask failed: search for known fixes via `qmd vsearch "{error}" --json -n 5`

    5f. CONTEXT SAFETY NET

        If > 8 subtasks completed this session OR context heavy:
          - Append state to loops/state.jsonl
          - Print: "Context boundary reached. Run: /run-loop --resume {task-id}"
          - STOP
```

### 6. Handle Subtask Failure

If a sub-agent returns failed/blocked:

```
Subtask {subtask.id} failed: {summary}

Options:
1. Retry this subtask
2. Skip and continue to next subtask
3. Pause loop (/run-loop --resume {task-id})
4. Abort
```

Use the user's response to decide next action.

### 7. Complete Loop

When all subtasks are closed:

**Append loop_end to state.jsonl:**
```jsonl
{"ts":"{ISO8601}","type":"loop_end","data":{"task_id":"{task-id}","stories_completed":{completed},"stories_blocked":{blocked}}}
```

**Append summary to history.jsonl:**
```jsonl
{"ts":"{ISO8601}","task_id":"{task-id}","duration_s":{elapsed},"stories_completed":{N},"stories_blocked":{N},"skills_invoked":{N},"blocked_stories":[]}
```

**Close the parent task if all children are done:**
```bash
bd epic close-eligible
```

**Display completion report:**
```
════════════════════════════════════
LOOP COMPLETE: {task-id} ({parent.title})

Subtasks: {completed}/{total}
Skills used: {aggregated from session}
════════════════════════════════════
```

**If worktree mode -- ask user:**
```
Loop completed in worktree. How should we merge?

1. Merge directly to main
2. Create a PR for review
```

If merge: `git checkout main && git merge {worktree-branch}`
If PR: `gh pr create --title "{parent.title}: all subtasks complete" --body "..."`

**Post-loop cleanup:**
1. `qmd update 2>/dev/null || true` -- reindex all changes
2. Commit if dirty: `git add -A && git commit -m "loop-complete: {task-id}"`

### 8. Status Display (--status)

Read `loops/state.jsonl` and `loops/history.jsonl`:

```
Loop Status

ACTIVE:
  {task-id} ({title}) -- {completed}/{total} ({pct}%)

COMPLETED:
  {task-id} ({title}) -- {completed}/{total} -- {duration}
```

## Rules

- **ONE loop at a time**
- **Sub-agent per subtask** -- each subtask runs in its own Task() sub-agent via `/execute-task`. The orchestrator NEVER executes skill phases directly.
- **Context discipline** -- the orchestrator stores ONLY task_id, status, and 1-sentence summary per subtask. No skill outputs, no handoff blobs, no file lists.
- **Fresh context per subtask** -- sub-agent context is freed when it returns.
- **Resume is first-class** -- `--resume` is how multi-session loops continue. Not a fallback -- the expected path for large loops.
- **Back pressure is mandatory** -- enforced inside `/execute-task`, not by the orchestrator.
- **Fail fast** -- pause on errors, surface to user.
- **Beads is the source of truth** -- tasks and state come from `bd`, not files.
- **Sub-agents must NOT use EnterPlanMode** -- /execute-task is the planning pipeline.
- **Work mode: main or worktree only** -- NEVER create feature branches. Always ask the user which mode before starting.
- **If worktree: ask merge or PR on completion** -- never assume one or the other.
- **Zero accumulation** -- receives only structured JSON back from sub-agents. Discards everything else.

## Integration

- `/create-task` creates task + subtasks under a project epic -> `/run-loop {task-id}` executes the subtasks
- `/execute-task {subtask-id}` runs single subtask (standalone or as sub-agent)
- `/run-loop --resume` continues from next open subtask with fresh context
