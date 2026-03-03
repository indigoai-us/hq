---
description: Run all subtasks of a parent task through the orchestrator loop
allowed-tools: Task, Read, Write, Edit, Glob, Grep, Bash
argument-hint: [task-id] or [--resume task-id] or [--status]
visibility: public
---

# /run-loop - Task Orchestrator Loop

Ultra-lean state machine with batch-parallel execution. Builds a dependency graph, groups subtasks into parallel batches, and spawns up to 5 concurrent sub-agents per batch via `/execute-task`. Each sub-agent gets fresh context; nothing accumulates. Only structured JSON summaries cross the boundary.

**Arguments:** $ARGUMENTS

## Core Pattern (Batch-Parallel, Fresh-Context)

The orchestrator is an **ultra-lean state machine**. It builds a dependency graph, groups subtasks into parallel batches, and spawns up to 5 sub-agents concurrently per batch via `/execute-task`. The orchestrator:
- Builds dependency DAG and groups subtasks into execution batches via `scripts/dep-graph.sh`
- Spawns up to 5 sub-agents in parallel per batch (fresh context per sub-agent)
- Waits for ALL sub-agents in a batch to complete before proceeding to the next batch
- Receives only a structured JSON summary from each sub-agent
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

**Generate batch_id for each batch:**

Each batch gets a unique `batch_id` following the schema from `loops/README.md`:

```
batch_id = "{task-id}-b{batch_number}-{epoch_seconds}"
```

Example: `ghq-abc123-b1-1709312400`, `ghq-abc123-b2-1709312410`

The `batch_id` is generated once when the batch starts and passed to ALL sub-agents in that batch so their state.jsonl entries can be correlated.

**Display the batch plan:**

```
Batch Plan for {task-id}:
  Batch 1: {id1}, {id2}  (parallel)
  Batch 2: {id3}          (sequential)
  Batch 3: {id4}, {id5}  (parallel)
Total: {N} batches, {M} subtasks
```

### 4c. File Overlap Detection

Before spawning parallel sub-agents for a batch, detect whether any subtasks in the batch might modify the same files. If overlap is found, split the batch into sequential sub-batches to prevent parallel write conflicts.

**Apply overlap detection to each batch:**

```bash
# For each batch, build input JSON with subtask metadata and pass to file-overlap.sh
# The script estimates file scope from each subtask's title, description, and acceptanceCriteria
# and splits overlapping subtasks into separate sub-batches.

SUBTASKS_JSON=$(bd children {task-id} --json)

for each batch in BATCHES:
    # Build input for file-overlap.sh
    OVERLAP_INPUT=$(echo "$SUBTASKS_JSON" | jq -c --argjson batch "$batch" '
      {
        batch: $batch,
        subtasks: (
          [.[] | select(.id as $id | $batch | index($id) != null)] |
          reduce .[] as $t ({}; . + { ($t.id): $t })
        )
      }
    ')

    # Detect overlaps and get sub-batches
    SUB_BATCHES=$(echo "$OVERLAP_INPUT" | scripts/file-overlap.sh --stdin)
    # Output: [["taskA","taskC"], ["taskB"]]
    # If no overlap: [["taskA","taskB","taskC"]] (unchanged)
    # Overlap logs appear on stderr (e.g., "file-overlap: serialized taskB after taskA due to overlap on: SKILL.md")

    # Replace the original batch with the sub-batches
    # Each sub-batch is processed sequentially; tasks within a sub-batch run in parallel
```

**How file scope is estimated:**

The overlap detector extracts file paths from each subtask's combined text (title + description + acceptanceCriteria) using two heuristics:
1. **Directory paths**: Patterns like `.claude/skills/deep-research/SKILL.md`, `src/models/user.ts`
2. **Standalone filenames**: Patterns like `SKILL.md`, `run-loop.md` (uppercase-starting filenames with extensions)

Two subtasks conflict if they share any extracted file path (case-insensitive comparison).

**Conflict resolution (greedy first-fit):**

Tasks are processed in their original batch order. Each task is assigned to the first sub-batch where it has no conflict with any already-assigned task. If no existing sub-batch works, a new sub-batch is created. This produces the minimum number of sub-batches while preserving task ordering.

**Example:**

```
Original batch from dep-graph:  ["task-a", "task-b", "task-c"]

task-a: targets .claude/skills/deep-research/SKILL.md
task-b: targets .claude/skills/deep-research/SKILL.md  (overlaps with task-a!)
task-c: targets knowledge/ghq-core/loops-schema.md      (no overlap)

After overlap detection:
  Sub-batch 1: ["task-a", "task-c"]  (parallel -- no file overlap)
  Sub-batch 2: ["task-b"]            (serialized after task-a due to SKILL.md overlap)

Log output (stderr):
  file-overlap: serialized task-b after task-a due to overlap on: .claude/skills/deep-research/skill.md
```

**Integration with the loop (step 5):**

The sub-batches from overlap detection are treated as the actual execution units. Each sub-batch within a dependency batch is processed sequentially (to avoid file conflicts), but tasks within each sub-batch still run in parallel. This means the execution order is:

```
for each dependency_batch in BATCHES:           # from dep-graph (step 4b)
    for each sub_batch in overlap_split(dependency_batch):  # from file-overlap (step 4c)
        spawn sub_batch tasks in parallel        # step 5b
        wait for all to complete                 # step 5c
```

### 5. The Loop (Batch-Parallel)

The orchestrator is an **ultra-lean state machine** that processes batches from the dependency graph (step 4b). Within each batch, independent subtasks are spawned as **parallel sub-agents** (up to max 5 concurrency). The orchestrator waits for all sub-agents in a batch to complete before proceeding to the next batch.

**Constants:**

```
MAX_CONCURRENCY = 5   # Max sub-agents running simultaneously
```

```
for each batch in BATCHES:

    5a. APPLY OVERLAP DETECTION AND CHUNK FOR CONCURRENCY

        First, run file overlap detection (step 4c) on the current batch
        to split it into sub-batches that avoid file conflicts:

        ```bash
        SUB_BATCHES=$(echo "$OVERLAP_INPUT" | scripts/file-overlap.sh --stdin)
        # If overlap detected: [["task-a","task-c"], ["task-b"]]
        # If no overlap:       [["task-a","task-b","task-c"]]
        ```

        Then, for each sub-batch, if it has more than MAX_CONCURRENCY subtasks,
        split it into chunks of MAX_CONCURRENCY:

        ```javascript
        for (const sub_batch of sub_batches) {
          const chunks = []
          for (let i = 0; i < sub_batch.length; i += MAX_CONCURRENCY) {
            chunks.push(sub_batch.slice(i, i + MAX_CONCURRENCY))
          }
          // Process chunks sequentially; tasks within chunk run in parallel
        }
        ```

        Generate batch_id for this batch:
        ```javascript
        const batch_id = `${task_id}-b${batch_number}-${Math.floor(Date.now()/1000)}`
        // Example: "ghq-abc123-b2-1709312410"
        // This batch_id is passed to every sub-agent in this batch
        // so all their state.jsonl entries can be correlated.
        ```

        Report:
        ```
        ────────────────────────────────────
        Batch {N}/{total_batches}: {batch.length} subtasks
        batch_id: {batch_id}
        Sub-batches: {sub_batch_count} (after overlap detection)
        Concurrency: min({sub_batch.length}, {MAX_CONCURRENCY})
        Subtasks: {id1}, {id2}, ...
        Progress: {completed}/{total} ({percentage}%)
        ────────────────────────────────────
        ```

        If overlap was detected, also report:
        ```
        ⚠ File overlap detected:
          {task-b} serialized after {task-a} (shared: SKILL.md)
        ```

    5b. SPAWN parallel sub-agents for each chunk

        For each sub-batch (from overlap detection), then for each chunk
        within the sub-batch, spawn ALL sub-agents concurrently using
        Task tool with run_in_background.

        ```
        for each sub_batch in sub_batches:       // sequential (overlap-safe)
          for each chunk in chunks(sub_batch):   // sequential (concurrency-limited)

            // Spawn all sub-agents in this chunk simultaneously
            for each subtask in chunk:

                Task({
                  description: "Execute {subtask.id}: {subtask.title}",
                  run_in_background: true,
                  prompt: "IMPORTANT: Do NOT use EnterPlanMode or TodoWrite.

                           The working directory for all file changes is: {workdir}

                           This subtask is part of batch_id: {batch_id}
                           Include this batch_id in all state.jsonl entries you write.

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
                             \"batch_id\": \"{batch_id}\",
                             \"back_pressure\": {
                               \"tests\": \"pass|fail|skipped\",
                               \"lint\": \"pass|fail|skipped\",
                               \"typecheck\": \"pass|fail|skipped\",
                               \"build\": \"pass|fail|skipped\"
                             }
                           }"
                })

            // IMPORTANT: All Task() calls in the chunk are made in
            // the SAME message so they run concurrently.
            // The orchestrator then waits for ALL to complete.

            // Wait for all sub-agents in this chunk to return.
            // Each sub-agent's full context (skill outputs, handoff blobs,
            // file diffs, error traces) is freed when it returns.
            // Only the structured JSON crosses the boundary.

            // If chunk had fewer tasks than MAX_CONCURRENCY,
            // proceed immediately when all return.
        ```

        **Spawning rules:**
        - All Task() calls for a chunk MUST be in the same message (parallel dispatch)
        - Each sub-agent is fully independent -- no shared state between parallel agents
        - The orchestrator does NOT read any files between spawn and completion
        - Max 5 sub-agents active at any time (chunk size enforces this)

    5c. POST-BATCH (orchestrator side -- minimal)

        After ALL sub-agents in the chunk return, process results:

        ```
        for each result in chunk_results:

            i. If status == "completed":
               - Append to loops/state.jsonl:
                 {"ts":"{now}","type":"story_complete","story_id":"{subtask.id}","batch_id":"{batch_id}","data":{"skills_run":[...]}}
               - Increment completed count

            ii. If status == "failed" or "blocked":
                - Append to loops/state.jsonl:
                  {"ts":"{now}","type":"story_blocked","story_id":"{subtask.id}","batch_id":"{batch_id}","data":{"reason":"{summary}"}}
                - Mark subtask as blocked (do NOT stop the batch -- other subtasks may have succeeded)
                - Collect failed subtask IDs for post-batch user prompt
        ```

        **Failure handling within a batch:**
        - A failed sub-agent does NOT block other sub-agents in the same chunk
        - All sub-agents in the chunk run to completion regardless of peer failures
        - Failed subtasks are collected and reported AFTER the entire chunk completes
        - If ANY subtasks failed in the batch, prompt user ONCE after the batch:

        ```
        Batch {N} ({batch_id}) completed with failures:
          [{parallel_count} subtasks ran in parallel]
          Completed: {id1}, {id2} (N succeeded)
          Failed: {id3} -- {summary}

        Options for failed subtasks:
        1. Retry failed subtasks (spawns new batch of just the failures)
        2. Skip and continue to next batch
        3. Pause loop (/run-loop --resume {task-id})
        ```

    5d. PROGRESS DISPLAY

        After each BATCH completes (not after each subtask), show progress:
        ```
        ════════════════════════════════════
        LOOP: {task-id} ({parent.title})
        PROGRESS: {completed}/{total} ({percentage}%)

        Batch {N}/{total_batches} complete ({batch_id}):
          [{parallel_count} subtasks ran in parallel]
          {id}: {summary} [completed]
          {id}: {summary} [completed]
          {id}: {summary} [failed]

        Remaining batches: {remaining_count}
        Next batch: {next_batch_ids}
        ════════════════════════════════════
        ```

    5e. AUTO-REANCHOR (between batches, silent)

        After processing each batch (not each subtask), refresh context:
        1. Re-fetch subtasks from beads: `bd children {task-id} --json`
        2. Rebuild dependency graph: `scripts/dep-graph.sh {task-id}`
           (closed tasks may unlock new batches)
        3. Refresh git state: `git log --oneline -5`
        4. If any subtask failed: search for known fixes via `qmd vsearch "{error}" --json -n 5`

    5f. CONTEXT SAFETY NET

        Count BATCHES (not individual subtasks) for context budget:
        If > 5 batches completed this session OR context heavy:
          - Append state to loops/state.jsonl
          - Print: "Context boundary reached. Run: /run-loop --resume {task-id}"
          - STOP
```

**Parallel execution constraints:**

| Constraint | Enforced by |
|-----------|-------------|
| Max 5 concurrent sub-agents | Chunk splitting in step 5a |
| No nested run-loops | Each sub-agent runs /execute-task, not /run-loop |
| No shared file state between parallel agents | File overlap detection in step 4c via `scripts/file-overlap.sh` |
| No parallel file conflicts | Overlap detection splits conflicting tasks into sequential sub-batches (step 4c) |
| Batch ordering respects dependencies | Dependency graph from step 4b |
| Failed sub-agent does not block peers | Post-batch collection in step 5c |
| Parallel execution audit trail | `batch_id` in state.jsonl entries (step 5a, 5c) per schema in `loops/README.md` |

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
Batches: {batch_count} ({max_parallel_in_any_batch} max parallel)
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

- **ONE loop at a time** -- no nested run-loops. Sub-agents run /execute-task, never /run-loop.
- **Max 5 concurrent sub-agents** -- batches larger than 5 are chunked. Never exceed 5 parallel Task() calls.
- **Batch-parallel execution** -- independent subtasks within a batch run concurrently. Dependent subtasks wait for their batch.
- **Overlap-safe parallelism** -- before spawning, each batch is checked for file overlap via `scripts/file-overlap.sh`. Overlapping subtasks are serialized into sequential sub-batches. Logs indicate when serialization occurs.
- **All-in-one-message dispatch** -- all Task() calls for a chunk MUST be in the same message to enable parallel execution.
- **Wait for full batch** -- never start the next batch (or sub-batch) until ALL sub-agents in the current chunk have returned.
- **Sub-agent per subtask** -- each subtask runs in its own Task() sub-agent via `/execute-task`. The orchestrator NEVER executes skill phases directly.
- **Context discipline** -- the orchestrator stores ONLY task_id, status, and 1-sentence summary per subtask. No skill outputs, no handoff blobs, no file lists.
- **Fresh context per subtask** -- sub-agent context is freed when it returns.
- **Graceful failure** -- a failed sub-agent does NOT stop other sub-agents in the same batch. Failures are collected and reported after the batch completes.
- **Resume is first-class** -- `--resume` is how multi-session loops continue. Not a fallback -- the expected path for large loops.
- **Back pressure is mandatory** -- enforced inside `/execute-task`, not by the orchestrator.
- **Fail fast at batch boundary** -- surface failures to user after batch completes, not mid-batch.
- **Beads is the source of truth** -- tasks and state come from `bd`, not files.
- **Sub-agents must NOT use EnterPlanMode** -- /execute-task is the planning pipeline.
- **Work mode: main or worktree only** -- NEVER create feature branches. Always ask the user which mode before starting.
- **If worktree: ask merge or PR on completion** -- never assume one or the other.
- **Zero accumulation** -- receives only structured JSON back from sub-agents. Discards everything else.
- **Reanchor between batches** -- rebuild dependency graph and re-run overlap detection after each batch (closed tasks may unlock new paths and change file scopes).
- **batch_id tracks concurrency** -- every batch generates a `batch_id` (`{task-id}-b{N}-{epoch}`). All sub-agents in the batch include this `batch_id` in their state.jsonl entries. Entries sharing a `batch_id` ran concurrently.

## Integration

- `/create-task` creates task + subtasks under a project epic -> `/run-loop {task-id}` executes the subtasks
- `/execute-task {subtask-id}` runs single subtask (standalone or as sub-agent)
- `/run-loop --resume` continues from next open subtask with fresh context
