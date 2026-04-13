---
name: execute-task
description: Execute a single PRD story through coordinated inline worker phases (Ralph pattern). Workers run sequentially in current context — no sub-agent isolation.
allowed-tools: Read, Write, Edit, Grep, Bash(qmd:*), Bash(grep:*), Bash(ls:*), Bash(git:*), Bash(cat:*), Bash(which:*), Bash(wc:*), Bash(mkdir:*), Bash(echo:*), Bash(curl:*), Bash(python3:*), Bash(kill:*), Bash(cd:*), Bash(bun:*), Bash(npm:*), Bash(scripts/*:*)
argument-hint: "{project}/{task-id}"
---

# Execute Task - Worker-Coordinated Story Execution

Execute a single user story from a PRD through coordinated worker phases. Each worker handles their domain, passes context to the next.

> **Warning: Codex Adaptation Note — No Context Isolation**
>
> In Claude Code, `/execute-task` spawns an isolated Task sub-agent per worker phase. Worker context lives in a separate context window.
>
> In Codex, workers execute **inline** in the current context window. This means:
> - All worker instructions, knowledge, and policies load into **your** active context
> - Multi-phase pipelines (4-7 workers) will consume significant context budget
> - For large tasks (full_stack with 6+ phases), consider using `$handoff` between phases
> - Each phase's output stays visible — no context reclamation between workers
> - Keep worker knowledge loading minimal (skill-relevant files only)

**Usage:**
```
execute-task {project}/{task-id}
```

**User's input:** $ARGUMENTS

---

## Ralph Principle

"Pick a task, complete it, commit it."

- Fresh context per task
- Workers execute inline sequentially
- Back pressure (typecheck, lint, test) keeps code on rails
- Handoff context passed between worker phases

---

## Step 1 — Parse Arguments

Extract `{project}` and `{task-id}` from `$ARGUMENTS`.

Split on `/`: first token is `project`, second is `task-id`.

If no arguments or missing parts:
```
Usage: execute-task {project}/{task-id}

Example: execute-task campaign-migration/US-003
```
Stop here.

---

## Step 2 — Load Task Spec

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
   ERROR: prd.json missing userStories array. Migrate legacy 'features' key to 'userStories'.
   ```
   Stop.

2. **Validate required fields per story**: Each story must have `id`, `title`, `description`, `passes`. Report missing fields and stop.

3. **Find the target story**: Match `task-id` against `story.id`. If not found:
   ```
   Task {task-id} not found in {project} prd.json.
   ```
   Stop.

4. **Check completion**: If `story.passes === true`:
   ```
   Task {task-id} already complete (passes: true). Skipping.
   ```
   Stop.

5. **Check dependencies**: If the story has `dependsOn`, verify each dependency story has `passes: true`. If any dependency is incomplete:
   ```
   Task {task-id} blocked: depends on {dep-id} which is not yet complete.
   ```
   Stop.

Extract from the matched story:
- `id`, `title`, `description`
- `acceptance_criteria` (or `acceptanceCriteria`)
- `files` (if specified — for file locking)
- `dependsOn` (already checked)
- `e2eTests` (if specified — for acceptance test phase)
- `worker_hints` (if specified — for optional worker inclusion)
- `model_hint` (if specified — overrides worker model)
- `linearIssueId` (if specified — for Linear sync)

Record metadata from `prd.metadata`:
- `company` — active company slug
- `repoPath` — target repo path
- `linearCredentials` — path to Linear credentials (if configured)
- `linearInProgressStateId`, `linearDoneStateId` — Linear state IDs
- `qualityGates` — custom quality gate commands (if configured)
- `docsPath` — documentation location (if configured)

### 2c. Check Story Checkout State

Guard against concurrent execution of the same story.

1. Read `workspace/orchestrator/{project}/state.json` (if it exists)
2. If `current_tasks` array contains an entry with `id` matching this story AND `checkedOutBy` is not null:
   - Check if the PID is alive: `kill -0 {pid} 2>/dev/null`
   - **PID alive**: Display warning and pause:
     ```
     WARNING: Story {task-id} is currently checked out by PID {pid} (started: {startedAt}).
     Another execution may be running. Proceeding will override.
     ```
     Continue after warning (no interactive prompt in Codex).
   - **PID dead**: Release the stale checkout — set `checkedOutBy: null`, update `updated_at`. Log: "Released stale checkout for {task-id} (dead PID {pid})."
3. If no conflict, proceed normally.

---

## Step 3 — Classify Task Type

Analyze the story's title, description, and acceptance criteria. Match against patterns:

| Type | Indicators |
|------|------------|
| `schema_change` | database, migration, schema, table, column, prisma, SQL |
| `api_development` | endpoint, API, REST, GraphQL, route, service |
| `ui_component` | component, page, form, button, React, UI, responsive |
| `full_stack` | Combination of backend + frontend indicators |
| `enhancement` | animation, polish, refactor, optimization, UX |
| `content` | copy, content, documentation, marketing text |

Report classification:
```
Task: {task.id} - {task.title}
Type: {type} (matched: {indicators})
```

---

## Step 4 — Select Worker Sequence

Based on task type, determine the inline worker sequence:

```yaml
schema_change:
  - product-planner    # skip if detailed acceptance criteria exist
  - database-dev
  - backend-dev
  - code-reviewer

api_development:
  - product-planner    # skip if detailed acceptance criteria exist
  - backend-dev
  - code-reviewer

ui_component:
  - product-planner    # skip if detailed acceptance criteria exist
  - frontend-dev
  - motion-designer
  - code-reviewer

full_stack:
  - product-planner
  - architect
  - database-dev
  - backend-dev
  - frontend-dev
  - code-reviewer

enhancement:
  - (relevant dev based on files — frontend-dev or backend-dev)
  - code-reviewer

content:
  - content-brand
  - content-product
```

**Rules for sequence construction:**
- **Skip product-planner** if the story already has detailed acceptance criteria
- **Skip codex-reviewer and codex-debugger** — these are Codex native workers, not HQ workers
- **Skip dev-qa-tester** — inline execution means the implementing worker already tests
- **Skip acceptance-test-writer** if `e2eTests` is empty or absent
- **Add acceptance-test-writer** before code-reviewer if `e2eTests` is non-empty

**Worker phase descriptions** (for execution plan display):

| Worker | Phase Description |
|--------|-------------------|
| product-planner | Clarify spec and acceptance criteria |
| architect | Design system architecture |
| database-dev | Implement schema and migrations |
| backend-dev | Implement backend service |
| frontend-dev | Implement frontend UI |
| motion-designer | Add animations and motion |
| code-reviewer | Review changes and verify quality |
| acceptance-test-writer | Write story-level acceptance tests from e2eTests |
| content-brand | Brand-aligned content creation |
| content-product | Product content and documentation |

Present execution plan:
```
Execution Plan for {task.id}:

Phase 1: {worker} -> {phase description}
Phase 2: {worker} -> {phase description}
Phase 3: {worker} -> {phase description}

Phases: {N} | Type: {type}
Proceed? [Y/n]
```

> **Context budget warning:** For full_stack tasks (5-6 phases), this pipeline will consume substantial context. Consider `$handoff` between phases if context is running low.

---

## Step 5 — Initialize Execution State

### 5a. Create execution tracking directory and file

```bash
mkdir -p workspace/orchestrator/{project}/executions
```

Write to `workspace/orchestrator/{project}/executions/{task-id}.json`:
```json
{
  "task_id": "{task.id}",
  "project": "{project}",
  "started_at": "{ISO8601}",
  "status": "in_progress",
  "current_phase": 1,
  "phases": [
    {"worker": "{worker1}", "status": "pending"},
    {"worker": "{worker2}", "status": "pending"}
  ],
  "handoffs": []
}
```

### 5a.5 Acquire Story Checkout

Write a checkout entry into orchestrator state to prevent concurrent execution:

1. Read `workspace/orchestrator/{project}/state.json` (create with minimal structure if missing)
2. Set `current_tasks` entry for this story:
   ```json
   {
     "id": "{task.id}",
     "started_at": "{ISO8601}",
     "checkedOutBy": {
       "pid": {current PID from echo $$},
       "startedAt": "{ISO8601}",
       "sessionId": "{started_at}"
     }
   }
   ```
3. Write state.json back with updated `updated_at`

Report: `Checkout acquired for {task.id} (PID: {pid})`

### 5b. Audit: Task Started

```bash
scripts/audit-log.sh append \
  --event task_started \
  --project {project} \
  --story-id {task.id} \
  --company {company} \
  --session-id {started_at} \
  --action "Task execution started: {task.title}" || true
```

---

## Step 5.5 — Acquire File Locks

If the story has a non-empty `files` array and the prd metadata has `repoPath`:

1. **Load config**: Read `settings/orchestrator.yaml` -> `file_locking`
2. **Skip if disabled**: If `file_locking.enabled: false`, skip this step
3. **Read existing locks**: Read `{repoPath}/.file-locks.json` (create if missing: `{"version":1,"locks":[]}`)
4. **Stale lock cleanup**: For each existing lock, check if owner PID is running:
   ```bash
   kill -0 {pid} 2>/dev/null
   ```
   If not running AND lock is older than `stale_lock_timeout_minutes`, remove it
5. **Conflict check**: For each file in `task.files`, check if already locked by another story:
   - **Self-owned lock**: If already locked by same story ID, skip it
   - **Conflict with different story**: Apply `conflict_mode` from config:
     - `hard_block`: STOP — report conflicting files + owner story
     - `soft_block`: Log warning, proceed but instruct workers to skip locked files
     - `read_only_fallback`: Log warning, proceed with read-only constraint
6. **Acquire locks**: For each unlocked file, append to `.file-locks.json`:
   ```json
   {"file": "{path}", "owner": {"project": "{project}", "story": "{task.id}", "pid": {$$}}, "acquired_at": "{ISO8601}"}
   ```
   (Get PID via `echo $$` in bash)
7. **Update state.json**: If `workspace/orchestrator/{project}/state.json` exists, update the project's `checkedOutFiles` array

Report: `File locks acquired: {N} files for {task.id}`

---

## Step 5.5.5 — Sync Linear Issue to In Progress (Best-Effort)

If the story has `linearIssueId` and prd metadata has `linearCredentials`:

1. **Cross-company guard**: Verify the `linearCredentials` path matches the active company per `companies/manifest.yaml`. If it points to a different company's settings, ABORT Linear sync and warn.

2. **Read API key**:
   ```bash
   LINEAR_KEY=$(cat {prd.metadata.linearCredentials} | python3 -c "import sys,json; print(json.load(sys.stdin)['apiKey'])")
   ```

3. **Set issue to In Progress**:
   ```bash
   curl -s -X POST https://api.linear.app/graphql \
     -H "Content-Type: application/json" \
     -H "Authorization: $LINEAR_KEY" \
     -d '{"query": "mutation { issueUpdate(id: \"'$ISSUE_ID'\", input: { stateId: \"'$IN_PROGRESS_STATE'\" }) { success } }"}'
   ```

4. **Comment on issue**: "Started by HQ — task in progress."

Skip silently if no `linearIssueId` or no credentials configured. Never block execution on Linear sync failure.

---

## Step 5.6 — Load Applicable Policies

Load policies from all applicable directories:

1. **Company policies**: Determine active company from `prd.metadata.company` or path. Read all files in `companies/{co}/policies/` (skip `example-policy.md`).
2. **Repo policies**: If working in a repo, check `{repoPath}/.claude/policies/` if it exists.
3. **Global policies**: Read `.claude/policies/` — filter by `trigger` field relevance.

Note:
- **Hard enforcement** policies are absolute constraints during execution
- **Soft enforcement** policies allow deviation with logging

Include applicable policy rules in worker context (Step 6b).

---

## Step 6 — Execute Each Worker Phase (Inline)

> **Key difference from Claude Code:** No sub-agent spawning. Each worker executes inline in this context. You read the worker's instructions and follow them directly.

For each worker in the sequence:

### 6a. Load Worker Config

1. Read `workers/registry.yaml` to find the worker path:
   ```bash
   grep -A 4 "  - id: {worker-id}$" workers/registry.yaml | grep "path:"
   ```
   Extract the `path:` value.

2. Read `{worker_path}/worker.yaml` to get:
   - `instructions` — worker's role, process, and accumulated learnings
   - `context.base` — files the worker always needs
   - `skills.installed` — available skills
   - `verification.post_execute` — back-pressure commands

3. If the worker has a skill file relevant to the task, read `{worker_path}/skills/{relevant-skill}.md`.

### 6b. Build Worker Context

Assemble the following context mentally (do not output it — just internalize it):

```
Worker: {worker.name}
Task: {task.id} - {task.title}

Description: {task.description}
Acceptance Criteria: {task.acceptance_criteria}
Files to Focus On: {task.files or inferred}

Context from Previous Phase:
{handoff from previous worker, if any}

Codebase Exploration:
Use qmd vsearch for conceptual search. Use Grep for exact pattern matching.

Applicable Policies:
{policies from step 5.6}

Worker Instructions:
{worker.instructions from worker.yaml}

Back Pressure (run before completing):
{worker.verification.post_execute commands}
```

### 6c. Execute Worker Phase Inline

Follow the worker's instructions step by step:

1. **Understand the task** through the worker's lens (their role, their domain)
2. **Explore the codebase** if needed — use `qmd vsearch` for concepts, Grep for exact patterns
3. **Implement** — create/edit files as the worker's instructions direct
4. **Run back-pressure checks** from `worker.verification.post_execute`:
   - Typecheck (e.g. `bun check`, `tsc --noEmit`)
   - Lint (e.g. `bun lint`, `eslint .`)
   - Tests (e.g. `bun test`, `npm test`)
   - Build (if applicable)
5. **Collect output** — track what was done:
   ```json
   {
     "summary": "What this worker phase accomplished",
     "files_created": ["paths"],
     "files_modified": ["paths"],
     "key_decisions": ["decision and rationale"],
     "context_for_next": "Instructions for next worker",
     "back_pressure": {
       "tests": "pass|fail",
       "lint": "pass|fail",
       "typecheck": "pass|fail"
     },
     "issues": ["any blocking issues"]
   }
   ```

### 6c.5 Acceptance Test Writer Phase

If the sequence includes `acceptance-test-writer` (i.e. `e2eTests` is non-empty):

1. Read `task.e2eTests` from prd.json
2. Read existing story test files in `{repo}/__tests__/stories/` to understand patterns
3. Detect test framework from `package.json` (vitest/jest/bun:test)
4. Write tests to `{repo}/__tests__/stories/{task.id}.test.ts`:
   - One `describe("{task.id}: {task.title}")` block
   - One `it()`/`test()` per e2eTests entry
   - Import from actual implementation — no mocks unless necessary
   - Tests verify BEHAVIOR described in e2eTests, not implementation details
5. Run the new tests: `{test-runner} __tests__/stories/{task.id}.test.ts`
6. Run ALL existing story tests to verify no regressions: `{test-runner} __tests__/stories/`
7. All tests must pass before this phase completes

### 6d. Handle Back-Pressure Failures

If any back-pressure check fails after a worker phase:

1. **First attempt**: Re-read the error output, diagnose the root cause, fix inline
2. **Re-run the failed check** after the fix
3. If it passes, continue to the next phase
4. If it still fails after one retry, pause and report:
   ```
   Phase {N} ({worker}) back-pressure failed: {check}
   Error: {error output}

   Options:
   1. Fix manually and continue
   2. Skip this check and continue
   3. Abort execution
   ```

### 6d.5 Expand File Locks (Dynamic)

If file locking is enabled and the phase created/modified files not already locked:

1. Compute new files from phase output not in `.file-locks.json` for this story
2. Acquire locks for new files (same format as Step 5.5)
3. Update story's `files` array in prd.json with new paths

### 6e. Update Execution State

After each phase completes, update `workspace/orchestrator/{project}/executions/{task-id}.json`:

```json
{
  "phases": [
    {"worker": "{worker}", "status": "completed", "completed_at": "{ISO8601}"},
    {"worker": "{next-worker}", "status": "in_progress"}
  ],
  "handoffs": [
    {
      "from": "{completed-worker}",
      "to": "{next-worker}",
      "context": {
        "summary": "...",
        "files_created": [],
        "files_modified": [],
        "key_decisions": [],
        "context_for_next": "..."
      }
    }
  ]
}
```

### 6e.5 Audit: Phase Completed

```bash
scripts/audit-log.sh append \
  --event phase_completed \
  --project {project} \
  --story-id {task.id} \
  --worker {worker.id} \
  --result {success|fail} \
  --action "Phase {N} completed: {worker.id}" || true
```

### 6f. Log Model Usage

Append one line per phase to `workspace/metrics/model-usage.jsonl`:

```json
{"ts":"ISO8601","project":"{project}","task":"{task.id}","worker":"{worker.id}","model":"codex","phase":N,"company":"{company}"}
```

Create `workspace/metrics/` if it doesn't exist. This is append-only.

**Resolving `company`:** Use `prd.metadata.company` if present. Otherwise match the project path against `companies/manifest.yaml`.

### 6g. Repeat for Next Worker

Advance `current_phase` and repeat from 6a for the next worker in the sequence.

> **Context check:** If context is running low after a heavy phase (implementation workers), display a warning: "Context budget nearing limit. Consider $handoff to continue in a fresh session." The execution state file preserves progress for resumption.

---

## Step 7 — Complete Task

When all phases complete successfully:

### 7.0 Release File Locks

If file locking was enabled and locks were acquired in Step 5.5:

1. Read `{repoPath}/.file-locks.json`
2. Remove all entries where `owner.project === "{project}" && owner.story === "{task.id}"`
3. Write updated `.file-locks.json`
4. Update orchestrator state.json: remove matching entries from `checkedOutFiles`

Report: `File locks released for {task.id}`

This runs BEFORE PRD update so locks are released even if later steps fail.

### 7a. Update PRD

Determine invocation mode:

- **Standalone (interactive)**: Write `passes: true` directly on the story in prd.json
- **Invoked by orchestrator** (prompt contains "Do NOT write passes to prd.json"): Skip this write. The orchestrator reads execution output and writes passes itself.

Read prd.json, find the story by ID, set `passes: true`, write back.

### 7a.5 Sync Linear Issue to Done (Best-Effort)

If the story has `linearIssueId` and prd metadata has `linearCredentials`:

1. **Cross-company guard**: Same validation as Step 5.5.5
2. **Set issue to Done**:
   ```bash
   curl -s -X POST https://api.linear.app/graphql \
     -H "Content-Type: application/json" \
     -H "Authorization: $LINEAR_KEY" \
     -d '{"query": "mutation { issueUpdate(id: \"'$ISSUE_ID'\", input: { stateId: \"'$DONE_STATE'\" }) { success } }"}'
   ```
3. **Comment**: "Completed by HQ. Ready for review."

Skip silently on failure. Never block task completion on Linear sync.

### 7a.6 Comment on Linear Issue (if configured)

If prd.metadata has `linearReviewers`, include @mention in the completion comment. When task was blocked, comment with blocker context. Skip silently if not configured.

### 7b. Update Documentation

If the task introduced new features, changed behavior, or modified APIs:

1. Check `prd.metadata.docsPath` for documentation location
2. If not set, skip (do not prompt in Codex — no interactive questions)
3. Based on `files_modified`, `files_created`, and `key_decisions` from worker outputs:
   - New API endpoints -> update API docs
   - New UI pages/features -> update feature docs
   - Changed behavior -> update existing docs
4. Skip if task was a pure bug fix, refactor, or `docsPath` is "none"

### 7b.5 Capture Learnings

If the execution encountered back-pressure failures, retries, or notable patterns, capture them via `$learn`:

```json
{
  "task_id": "{task.id}",
  "project": "{project}",
  "source": "task-completion",
  "severity": "medium",
  "scope": "auto",
  "workers_used": ["list of workers that ran"],
  "back_pressure_failures": [{"worker": "...", "check": "...", "error": "..."}],
  "retries": N,
  "key_decisions": ["aggregated from worker outputs"],
  "issues_encountered": ["from worker outputs"],
  "patterns_discovered": ["success patterns worth preserving"]
}
```

`$learn` handles: policy file creation, event logging, dedup.

If task completed cleanly with no failures/retries/notable patterns, skip — not every task produces novel insights.

### 7b.6 Reindex

```bash
qmd update 2>/dev/null || true
```

Ensures any modified knowledge, worker instructions, or rules are immediately searchable.

### 7c.0 Audit: Task Completed

```bash
scripts/audit-log.sh append \
  --event task_completed \
  --project {project} \
  --story-id {task.id} \
  --company {company} \
  --session-id {started_at} \
  --files "{comma_separated_files_touched}" \
  --action "Task completed: {total_phases} phases, {files_touched_count} files" \
  --result success || true
```

### 7c. Report Completion

```
Task Complete: {task.id} - {task.title}

Phases: {N} completed
Workers: {list}
Files touched: {count}

Key decisions:
- {decision 1}
- {decision 2}

PRD updated: passes: true
```

### 7d. Structured Output for Orchestrator

When invoked as part of a project run, output this JSON so the orchestrator can parse results:

```json
{
  "task_id": "{task.id}",
  "status": "completed",
  "summary": "1-sentence summary of what was accomplished",
  "workers_used": ["{worker1}", "{worker2}"],
  "back_pressure": {
    "tests": "pass|fail|skipped",
    "lint": "pass|fail|skipped",
    "typecheck": "pass|fail|skipped",
    "build": "pass|fail|skipped"
  }
}
```

---

## Step 8 — Handle Failures

If any phase fails after retry:

### 8.0 Release Locks on Failure

Same as Step 7.0 — release all file locks for this story from both `.file-locks.json` and state.json. Never orphan locks on failure.

### 8.0.5 Audit: Task Failed

```bash
scripts/audit-log.sh append \
  --event task_failed \
  --project {project} \
  --story-id {task.id} \
  --company {company} \
  --session-id {started_at} \
  --worker {failed_worker} \
  --error "{error_message}" \
  --action "Task failed at phase {N}: {failed_worker}" \
  --result fail || true
```

### 8.1 Update Execution State

Write `status: "paused"` to the execution tracking file with error details.

### 8.2 Report Failure

```
Phase {N} ({worker}) failed: {error}

Options:
1. Fix manually and resume: execute-task {project}/{task-id}
2. Skip this worker and continue
3. Abort execution
```

When invoked as part of a project run, also output structured JSON on failure:

```json
{
  "task_id": "{task.id}",
  "status": "failed",
  "summary": "Phase {N} ({worker}) failed: {brief error}",
  "workers_used": ["{workers that ran}"],
  "back_pressure": {}
}
```

---

## Step 9 — Auto-Checkpoint

After task completion (or failure), write a thread checkpoint file:

```json
{
  "thread_id": "T-{YYYYMMDD}-{HHMMSS}-auto-{task-id}",
  "version": 1,
  "type": "auto-checkpoint",
  "created_at": "{ISO8601}",
  "updated_at": "{ISO8601}",
  "workspace_root": "$HQ_ROOT",
  "cwd": "{current working directory}",
  "git": {
    "branch": "{current branch from git branch --show-current}",
    "current_commit": "{short hash from git rev-parse --short HEAD}",
    "dirty": false
  },
  "conversation_summary": "Executed {task.id} ({task.title}): {1-sentence outcome}",
  "files_touched": ["{list of files created or modified across all phases}"],
  "metadata": {
    "title": "Auto: execute-task {project}/{task-id}",
    "tags": ["auto-checkpoint", "execute-task", "{project}", "{task-id}"],
    "trigger": "worker-completion"
  }
}
```

Write to: `workspace/threads/{thread_id}.json`

Get git state with:
```bash
git rev-parse --short HEAD 2>/dev/null
git branch --show-current 2>/dev/null
git status --short 2>/dev/null
```

---

## Handoff Context Format

Context passed between worker phases:

```json
{
  "from_worker": "backend-dev",
  "to_worker": "code-reviewer",
  "timestamp": "ISO8601",
  "summary": "1-2 sentence description",
  "files_created": ["src/services/foo.ts"],
  "files_modified": ["src/index.ts"],
  "key_decisions": [
    "Used strategy pattern for flexibility",
    "Added caching for performance"
  ],
  "context_for_next": "Focus review on cache invalidation logic",
  "back_pressure": {
    "tests": "pass",
    "lint": "pass",
    "typecheck": "pass"
  }
}
```

---

## Examples

```
execute-task campaign-migration/US-003    # Execute specific story
execute-task order-system/CAM-001         # Full stack story
execute-task landing-page/US-001          # UI component story
```

---

## Notes

- **No isolation** — all worker phases execute in your active context. This is the key difference from Claude Code.
- **Worker path lookup** — always read `workers/registry.yaml` first. Never Glob for `worker.yaml`.
- **PRD discovery** — always use `qmd search` first. Never Glob for `prd.json`.
- **Quality gates** — run typecheck + lint + tests after every implementation phase (not just at end).
- **File locking** — same JSON format as Claude Code. Locks are per-story, per-file.
- **Linear sync** — best-effort. Attempt if credentials available, skip silently on failure.
- **Context budget** — for heavy tasks, warn early. The execution state file supports resumption if you need to `$handoff`.
- **Commit work** — each implementation phase should commit its changes before the next phase begins.
- **Orchestrator mode** — when invoked by a project runner, output structured JSON and do NOT write `passes: true` (the orchestrator does that).
