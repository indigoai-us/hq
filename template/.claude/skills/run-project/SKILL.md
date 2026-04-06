---
name: run-project
description: Run a multi-story project through sequential inline execution (Ralph loop). Stories execute one at a time via $execute-task — no process isolation, no parallel dispatch.
allowed-tools: Read, Write, Edit, Grep, Bash(qmd:*), Bash(grep:*), Bash(ls:*), Bash(git:*), Bash(cat:*), Bash(which:*), Bash(wc:*), Bash(mkdir:*), Bash(echo:*), Bash(curl:*), Bash(python3:*), Bash(kill:*), Bash(cd:*), Bash(jq:*), Bash(bun:*), Bash(npm:*), Bash(scripts/*:*)
argument-hint: "{project} [--status] [--resume] [--dry-run]"
---

# Run Project - Sequential Project Orchestrator

Execute all stories in a PRD sequentially through the Ralph loop. Each story delegates to `$execute-task` inline.

> **CRITICAL: Context Budget Warning**
>
> This is the most context-intensive skill in the HQ system. Each story executes inline via `$execute-task`, which itself loads worker configs, knowledge, policies, and runs multi-phase pipelines — all within your single context window.
>
> **Hard limits to understand:**
> - A 3-story project with `api_development` tasks (~3 phases each) will consume roughly 40-60% of available context
> - A 5-story `full_stack` project (~6 phases each) will almost certainly exceed context limits
> - There is NO context reclamation between stories — everything accumulates
> - Context overflow means lost work if you haven't checkpointed
>
> **Mandatory for projects with >5 stories:**
> Run `$handoff` after completing each story. The next session resumes from where you left off — state.json and prd.json track progress. This is slower but guarantees completion.
>
> **Recommended for all projects:**
> Commit after every story. Write auto-checkpoints. Monitor your context usage. When in doubt, handoff early.

**Usage:**
```
run-project {project}
run-project {project} --status
run-project {project} --resume
run-project {project} --dry-run
```

**User's input:** $ARGUMENTS

---

## Ralph Principle

"Pick a task, complete it, commit it."

- Sequential execution — one story at a time
- Each story delegates to `$execute-task` inline
- Back pressure (typecheck, lint, test) keeps code on rails
- State files track progress for resumption across sessions
- Handoffs between stories preserve context for large projects

---

## Step 1 — Parse Arguments

Extract from `$ARGUMENTS`:
- `project` — the project name (required unless `--status`)
- `--status` — show project status and exit
- `--resume` — explicitly resume from next incomplete story (auto-detected by default)
- `--dry-run` — show execution plan without running anything

If no arguments:
```
Usage: run-project {project} [--status] [--resume] [--dry-run]

Example: run-project campaign-migration
         run-project campaign-migration --dry-run
         run-project --status
```
Stop here.

### Handle --status (no project required)

If `$ARGUMENTS` contains `--status`:

1. List all directories under `workspace/orchestrator/`:
   ```bash
   ls -d workspace/orchestrator/*/state.json 2>/dev/null
   ```
2. For each state.json found, read and extract: project name, status, progress counts, last updated
3. Display:
   ```
   Project Status:

     campaign-migration   completed   4/4 stories   2026-03-08
     order-system         in_progress 2/6 stories   2026-03-09
     landing-page         not_started 0/3 stories   —
   ```
4. Stop here.

---

## Step 2 — Validate PRD + Display Summary

### 2a. Find prd.json

Use `qmd search` to discover the PRD file (never Glob for prd.json):

```bash
qmd search "{project} prd.json" --json -n 5
```

From results, find the entry whose path includes `/{project}/prd.json`. Extract the file path.

If qmd is unavailable, try direct Read at these paths in order:
1. `companies/{co}/projects/{project}/prd.json` (company projects)
2. `projects/{project}/prd.json` (personal/HQ projects)

If no prd.json found:
```
ERROR: prd.json not found for {project}. Run /prd {project} first.
```
Stop.

### 2b. Read and Validate prd.json

Read the prd.json file. Validate structure:

1. **userStories array required**: If `userStories` is missing or not an array:
   ```
   ERROR: prd.json missing userStories array. Key must be "userStories" (not "stories" or "features").
   ```
   Stop.

2. **Validate required fields per story**: Each story must have `id`, `title`, `description`, `passes`. Report missing fields.

3. **Extract metadata**:
   - `company` — active company slug
   - `repoPath` — target repo path
   - `linearCredentials` — path to Linear credentials (if configured)
   - `linearProjectId` — Linear project ID (if configured)
   - `qualityGates` — custom quality gate commands (if configured)
   - `baseBranch` — base git branch (default: `main`)

### 2c. Display Project Summary

```
Project: {project}
Company: {company}
Repo: {repoPath}

Stories: {total} total | {completed} complete | {remaining} remaining
```

List each story with status:
```
  [done] US-001: Set up database schema
  [done] US-002: Create API endpoints
  [    ] US-003: Build frontend UI        (depends on: US-002)
  [    ] US-004: Add authentication        (depends on: US-001, US-002)
  [    ] US-005: Write integration tests   (depends on: US-003, US-004)
```

If all stories have `passes: true`:
```
All stories complete. Nothing to execute.
```
Stop.

### 2d. Context Budget Assessment

Count remaining stories. Display warning based on count:

| Remaining | Warning Level |
|-----------|---------------|
| 1-3 | None — safe for single session |
| 4-5 | CAUTION: May exhaust context. Commit after each story. Consider `$handoff` if context runs low. |
| 6-10 | WARNING: Will almost certainly exceed context. MUST `$handoff` after each story. |
| 11+ | CRITICAL: Run one story, then `$handoff`. Multi-session execution required. |

Display the appropriate warning before proceeding.

---

## Step 3 — Handle --dry-run

If `--dry-run` was specified:

1. Compute story execution order (Step 5 logic — deps + priority + array order)
2. For each story in order, classify task type and determine worker sequence (same as `$execute-task` steps 3-4)
3. Display the full plan:

```
Dry Run: {project} — Execution Plan

1. {story-id}: {title}
   Type: api_development
   Workers: product-planner → backend-dev → code-reviewer
   Depends on: (none)

2. {story-id}: {title}
   Type: ui_component
   Workers: frontend-dev → motion-designer → code-reviewer
   Depends on: US-001

Regression gates: after stories 3, 6, 9...
Quality gates: {qualityGates from metadata}

Estimated context cost: HIGH (6 stories × ~3 phases each)
Recommendation: Use $handoff after each story
```

Stop here — do not execute.

---

## Step 4 — Load Policies

Load policies from all applicable directories:

1. **Company policies**: Determine active company from `prd.metadata.company` or path. Read all files in `companies/{co}/policies/` (skip `example-policy.md`).
2. **Repo policies**: If `metadata.repoPath` is set, check `{repoPath}/.claude/policies/` if it exists.
3. **Global policies**: Read `.claude/policies/` — filter by `trigger` field relevance to "task execution", "deployment", "commit".

Note:
- **Hard enforcement** policies are absolute constraints during execution
- **Soft enforcement** policies allow deviation with logging

Display: `Loaded {N} policies ({H} hard, {S} soft)`

---

## Step 5 — Initialize Project State

### 5a. Create orchestrator directory

```bash
mkdir -p workspace/orchestrator/{project}/executions
```

### 5b. Read or Create state.json

Read `workspace/orchestrator/{project}/state.json` if it exists. If not, create initial state:

```json
{
  "project": "{project}",
  "prd_path": "{prd_path}",
  "status": "in_progress",
  "started_at": "{ISO8601}",
  "updated_at": "{ISO8601}",
  "progress": {
    "total": {N},
    "completed": {count of passes:true},
    "failed": 0,
    "in_progress": 0
  },
  "current_tasks": [],
  "completed_tasks": [],
  "failed_tasks": [],
  "retry_queue": [],
  "regression_gates": [],
  "orchestrator": "codex-inline"
}
```

If state.json already exists with `status: "in_progress"` or `status: "paused"`, this is a resume. Log:
```
Resuming {project} from story {N+1}/{total}
```

### 5c. Initialize progress.txt

If `workspace/orchestrator/{project}/progress.txt` does not exist, create it:

```
{project}: 0/{total} complete
Started: {ISO8601}
```

### 5d. Audit: Project Started

```bash
scripts/audit-log.sh append \
  --event project_started \
  --project {project} \
  --company {company} \
  --action "Project execution started: {total} stories, {remaining} remaining" || true
```

---

## Step 5.5 — Linear Project Sync (Best-Effort)

If prd metadata has `linearProjectId` and `linearCredentials`:

1. **Cross-company guard**: Verify the `linearCredentials` path matches the active company per `companies/manifest.yaml`. If mismatch, ABORT Linear sync and warn.

2. **Read API key**:
   ```bash
   LINEAR_KEY=$(cat {prd.metadata.linearCredentials} | python3 -c "import sys,json; print(json.load(sys.stdin)['apiKey'])")
   ```

3. **Set project to Started** (if first run, not resume):
   ```bash
   curl -s -X POST https://api.linear.app/graphql \
     -H "Content-Type: application/json" \
     -H "Authorization: $LINEAR_KEY" \
     -d '{"query": "mutation { projectUpdate(id: \"'$PROJECT_ID'\", input: { state: \"started\" }) { success } }"}'
   ```

Skip silently if no `linearProjectId` or no credentials. Never block execution on Linear sync failure.

---

## Step 6 — Compute Story Execution Order

Build the ordered list of stories to execute:

### 6a. Filter Incomplete Stories

From prd.json `userStories`, select all stories where `passes` is not `true`.

### 6b. Topological Sort by Dependencies

For each story with `dependsOn`, verify all dependencies have `passes: true`. Stories with unresolved dependencies are deferred until their deps complete.

Sort order: **deps resolved → lowest priority value → array order**

1. Stories with no dependencies (or all deps satisfied) come first
2. Among those, sort by `priority` field (lowest number = highest priority)
3. Among same priority, preserve prd.json array order

### 6c. Detect Blocked Stories

If any story has dependencies that are themselves incomplete AND also have unresolvable dependencies (circular), report:
```
ERROR: Circular dependency detected: {story-id} → {dep-id} → ... → {story-id}
```
Stop.

### 6d. Display Execution Order

```
Execution Order:
  1. US-001: Set up database schema (priority 1, no deps)
  2. US-002: Create API endpoints (priority 2, deps: US-001)
  3. US-003: Build frontend UI (priority 2, deps: US-002)
  4. US-004: Add authentication (priority 3, deps: US-001, US-002)

Regression gates at: story 3, story 6, ...
```

---

## Step 7 — Sequential Story Execution (Ralph Loop)

For each story in the computed execution order:

### 7a. Pre-Story Check

1. **Re-read prd.json** — a previous story's execution may have modified it
2. **Verify story still incomplete** — skip if `passes: true` (another session may have completed it)
3. **Verify dependencies satisfied** — all `dependsOn` stories have `passes: true`
4. **Check file lock conflicts** — if story has `files` array, check `{repoPath}/.file-locks.json` for conflicts. Skip story if hard-blocked; log warning if soft-blocked.

### 7b. Announce Story

```
════════════════════════════════════════════════
[{N}/{total}] Story: {story.id} - {story.title}
════════════════════════════════════════════════

Description: {story.description}

Acceptance Criteria:
  - {criterion 1}
  - {criterion 2}
  - {criterion 3}
```

### 7c. Update State — Story Started

Update `workspace/orchestrator/{project}/state.json`:
- Set `progress.in_progress` to 1
- Add story to `current_tasks` array:
  ```json
  {
    "id": "{story.id}",
    "started_at": "{ISO8601}",
    "status": "in_progress"
  }
  ```
- Update `updated_at`

### 7d. Delegate to $execute-task

Execute the story by invoking `$execute-task` inline:

**Invoke:** `execute-task {project}/{story.id}`

This delegates the full worker pipeline:
- Task classification
- Worker sequence selection
- Per-worker inline execution
- Back-pressure checks (typecheck, lint, test)
- PRD update (`passes: true`)
- Execution state tracking
- Linear sync (in progress → done)
- File lock management

> **Orchestrator mode directive:** When invoking `$execute-task` from this orchestrator context, the execute-task skill handles everything end-to-end including setting `passes: true`. The orchestrator verifies the result after execution.

### 7e. Verify Story Completion

After `$execute-task` returns:

1. **Re-read prd.json** — check if `passes: true` was set on the story
2. **Check git state**:
   ```bash
   git status --short
   ```
   If there are uncommitted changes, commit them:
   ```bash
   git add -A && git commit -m "Auto-commit: {story.id} - {story.title}"
   ```

3. **Parse result**: Determine success or failure from execute-task output

### 7f. Update State — Story Completed/Failed

**On success:**
- Move story from `current_tasks` to `completed_tasks`
- Increment `progress.completed`
- Set `progress.in_progress` to 0
- Update `updated_at`

**On failure:**
- Move story from `current_tasks` to `failed_tasks` with error details
- Increment `progress.failed`
- Set `progress.in_progress` to 0
- Add to `retry_queue` (for end-of-run retry pass)
- Update `updated_at`

### 7g. Update progress.txt

Append to `workspace/orchestrator/{project}/progress.txt`:

```
[pass] {story.id}: {story.title} — completed {ISO8601}
```
or
```
[FAIL] {story.id}: {story.title} — failed at phase {N} ({worker}): {error}
```

### 7h. Auto-Checkpoint After Story

Write a thread checkpoint:

```json
{
  "thread_id": "T-{YYYYMMDD}-{HHMMSS}-auto-{project}-{story.id}",
  "version": 1,
  "type": "auto-checkpoint",
  "created_at": "{ISO8601}",
  "updated_at": "{ISO8601}",
  "workspace_root": "$HQ_ROOT",
  "cwd": "{current working directory}",
  "git": {
    "branch": "{current branch}",
    "current_commit": "{short hash}",
    "dirty": false
  },
  "conversation_summary": "Completed {story.id} ({story.title}) in {project}. Progress: {completed}/{total}.",
  "files_touched": ["{files from execute-task output}"],
  "metadata": {
    "title": "Auto: run-project {project} [{N}/{total}]",
    "tags": ["auto-checkpoint", "run-project", "{project}", "{story.id}"],
    "trigger": "worker-completion"
  }
}
```

Write to: `workspace/threads/{thread_id}.json`

### 7i. Context Budget Check

After each story completes, assess context usage:

- If this is a project with >5 total stories: recommend `$handoff`
  ```
  Context check: {completed}/{total} stories done. This project has >5 stories.
  RECOMMENDED: Run $handoff now and resume in a fresh session.
  State is saved — the next session will pick up from story {next_id}.
  ```

- If context appears to be running low (many long outputs from execute-task):
  ```
  Context budget warning: Running low on context after {N} stories.
  Run $handoff to continue in a fresh session. Progress is saved.
  ```

### 7j. Regression Gates

Every 3 completed stories, run quality gates:

1. Check if `progress.completed % 3 === 0` (and `progress.completed > 0`)
2. If yes, run each command in `metadata.qualityGates`:
   ```bash
   cd {repoPath} && {gate_command}
   ```
3. Record results in state.json `regression_gates` array:
   ```json
   {
     "after_story": "{story.id}",
     "story_count": {N},
     "gates": [
       {"command": "bun test", "result": "pass"},
       {"command": "bun check", "result": "pass"},
       {"command": "bun lint", "result": "fail", "error": "..."}
     ],
     "timestamp": "{ISO8601}"
   }
   ```

**On regression gate failure:**
```
REGRESSION GATE FAILED after story {story.id}

  bun test:  pass
  bun check: FAIL — 3 TypeScript errors
  bun lint:  pass

Options:
  1. Fix the issue and continue (you're in the session)
  2. Skip and continue (risk accumulating regressions)
  3. Stop execution — run $handoff to preserve state
```

Do NOT auto-skip. Surface the failure and let the context decide next steps.

### 7k. Repeat for Next Story

Return to Step 7a for the next story in the execution order.

---

## Step 8 — Retry Queue

After all stories in the execution order have been attempted:

If `retry_queue` is non-empty:
1. Log: `Retry pass: {N} failed stories to retry`
2. For each story in `retry_queue`:
   - Reset story status
   - Re-attempt via `$execute-task`
   - On success: move to `completed_tasks`, update PRD
   - On second failure: leave in `failed_tasks`, report as permanent failure

---

## Step 9 — Completion Flow

When all stories have `passes: true` (or all remaining are permanently failed):

### 9a. Linear Project Sync (Best-Effort)

If `linearProjectId` is configured:
- Set project to "completed" state
- Comment: "Project completed by HQ. {completed}/{total} stories passed."

### 9b. Summary Report

Generate `workspace/reports/{project}-summary.md`:

```markdown
# {project} — Execution Summary

**Status:** {completed|partial}
**Started:** {started_at}
**Completed:** {ISO8601}
**Duration:** {elapsed}

## Stories

| ID | Title | Result | Phases | Workers |
|----|-------|--------|--------|---------|
| US-001 | Set up schema | pass | 4 | architect, database-dev, code-reviewer |
| US-002 | Create API | pass | 3 | backend-dev, code-reviewer |

## Regression Gates

| After Story | Result | Details |
|-------------|--------|---------|
| US-003 | pass | All 3 gates passed |

## Metrics

- Total phases executed: {N}
- Total workers used: {N} unique
- Back-pressure failures: {N} (all recovered)
- Retry queue: {N} stories retried
```

### 9c. Update Final State

Write `workspace/orchestrator/{project}/state.json`:

```json
{
  "project": "{project}",
  "prd_path": "{prd_path}",
  "status": "completed",
  "started_at": "{original_start}",
  "updated_at": "{ISO8601}",
  "completed_at": "{ISO8601}",
  "progress": {
    "total": {N},
    "completed": {N},
    "failed": {N},
    "in_progress": 0
  },
  "current_tasks": [],
  "completed_tasks": ["{list}"],
  "failed_tasks": ["{list}"],
  "retry_queue": [],
  "regression_gates": ["{list}"],
  "orchestrator": "codex-inline"
}
```

### 9d. Final progress.txt Update

Append to `workspace/orchestrator/{project}/progress.txt`:

```
────────────────────────────────
{project}: {completed}/{total} complete
Completed: {ISO8601}
Duration: {elapsed}
Regression gates: {passed}/{total_gates} passed
────────────────────────────────
```

### 9e. Capture Learnings

If the project encountered notable patterns (regression failures, retry successes, dependency issues), capture via `$learn`:

```json
{
  "project": "{project}",
  "source": "project-completion",
  "severity": "medium",
  "scope": "auto",
  "stories_completed": {N},
  "stories_failed": {N},
  "regression_failures": ["{details}"],
  "patterns_discovered": ["{insights}"]
}
```

Skip if project completed cleanly with no notable events.

### 9f. Reindex

```bash
qmd update 2>/dev/null || true
```

### 9g. Audit: Project Completed

```bash
scripts/audit-log.sh append \
  --event project_completed \
  --project {project} \
  --company {company} \
  --action "Project completed: {completed}/{total} stories, {elapsed} elapsed" \
  --result {success|partial} || true
```

### 9h. Report Completion

```
Project Complete: {project}

Stories: {completed}/{total} passed
Failed: {failed_count} (see retry queue)
Duration: {elapsed}
Regression gates: {passed}/{total_gates} passed

Report: workspace/reports/{project}-summary.md
State:  workspace/orchestrator/{project}/state.json

Next steps:
  - Review report for any noted issues
  - Run /run-project --status to see all projects
```

---

## Step 10 — Handle Project-Level Failures

If execution must stop before all stories complete:

### 10a. Save State

Write current state to state.json with `status: "paused"`:

```json
{
  "status": "paused",
  "paused_at": "{ISO8601}",
  "pause_reason": "{reason}",
  "next_story": "{story.id}"
}
```

### 10b. Update progress.txt

```
PAUSED: {reason}
Next story: {next_story_id}
Resume: run-project {project} --resume
```

### 10c. Report Pause

```
Project Paused: {project}

Completed: {N}/{total} stories
Reason: {pause_reason}
Next story: {next_story_id}

Resume: run-project {project} --resume
```

---

## Step 11 — Auto-Checkpoint (Project Level)

After project completion (or pause), write a project-level checkpoint:

```json
{
  "thread_id": "T-{YYYYMMDD}-{HHMMSS}-auto-{project}-complete",
  "version": 1,
  "type": "auto-checkpoint",
  "created_at": "{ISO8601}",
  "updated_at": "{ISO8601}",
  "workspace_root": "$HQ_ROOT",
  "cwd": "{current working directory}",
  "git": {
    "branch": "{current branch}",
    "current_commit": "{short hash}",
    "dirty": false
  },
  "conversation_summary": "Project {project}: {completed}/{total} stories completed. Status: {status}.",
  "files_touched": [
    "workspace/orchestrator/{project}/state.json",
    "workspace/orchestrator/{project}/progress.txt",
    "workspace/reports/{project}-summary.md"
  ],
  "metadata": {
    "title": "Auto: run-project {project} complete",
    "tags": ["auto-checkpoint", "run-project", "{project}"],
    "trigger": "worker-completion"
  }
}
```

Write to: `workspace/threads/{thread_id}.json`

---

## Examples

```
run-project campaign-migration           # Execute all stories sequentially
run-project campaign-migration --resume  # Resume from next incomplete story
run-project campaign-migration --dry-run # Show execution plan without running
run-project --status                     # Show all project statuses
run-project order-system                 # Execute another project
```

### Worked Example: 4-Story Project

```
> run-project campaign-migration

Project: campaign-migration
Company: {company}
Repo: repos/private/{product}

Stories: 4 total | 0 complete | 4 remaining
  [    ] CM-001: Set up campaign database tables (priority 1)
  [    ] CM-002: Migrate campaign A data (depends on: CM-001)
  [    ] CM-003: Migrate campaign B data (depends on: CM-001)
  [    ] CM-004: Verify all campaigns migrated (depends on: CM-002, CM-003)

Context budget: OK (4 stories — safe for single session)
Loaded 5 policies (3 hard, 2 soft)

Execution Order:
  1. CM-001 (priority 1, no deps)
  2. CM-002 (priority 2, deps: CM-001)
  3. CM-003 (priority 2, deps: CM-001)
  4. CM-004 (priority 3, deps: CM-002, CM-003)

════════════════════════════════════════════════
[1/4] Story: CM-001 - Set up campaign database tables
════════════════════════════════════════════════
→ Delegating to $execute-task campaign-migration/CM-001
  ... (execute-task runs full worker pipeline) ...
→ Result: PASS (4 phases, 3 files touched)
→ Checkpoint saved

════════════════════════════════════════════════
[2/4] Story: CM-002 - Migrate campaign A data
════════════════════════════════════════════════
→ Delegating to $execute-task campaign-migration/CM-002
  ... (execute-task runs full worker pipeline) ...
→ Result: PASS (3 phases, 2 files touched)
→ Checkpoint saved

════════════════════════════════════════════════
[3/4] Story: CM-003 - Migrate campaign B data
════════════════════════════════════════════════
→ Delegating to $execute-task campaign-migration/CM-003
  ... (execute-task runs full worker pipeline) ...
→ Result: PASS (3 phases, 2 files touched)
→ Checkpoint saved

>>> REGRESSION GATE (after 3 stories)
  bun test:  pass
  bun check: pass
  bun lint:  pass
All gates passed.

════════════════════════════════════════════════
[4/4] Story: CM-004 - Verify all campaigns migrated
════════════════════════════════════════════════
→ Delegating to $execute-task campaign-migration/CM-004
  ... (execute-task runs full worker pipeline) ...
→ Result: PASS (2 phases, 1 file touched)
→ Checkpoint saved

Project Complete: campaign-migration
Stories: 4/4 passed | Duration: 2h 15m
Regression gates: 1/1 passed
Report: workspace/reports/campaign-migration-summary.md
```

---

## Notes

- **No process isolation** — unlike Claude Code's `run-project.sh` which spawns `claude -p` per story, this skill executes everything inline. Each story's full worker pipeline runs in your context window.
- **No parallel dispatch** — Claude Code supports `--swarm` for parallel story execution via worktrees. This skill is sequential only. Stories with independent deps still run one at a time.
- **No background process** — Claude Code launches `run-project.sh` as a background OS process and polls state files. This skill runs synchronously in-session.
- **No tmux mode** — no `--tmux` flag. Everything is visible in the current session.
- **State.json compatibility** — the state.json format matches Claude Code's format exactly. A project started in Claude Code can be resumed in Codex and vice versa (the `orchestrator` field distinguishes them).
- **PRD discovery** — always use `qmd search` first. Never Glob for `prd.json`.
- **Worker path lookup** — always read `workers/registry.yaml` first. Never Glob for `worker.yaml`.
- **Linear sync** — best-effort at both project and story level. Never blocks execution.
- **Regression gates** — run every 3 completed stories using `metadata.qualityGates` from prd.json. Failures surface inline for decision.
- **Context is the bottleneck** — this is the fundamental constraint. Claude Code uses process isolation to give each story a fresh context window. Here, everything accumulates. For large projects, `$handoff` after each story is not a suggestion — it's a requirement.
- **Resume is first-class** — state.json and prd.json together capture full progress. Running `run-project {project}` on a partially-completed project automatically resumes from the next incomplete story.
- **Commit discipline** — the orchestrator verifies git state after each story and auto-commits if `$execute-task` left uncommitted work. Never lose work to context overflow.
- **Audit trail** — every project start, story completion, and project completion is logged to `workspace/metrics/audit-log.jsonl` via `scripts/audit-log.sh`.
