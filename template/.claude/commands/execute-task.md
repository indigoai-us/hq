---
description: Execute a single task through coordinated worker phases (Ralph pattern)
allowed-tools: Task, Read, Write, Glob, Grep, Bash, AskUserQuestion
argument-hint: [project/task-id]
visibility: public
---

# /execute-task - Worker-Coordinated Task Execution

Execute a single user story through coordinated worker phases. Each worker handles their domain, passes context to the next.

**Arguments:** $ARGUMENTS

## Ralph Principle

"Pick a task, complete it, commit it."

- Fresh context per task
- Sub-agents do heavy lifting
- Back pressure keeps code on rails
- Handoffs preserve context between workers

## Process

### 1. Parse Arguments

Extract `{project}/{task-id}` from arguments.

If no arguments:
```
Usage: /execute-task {project}/{task-id}

Example: /execute-task campaign-migration/CAM-003
```

### 2. Load Task Spec

Resolve project location — use `qmd search` (never Glob):

```javascript
// Use qmd to discover prd.json location (never Glob)
const results = qmdSearch(`${project} prd.json`, 5)
const prdPath = results.find(r => r.file.includes(`/${project}/prd.json`))?.file
  || `companies/{co}/projects/${project}/prd.json`  // direct Read fallback
  || `projects/${project}/prd.json`                  // personal/HQ fallback
if (!fileExists(prdPath)) {
  STOP: `ERROR: prd.json not found for ${project}. Run /prd ${project} first.`
}

const prd = JSON.parse(read(prdPath))

// Strict: userStories required. No fallback.
const stories = prd.userStories
if (!stories || !Array.isArray(stories)) {
  STOP: "prd.json missing userStories array. Migrate legacy 'features' key to 'userStories'."
}

// Validate required fields
for (const story of stories) {
  const required = ['id', 'title', 'description', 'passes']
  const missing = required.filter(f => !(f in story))
  if (missing.length > 0) {
    STOP: `Story ${story.id || '?'} missing fields: ${missing.join(', ')}`
  }
}

const task = stories.find(s => s.id === taskId)
```

Extract:
- `id`, `title`, `description`
- `acceptance_criteria`
- `files` (if specified)
- `dependsOn` (check these are complete)

If task not found or already `passes: true`:
```
Task {taskId} not found or already complete.
```

### 2.5 Check Codex CLI Availability

If task type will be code-related (check after classification, but pre-flight here):

```bash
which codex >/dev/null 2>&1
```

- If available: set `codex_available = true`
- If unavailable: set `codex_available = false`, warn:
  ```
  Warning: Codex CLI not found. codex-reviewer will run as Claude-only review (no Codex model).
  ```

This enables graceful degradation — pipeline continues without Codex but logs a warning.

### 2.6 Check Story Checkout State

Guard against concurrent execution of the same story.

1. **Load config**: Read `settings/orchestrator.yaml` → `checkout.enabled` and `checkout.stale_timeout_minutes` (defaults: `true`, `30`)
2. **Skip if disabled**: If `checkout.enabled: false`, skip this step entirely and proceed to step 3

3. **Read state.json**: Read `workspace/orchestrator/{project}/state.json` (if it doesn't exist, skip to step 3 (Classify Task Type) — no checkout to check)

4. **Check for existing checkout**: If `current_task.id` matches this story's ID AND `current_task.checkedOutBy` is not null:

   a. **Extract checkout info**:
   ```
   checkedOutPid = state.current_task.checkedOutBy.pid
   checkedOutSession = state.current_task.checkedOutBy.sessionId
   checkedOutAt = state.current_task.checkedOutBy.startedAt
   ```

   b. **Check if PID is alive** via:
   ```bash
   kill -0 {checkedOutPid} 2>/dev/null
   ```

   c. **If PID is ALIVE** — warn and ask user:
   ```
   AskUserQuestion: "Story {task.id} is currently checked out by PID {checkedOutPid}
   (session: {checkedOutSession}, started: {checkedOutAt}).
   Another /execute-task may be running.
   Proceed anyway (override) or abort?"
   Options: ["Proceed anyway", "Abort"]
   ```
   - If user chooses **Abort**: stop immediately
   - If user chooses **Proceed anyway**: log warning "User overrode live checkout (PID {checkedOutPid})" and continue

   d. **If PID is DEAD** — check timestamp and compute age:
   - **If `checkedOutAt` is null/empty**: release unconditionally — update state.json: set `current_task.checkedOutBy = null`, update `updated_at`. Warn "Released checkout held by dead PID {checkedOutPid} (no timestamp)". Proceed normally.
   - **If `checkedOutAt` is present**: compute age:
     ```
     ageSeconds = now() - Date.parse(checkedOutAt)
     staleSeconds = stale_timeout_minutes * 60
     ```
     - Regardless of age (dead PID = safe to take over):
       - Update state.json: set `current_task.checkedOutBy = null`, update `updated_at`
       - If age >= staleSeconds: warn "Released stale checkout (dead PID {checkedOutPid}, {ageSeconds}s old)"
       - If age < staleSeconds: warn "Released checkout held by dead PID {checkedOutPid} (not yet stale, but PID is gone)"
     - Proceed normally

5. **If `current_task.id` does NOT match this story** OR **`checkedOutBy` is null**: proceed normally — no checkout conflict

Report:
```
Checkout check: clear (no active checkout for {task.id})
```
or after release:
```
Checkout check: released dead checkout for {task.id}, proceeding
```

### 3. Classify Task Type

Analyze task title, description, and acceptance criteria. Match against patterns:

| Type | Indicators |
|------|------------|
| `schema_change` | database, migration, schema, table, column, prisma, SQL |
| `api_development` | endpoint, API, REST, GraphQL, route, service |
| `ui_component` | component, page, form, button, React, UI, responsive |
| `full_stack` | Combination of backend + frontend indicators |
| `codex_fullstack` | codex, AI-generated, codex-powered full stack |
| `enhancement` | animation, polish, refactor, optimization, UX |

**Codex worker routing:**

- **codex-reviewer** is **mandatory** for all code task types (schema_change, api_development, ui_component, full_stack, codex_fullstack, enhancement). Always included after code-reviewer.
- **codex-coder** and **codex-debugger** remain optional — included when `worker_hints` or task indicators match:

| Pattern | Worker | Inclusion |
|---------|--------|-----------|
| "codex", "AI-generated" | codex-coder | Optional (hints match) |
| "auto-fix", "debug recovery" | codex-debugger | Optional (hints match) |

Report classification:
```
Task: {task.id} - {task.title}
Type: {type} (matched: {indicators})
```

### 4. Select Worker Sequence

Based on task type, determine worker sequence:

```yaml
schema_change:
  - product-planner (if spec unclear)
  - database-dev
  - backend-dev
  - acceptance-test-writer (if e2eTests non-empty)
  - code-reviewer
  - codex-reviewer
  - dev-qa-tester

api_development:
  - product-planner (if spec unclear)
  - backend-dev
  - codex-coder (optional, if worker_hints include codex)
  - acceptance-test-writer (if e2eTests non-empty)
  - code-reviewer
  - codex-reviewer
  - codex-debugger (optional, before QA if back-pressure issues)
  - dev-qa-tester

ui_component:
  - product-planner (if spec unclear)
  - frontend-dev
  - codex-coder (optional, if worker_hints include codex)
  - motion-designer
  - acceptance-test-writer (if e2eTests non-empty)
  - code-reviewer
  - codex-reviewer
  - codex-debugger (optional, before QA if back-pressure issues)
  - dev-qa-tester

full_stack:
  - product-planner
  - architect
  - database-dev
  - backend-dev
  - frontend-dev
  - codex-coder (optional, if worker_hints include codex)
  - acceptance-test-writer (if e2eTests non-empty)
  - code-reviewer
  - codex-reviewer
  - codex-debugger (optional, before QA if back-pressure issues)
  - dev-qa-tester

codex_fullstack:
  - product-planner (if spec unclear)
  - architect
  - database-dev
  - codex-coder
  - acceptance-test-writer (if e2eTests non-empty)
  - codex-reviewer
  - dev-qa-tester

content:
  - content-brand
  - content-product
  - content-sales
  - content-legal

enhancement:
  - (relevant dev based on files)
  - acceptance-test-writer (if e2eTests non-empty)
  - code-reviewer
  - codex-reviewer
  - codex-debugger (optional, if auto-fix needed)
```

**Skip product-planner** if task has detailed acceptance criteria already.

**Filter by active workers**: Check `workers/registry.yaml` for status: active.

**Worker phase descriptions** (for execution plan display):

| Worker | Phase Description |
|--------|-------------------|
| product-planner | Clarify spec and acceptance criteria |
| architect | Design system architecture |
| database-dev | Implement schema and migrations |
| backend-dev | Implement backend service |
| frontend-dev | Implement frontend UI |
| codex-coder | Generate code via Codex AI |
| motion-designer | Add animations and motion |
| code-reviewer | Review changes (Claude-based) |
| codex-reviewer | Mandatory second-opinion review via Codex AI |
| acceptance-test-writer | Write story-level acceptance tests from e2eTests |
| codex-debugger | Auto-fix issues via Codex AI |
| dev-qa-tester | Verify implementation |

Present plan:
```
Execution Plan for {task.id}:

Phase 1: backend-engineer → Implement service
Phase 2: code-reviewer → Review changes
Phase 3: qa-tester → Verify implementation

Proceed? [Y/n]
```

### 5. Initialize Execution State

Create execution tracking file:

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
    {"worker": "backend-engineer", "status": "pending"},
    {"worker": "code-reviewer", "status": "pending"},
    {"worker": "qa-tester", "status": "pending"}
  ],
  "handoffs": [],
  "codex_debug_attempts": []
}
```

### 5.0.5 Acquire Story Checkout

If `checkout.enabled: true` (from `settings/orchestrator.yaml`):

1. **Read state.json**: Read `workspace/orchestrator/{project}/state.json`. If it doesn't exist, create it with minimal structure: `{"version":1,"current_task":{},"updated_at":"{ISO8601}"}`

2. **Write checkout entry** into `current_task.checkedOutBy`:
   ```json
   {
     "pid": {current_process_pid},
     "startedAt": "{ISO8601}",
     "sessionId": "{started_at from step 5}"
   }
   ```
   Also ensure `current_task.id` is set to this story's ID and `updated_at` is refreshed.

   **Getting the PID**: Run `echo $$` in bash to get the current shell's PID. Use that value as the `pid` field.

3. **Write state.json back** with the updated `checkedOutBy` block

4. **Report**: `Checkout acquired for {task.id} (PID: {pid})`

If `checkout.enabled: false`: skip this step silently.

### 5.1 Audit: Task Started

```bash
scripts/audit-log.sh append \
  --event task_started \
  --project {project} \
  --story-id {task.id} \
  --company {company} \
  --session-id {started_at} \
  --action "Task execution started: {task.title}" || true
```

### 5.5 Acquire File Locks

If the story has a non-empty `files` array and the target repo has a `repoPath` in prd metadata:

1. **Load config**: Read `settings/orchestrator.yaml` → `file_locking`
2. **Skip if disabled**: If `file_locking.enabled: false`, skip this step entirely
3. **Read existing locks**: Read `{repoPath}/.file-locks.json` (create if missing: `{"version":1,"locks":[]}`)
4. **Stale lock cleanup**: For each existing lock, check if owner PID is running (`kill -0 {pid} 2>/dev/null`). If not running AND lock is older than `stale_lock_timeout_minutes`, remove it
5. **Conflict check**: For each file in `task.files`, check if already locked by another story:
   - **Self-owned lock**: If a file is already locked by the SAME story ID, skip it (the orchestrator may have pre-acquired locks for swarm mode)
   - If conflicts found with a DIFFERENT story, apply `conflict_mode`:
     - `hard_block`: STOP — report conflicting files + owner story, exit with structured JSON `{"status":"blocked","blocked_by":[...]}`
     - `soft_block`: Log warning, proceed but instruct workers to skip locked files. Add `locked_files` to worker prompt context
     - `read_only_fallback`: Log warning, proceed. Add `read_only_files` to worker prompt context
6. **Acquire locks**: For each file in `task.files` (skip files already self-owned), append to `.file-locks.json`:
   ```json
   {"file": "{path}", "owner": {"project": "{project}", "story": "{task.id}", "pid": {$$}}, "acquired_at": "{ISO8601}"}
   ```
   (`$$` = current shell PID via `echo $$`)
7. **Update state.json**: Read orchestrator state, update project's `checkedOutFiles`:
   ```json
   [{"file": "{path}", "story": "{task.id}", "repo": "{repoPath}"}]
   ```
   Write state.json back

Report: `File locks acquired: {N} files for {task.id}`

### 5.5.5 Sync Linear Issue to In Progress (if configured, best-effort)

If the story has `linearIssueId` and prd metadata has `linearCredentials`:

```bash
# Read API key from credentials path in prd metadata
LINEAR_KEY=$(cat {prd.metadata.linearCredentials} | python3 -c "import sys,json; print(json.load(sys.stdin)['apiKey'])")
ISSUE_ID="{task.linearIssueId}"
IN_PROGRESS_STATE="{prd.metadata.linearInProgressStateId}"

# Set issue to In Progress
curl -s -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $LINEAR_KEY" \
  -d "{\"query\": \"mutation { issueUpdate(id: \\\"$ISSUE_ID\\\", input: { stateId: \\\"$IN_PROGRESS_STATE\\\" }) { success } }\"}"

# Comment on issue
COMMENT="Started by HQ — task in progress."
curl -s -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $LINEAR_KEY" \
  -d "{\"query\": \"mutation { commentCreate(input: { issueId: \\\"$ISSUE_ID\\\", body: \\\"$COMMENT\\\" }) { success } }\"}"
```

Skip silently if no `linearIssueId` or no credentials configured. Never block execution on Linear sync.

**Cross-company guard**: Before using `linearCredentials`, verify the path matches the active company per `companies/manifest.yaml`. If it points to a different company's settings, ABORT Linear sync and warn.

### 5.6 Load Applicable Policies

Load policies from all three directories and filter by `trigger` field:

1. **Company policies**: Determine active company (from prd.json `metadata.company` or manifest repo lookup). Read all files in `companies/{co}/policies/` — check each policy's `trigger` for applicability to current task.
2. **Repo policies**: If working inside a repo, check `{repo}/.claude/policies/` if it exists.
3. **Global policies**: Read `.claude/policies/` for cross-cutting and command-scoped rules.

Include applicable policy rules in worker prompts (step 6b) under `### Applicable Policies`.

### 6. Execute Each Phase

For each worker in sequence:

#### 6a. Load Worker Config

Read `workers/public/dev-team/{worker-id}/worker.yaml` (or `companies/*/workers/{worker-id}/worker.yaml` for company workers, `workers/public/{worker-id}/worker.yaml` for shared):
- `instructions` - Worker's role and process
- `context.base` - Files worker always needs
- `skills.installed` - Worker's skills
- `verification.post_execute` - Back pressure checks
- `execution.model` - Model tier for this worker (opus/sonnet/haiku)
- `execution.codex_model` - OpenAI model for Codex CLI invocations (codex workers only)

**Resolve model for this phase:**
```
model = task.model_hint || worker.execution.model || "opus"
```
Story-level `model_hint` (from prd.json) overrides worker default. Fallback: opus.

**Resolve Codex model (for codex workers only):**
```
codex_model = task.codex_model_hint || worker.execution.codex_model || "gpt-5.4"
```
Story-level `codex_model_hint` overrides worker default. Fallback: gpt-5.4.

#### 6b. Build Worker Prompt

```markdown
## You are: {worker.name}
## Task: {task.id} - {task.title}

### Description
{task.description}

### Acceptance Criteria
{task.acceptance_criteria as checklist}

### Files to Focus On
{task.files or inferred from description}

### Context from Previous Phase
{handoff_context from previous worker, if any}

### Codebase Exploration
If the target repo has a qmd collection (check `qmd status`), prefer `qmd vsearch "<concept>" -c {collection} --json -n 10` for conceptual search (e.g. "where is auth handled", "billing service pattern"). Use Grep only for exact pattern matching (specific imports, function references, string literals).

### Applicable Policies
{policies loaded in step 5.6, if any}

### Codex CLI Model (codex workers only)
{worker.execution.codex_model || "gpt-5.4"} — pass via `-c model="{codex_model}"` to all codex exec/review commands

### Your Instructions
{worker.instructions}

### Back Pressure (Run Before Completing)
{worker.verification.post_execute commands}

# Add repo-specific back-pressure checks here if needed
# e.g. coverage checks, manifest freshness, etc.

### Output Requirements
When complete, provide JSON:
{
  "summary": "What you accomplished",
  "files_created": ["paths"],
  "files_modified": ["paths"],
  "key_decisions": ["decision and rationale"],
  "context_for_next": "Instructions for next worker",
  "back_pressure": {
    "tests": "pass|fail",
    "lint": "pass|fail",
    "typecheck": "pass|fail",
    "build": "pass|fail"
  },
  "issues": ["any blocking issues"]
}
```

#### 6c. Spawn Worker Sub-Agent

Use Task tool:
```
Task({
  subagent_type: "general-purpose",
  model: {resolved model from 6a},
  prompt: {built prompt above},
  description: "{worker.id} for {task.id}"
})
```

#### 6c.5 Inline Codex Review (when worker == codex-reviewer)

**Instead of spawning a sub-agent** for codex-reviewer, run the Codex review directly via CLI. This is deterministic — cannot be skipped by sub-agent discretion.

**If `codex_available == true`:**

1. Collect `files_modified` + `context_for_next` from previous worker's handoff (code-reviewer)
2. Run Codex CLI review:
   ```bash
   cd {target_repo} && codex review --uncommitted -c model="{codex_model}" \
     "Review changed files for: security, correctness, performance, style. Focus: {context_for_next from code-reviewer}" 2>&1
   ```
3. Capture full output (markdown-formatted review)
4. If output contains "critical" or "high" severity findings:
   - Present findings to user via AskUserQuestion
   - Options: "Address findings before continuing" / "Continue to QA (findings noted)" / "Skip"
5. Build handoff context from Codex output (add review findings to `context_for_next`)
6. Log to model-usage.jsonl: `{"worker":"codex-reviewer","model":"codex-cli"}`
7. Continue to next phase (dev-qa-tester)

**If `codex_available == false`:**
- Log warning: `"codex-reviewer skipped: CLI not available"`
- Continue to next phase without Codex review
- Still log to model-usage.jsonl: `{"worker":"codex-reviewer","model":"skipped"}`

**Skip this step entirely** for non-codex-reviewer workers — they spawn normally via 6c.

When iterating through the worker sequence in step 6, check if current worker is `codex-reviewer`:
- If yes → execute 6c.5 inline, then jump to 6e (skip 6c and 6d for this phase)
- If no → proceed with normal 6c → 6d flow

#### 6c.7 Acceptance Test Writer (when worker == acceptance-test-writer)

**Purpose:** Write executable acceptance tests from the story's `e2eTests` descriptions. These tests persist across stories — when story N+1 runs the full test suite, story N's acceptance tests act as regression guards.

**Skip conditions** (do NOT add this worker to the sequence if any are true):
- `task.e2eTests` is empty, absent, or `[]`
- Task type is `content`

**When this worker runs:**

1. **Read `task.e2eTests`** from prd.json — array of test descriptions
2. **Read all existing story test files** in `{repo}/__tests__/stories/` to understand the established pattern (imports, helpers, framework)
3. **Detect test framework**: Check `package.json` for vitest/jest/bun test. Check `qualityGates` for test runner command. Fall back to `bun test`
4. **Spawn sub-agent** with this prompt:

```markdown
## You are: acceptance-test-writer
## Task: Write acceptance tests for {task.id} - {task.title}

### Test Descriptions (from PRD)
{task.e2eTests as numbered list}

### Acceptance Criteria
{task.acceptanceCriteria as checklist}

### Context from Previous Phase
{handoff_context — what was implemented and where}

### Test Convention
- Write tests to: `{repo}/__tests__/stories/{task.id}.test.ts`
- One `describe("{task.id}: {task.title}")` block per story
- One `it()` or `test()` per e2eTests entry
- Import from the actual implementation — use real modules, not mocks
- Tests must verify the BEHAVIOR described in e2eTests, not implementation details
- Tests must be deterministic and fast (no network calls, no timers)
- If the story involves API endpoints: test request/response contracts
- If the story involves UI: test component rendering + user interactions
- If the story involves data: test transformations and edge cases

### Existing Story Tests (follow this pattern)
{contents of existing __tests__/stories/*.test.ts files, if any}

### Test Framework
{detected framework: vitest | jest | bun:test}

### Back Pressure
After writing tests, run them:
{test runner command, e.g. "bun test __tests__/stories/{task.id}.test.ts"}

All tests MUST pass before this phase completes. If a test fails, fix the test
(if the test is wrong) or flag the issue (if the implementation is wrong).

Also run ALL existing story tests to verify no regressions:
{test runner command, e.g. "bun test __tests__/stories/"}

### Output Requirements
{
  "summary": "Tests written for {task.id}",
  "files_created": ["__tests__/stories/{task.id}.test.ts"],
  "files_modified": [],
  "test_count": N,
  "all_story_tests_pass": true|false,
  "context_for_next": "Acceptance tests added: {N} tests in __tests__/stories/{task.id}.test.ts",
  "back_pressure": { "tests": "pass|fail" },
  "issues": []
}
```

5. **Process output**: If `all_story_tests_pass` is false, this is a regression — the current story broke a prior story's behavior. Handle like a back-pressure failure (6d auto-recovery flow).
6. **Continue to code-reviewer** with the test files included in the review scope.

**Key principle:** The test-writer runs AFTER implementation but BEFORE review. Tests validate the implementation against the spec. If they fail, the implementation is wrong — not the tests.

#### 6d. Process Worker Output

Parse worker's JSON output.

If back pressure failed:
1. **Auto-recover via codex-debugger** (max 1 attempt per phase):
   - Check `codex_debug_attempts` — skip if this phase already had a codex-debugger intervention
   - **If `codex_available == true`:** Run Codex debugger inline via CLI:
     ```bash
     cd {target_repo_path} && codex exec --full-auto -c model="{codex_model}" --cd {target_repo_path} \
       "Diagnose and fix back-pressure failure. Check: {failed_check_name}. Error: {stdout_stderr_from_failed_check}. Then re-run: {verification.post_execute commands}" 2>&1
     ```
   - **If `codex_available == false`:** Spawn Claude-based debugger sub-agent:
     ```
     Task({
       subagent_type: "general-purpose",
       model: "haiku",
       prompt: "You are: codex-debugger\n
         Issue: Back-pressure failure in {worker} phase: {failed_check_name}\n
         Error output: {stdout_stderr_from_failed_check}\n
         cwd: {target_repo_path}\n
         Run debug-issue skill: diagnose root cause, apply fix, then re-run back-pressure checks ({verification.post_execute commands}).",
       description: "codex-debugger recovery for {task.id} phase {N}"
     })
     ```
   - Record attempt in `codex_debug_attempts`:
     ```json
     { "phase": N, "worker": "{worker}", "check": "{failed_check}", "timestamp": "ISO8601" }
     ```
2. **Re-run back-pressure checks** after codex-debugger completes
3. If passes → mark phase completed, continue pipeline (skip normal retry)
4. If still fails → fall back to existing retry (retry once with error context)
5. If retry also fails → pause and report

If success:
- Store handoff context
- Update execution state
- Continue to next phase

#### 6d.5 Expand File Locks (Dynamic)

If file locking is enabled and worker output contains `files_created` or `files_modified`:
1. Compute `new_files` = files in worker output NOT already in `.file-locks.json` for this story
2. If `new_files` is non-empty: acquire locks for them (same as step 5.5 item 6) — append to `.file-locks.json` and state.json `checkedOutFiles`
3. Also update story's `files` array in prd.json with the new paths (so future sessions know the full scope)

This ensures stories that touch more files than predicted still get proper lock coverage.

#### 6e. Update Execution State

After each phase:
```json
{
  "phases": [
    {"worker": "backend-engineer", "model": "opus", "status": "completed", "completed_at": "..."},
    {"worker": "code-reviewer", "model": "sonnet", "status": "in_progress"},
    ...
  ],
  "handoffs": [
    {
      "from": "backend-engineer",
      "to": "code-reviewer",
      "context": {...worker output...}
    }
  ]
}
```

#### 6e.5 Audit: Phase Completed

```bash
scripts/audit-log.sh append \
  --event phase_completed \
  --project {project} \
  --story-id {task.id} \
  --worker {worker.id} \
  --model {resolved_model} \
  --result {success|fail} \
  --duration-ms {phase_duration_ms} \
  --action "Phase {N} completed: {worker.id}" || true
```

#### 6f. Log Model Usage

<!-- Schema (all fields):
  ts         string (ISO8601)  — timestamp of the log entry
  project    string            — project slug (from prd.json metadata.name or directory name)
  task       string            — story/task ID (e.g. "US-002")
  worker     string            — worker ID (e.g. "backend-engineer")
  model      string            — resolved model name (e.g. "sonnet", "opus")
  phase      number            — execution phase number (1-based)
  company    string (required) — company slug resolved from prd.metadata.company; if absent,
                                 look up manifest.yaml entry matching the project's directory path
  session_id string (optional) — ISO8601 timestamp of task start, taken from started_at
                                 recorded in the execution state (step 5); omit if unavailable
-->

Append one line per phase to `workspace/metrics/model-usage.jsonl`:
```json
{"ts":"ISO8601","project":"{project}","task":"{task.id}","worker":"{worker.id}","model":"{resolved model}","phase":N,"company":"{company}","session_id":"{session_id}"}
```

**Resolving `company`:** Use `prd.metadata.company` if present. Otherwise, find the company by matching the project's path (`companies/{co}/projects/…`) against `companies/manifest.yaml` — use the matching `{co}` slug.

**Resolving `session_id`:** Use the `started_at` ISO8601 value written to the execution state in step 5. If no `started_at` is available, omit the field entirely.

**Backward compatibility:** Existing entries that lack `company` or `session_id` remain valid — parsers must treat both fields as optional when reading historical data.

Create `workspace/metrics/` if it doesn't exist. This is append-only — no reads during execution.

### 7. Complete Task

When all phases complete:

#### 7.0 Release File Locks and Checkout

If file locking is enabled and locks were acquired in step 5.5:
1. Read `{repoPath}/.file-locks.json`
2. Remove all entries where `owner.project === "{project}" && owner.story === "{task.id}"`
3. Write updated `.file-locks.json`
4. Read orchestrator state.json, remove matching entries from project's `checkedOutFiles`
5. Write state.json

**Release story checkout** (if `checkout.enabled: true`):

1. Read `workspace/orchestrator/{project}/state.json`
2. **Safety check**: Only release if the current session holds the checkout — verify `current_task.checkedOutBy.pid` matches the PID acquired in step 5.0.5
3. If it matches: set `current_task.checkedOutBy = null`, update `updated_at`, write state.json back
4. If it does NOT match (another session took over): log warning "Checkout held by different PID — not releasing" and skip
5. Report: `Checkout released for {task.id}`

This entire step runs BEFORE PRD update so locks and checkout are released even if later steps fail.

#### 7a. Update PRD

When invoked by `/run-project` (headless `claude -p`), the **orchestrator** writes `passes: true` — execute-task must NOT write it.
When invoked standalone (interactive), execute-task writes `passes` directly:

```javascript
// Only if NOT invoked by orchestrator (check if prompt says "Do NOT write passes to prd.json"):
// Update resolved prd.json (at companies/{co}/projects/{project}/prd.json)
task.passes = true

// If invoked by orchestrator: skip this write. Output status JSON instead.
// The orchestrator reads your output.json and writes passes itself.
```

#### 7a.5 Sync to Linear (if configured)

If the story has `linearIssueId` and prd metadata has `linearCredentials`:

```bash
# Read API key from credentials path in prd metadata
LINEAR_KEY=$(cat {prd.metadata.linearCredentials} | python3 -c "import sys,json; print(json.load(sys.stdin)['apiKey'])")
ISSUE_ID="{task.linearIssueId}"
# "Done" state ID from prd metadata, or default lookup
DONE_STATE="{prd.metadata.linearDoneStateId}"

curl -s -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $LINEAR_KEY" \
  -d "{\"query\": \"mutation { issueUpdate(id: \\\"$ISSUE_ID\\\", input: { stateId: \\\"$DONE_STATE\\\" }) { success } }\"}"
```

Skip silently if no `linearIssueId` on the story or no credentials configured. Linear sync is best-effort — never block task completion on it.

**Cross-company guard**: Before using `linearCredentials`, verify the path matches the active company per `companies/manifest.yaml`. If it points to a different company's settings, ABORT Linear sync and warn.

#### 7a.6 Comment on Linear issue (if configured)

After state sync, add a comment to the Linear issue:

```bash
# On completion: notify reviewers
COMMENT="Completed by HQ. Ready for review."

# If prd.metadata has linearReviewers (member keys from config.json members block):
# Look up member name from config.json, append @mention
# e.g. "Completed by HQ. Ready for review. cc @{reviewer-name}"

curl -s -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $LINEAR_KEY" \
  -d "{\"query\": \"mutation { commentCreate(input: { issueId: \\\"$ISSUE_ID\\\", body: \\\"$COMMENT\\\" }) { success } }\"}"
```

When task is blocked or needs resolution, comment with blocker context + @mention the relevant team member. Skip silently if not configured.

#### 7b. Update Documentation

If the task introduced new features, changed behavior, or modified APIs, update the project's user-facing docs.

**Step 1: Resolve docs location**

Check PRD metadata for `docsPath`:
```javascript
const docsPath = prd.metadata?.docsPath
```

If `docsPath` is set, use it. If not, ask the user:
```
This task changed functionality. Where do docs live for this project?
(e.g., src/app/docs/, docs/, README.md, or "none")
```

Save the answer back to `prd.metadata.docsPath` so future tasks skip this question.

**Step 2: Identify what needs updating**

Based on `files_modified`, `files_created`, and `key_decisions` from worker outputs:
- New API endpoints → update relevant API docs
- New UI pages/features → update or create feature docs
- Changed behavior → update existing docs that describe the old behavior
- New database tables/fields → update data model docs if they exist

**Step 3: Apply updates**

Read the existing doc files, match the project's doc format/conventions, and edit in place. For new features with no existing doc page, create one following the project's doc conventions.

**Skip this step** if:
- `docsPath` is "none"
- The task was purely a bug fix with no behavior change
- The task was a refactor with no user-facing impact

#### 7b.5 Capture Learnings via /learn

Run `/learn` with structured input from execution:

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

`/learn` handles: policy file creation, event logging, dedup.

If task completed cleanly with no failures/retries/notable patterns, `/learn` will log the event only (no policy created).

#### 7b.6 Reindex

Run: `qmd update 2>/dev/null || true`

Ensures any knowledge, worker instructions, or command rules modified during execution are immediately searchable.

#### 7c.0 Audit: Task Completed

```bash
scripts/audit-log.sh append \
  --event task_completed \
  --project {project} \
  --story-id {task.id} \
  --company {company} \
  --session-id {started_at} \
  --files "{comma_separated_files_touched}" \
  --duration-ms {total_duration_ms} \
  --action "Task completed: {total_phases} phases, {files_touched_count} files" \
  --result success || true
```

#### 7c. Report Completion

```
Task Complete: {task.id} - {task.title}

Phases: {N} completed
Workers: {list}
Files touched: {count}

Key decisions:
- {decision 1}
- {decision 2}

Learning captured: workspace/learnings/{project}/{task-id}.json
PRD updated: passes: true
```

#### 7c.5 iMessage Notify (if configured)

Check `settings/contacts.yaml` for contacts whose `context` list includes the current project name. For each matching contact, send a brief completion update via iMessage:

```bash
# Count completed vs total stories
COMPLETED=$(grep -c '"passes": true' "${prdPath}" || echo 0)
TOTAL=$(python3 -c "import json; print(len(json.load(open('${prdPath}'))['userStories']))")
PCT=$((COMPLETED * 100 / TOTAL))

~/scripts/imessage.sh "{contact.imessage}" \
  "{project} update: {task.title} is done! $COMPLETED/$TOTAL stories complete ($PCT%)"
```

Best-effort — never block task completion on iMessage delivery. Log and continue if Messages.app errors.

#### 7d. Structured Output for Orchestrator

When invoked as a sub-agent by `/run-project`, end with this JSON so the orchestrator can parse results without absorbing full context:

```json
{
  "task_id": "{task.id}",
  "status": "completed",
  "summary": "1-sentence summary of what was accomplished",
  "workers_used": ["{worker1}", "{worker2}"],
  "models_used": {"worker1": "opus", "worker2": "sonnet"},
  "back_pressure": {
    "tests": "pass|fail|skipped",
    "lint": "pass|fail|skipped",
    "typecheck": "pass|fail|skipped",
    "build": "pass|fail|skipped",
    "e2e_manifest": "pass|fail|skipped"
  }
}
```

### 8. Handle Failures

If any phase fails after retry:

0. **Release file locks and checkout:** Same as step 7.0 — release all locks for this story from both `.file-locks.json` and state.json. Also release story checkout: read state.json, verify `current_task.checkedOutBy.pid` matches the PID acquired in step 5.0.5, and if so set `current_task.checkedOutBy = null` and write state.json back. Never orphan locks or checkouts on failure.

0.5. **Auto-capture failure as learning:**
   Run `/learn` with:
   ```json
   {
     "source": "back-pressure-failure",
     "severity": "high",
     "scope": "worker:{failed-worker-id}",
     "back_pressure_failures": [{"worker": "...", "check": "...", "error": "..."}],
     "task_id": "{task.id}",
     "project": "{project}"
   }
   ```
   This ensures the failure becomes a rule BEFORE asking the user what to do.

### 8.0.6 Audit: Task Failed

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

1. Update execution state: `status: "paused"`
2. Log error details
3. Present options:

```
Phase {N} ({worker}) failed: {error}

Options:
1. Fix manually and resume: /execute-task {project}/{task-id} --resume
2. Skip this worker and continue
3. Abort execution
```

When invoked as a sub-agent, also output structured JSON on failure:

```json
{
  "task_id": "{task.id}",
  "status": "failed",
  "summary": "Phase {N} ({worker}) failed: {brief error}",
  "workers_used": ["{workers that ran}"],
  "back_pressure": {}
}
```

## Handoff Context Format

Context passed between workers:

```json
{
  "from_worker": "backend-engineer",
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

## Worked Example: Complete End-to-End Task Execution

This example shows a real task execution from start to finish, demonstrating task loading, classification, worker sequencing, phase execution, and completion.

### Scenario: API Endpoint Implementation

**Task:** `POST /api/v1/orders/{id}/cancel` endpoint to allow customers to cancel pending orders.

### Step 1: Parse Arguments & Load Task

```
Input: /execute-task order-system/US-003
```

**Task spec loaded:**
```json
{
  "id": "US-003",
  "title": "Implement Cancel Order Endpoint",
  "description": "Add POST /api/v1/orders/{id}/cancel endpoint that cancels pending orders and notifies customer",
  "acceptance_criteria": [
    "Endpoint returns 400 if order not in 'pending' state",
    "Endpoint sends cancellation email to customer",
    "Endpoint logs action with order ID and timestamp",
    "All code passes lint and tests"
  ],
  "passes": false,
  "files": [
    "apps/api/src/routes/orders.ts",
    "apps/api/src/services/order-service.ts",
    "apps/api/src/emails/order-cancelled.ts"
  ]
}
```

### Step 2: Classify Task Type

```
Analyzing task indicators:
- "endpoint" → api_development
- "POST /api" → REST endpoint
- "services" → backend service
- "emails" → integration

Classification: api_development
Matched indicators: endpoint, service, email notification
```

### Step 3: Select Worker Sequence

```
Task Type: api_development
Spec Clarity: ✓ Clear acceptance criteria

Worker Sequence:
Phase 1: backend-dev → Implement service
Phase 2: code-reviewer → Review changes
Phase 3: codex-reviewer → Mandatory security/quality review
Phase 4: dev-qa-tester → Verify implementation

Proceeding with 4-phase pipeline.
```

### Step 4: Initialize Execution State

```
Creating execution file: workspace/orchestrator/order-system/executions/US-003.json

{
  "task_id": "US-003",
  "project": "order-system",
  "started_at": "2026-03-08T14:35:22Z",
  "status": "in_progress",
  "current_phase": 1,
  "phases": [
    {"worker": "backend-dev", "status": "pending"},
    {"worker": "code-reviewer", "status": "pending"},
    {"worker": "codex-reviewer", "status": "pending"},
    {"worker": "dev-qa-tester", "status": "pending"}
  ],
  "handoffs": [],
  "codex_debug_attempts": []
}
```

### Step 5: Phase 1 — backend-dev

**Worker output (JSON):**
```json
{
  "summary": "Implemented POST /api/v1/orders/{id}/cancel endpoint with state validation and email notification",
  "files_created": [
    "apps/api/src/emails/order-cancelled.ts"
  ],
  "files_modified": [
    "apps/api/src/routes/orders.ts",
    "apps/api/src/services/order-service.ts"
  ],
  "key_decisions": [
    "Used order state machine pattern (pending → cancelled transition only)",
    "Email notification async to prevent timeout on customer signal path",
    "Added database transaction to ensure order + audit log atomicity"
  ],
  "context_for_next": "Focus review on transaction semantics. Verify email template vars match order schema (customer_name, order_id, created_at). Check cancellation reasons logged to audit table.",
  "back_pressure": {
    "tests": "pass",
    "lint": "pass",
    "typecheck": "pass",
    "build": "pass"
  },
  "issues": []
}
```

**Files created/modified summary:**
```
✓ apps/api/src/emails/order-cancelled.ts (52 new lines)
✓ apps/api/src/routes/orders.ts (+18 lines, cancel route added)
✓ apps/api/src/services/order-service.ts (+31 lines, cancelOrder method added)

All back pressure checks pass:
✓ npm test (42 passed, 0 failed)
✓ npm run lint (0 issues)
✓ npm run check (0 TS errors)
```

### Step 6: Phase 2 — code-reviewer

**Worker receives handoff context:**
```
From: backend-dev
Summary: Implemented cancel endpoint with state validation and email

Key files: orders.ts, order-service.ts, order-cancelled.ts
Decision: Used state machine pattern for order transitions
Focus: Verify transaction semantics and email template vars
```

**Worker output (JSON):**
```json
{
  "summary": "Code review passed. State machine pattern correct. Transaction boundaries validated. Email template vars match schema.",
  "files_created": [],
  "files_modified": [],
  "key_decisions": [
    "Confirmed transaction includes both order update and audit log insert",
    "Email template correctly references order.customer_name (not customer.name)",
    "Error handling appropriate: 400 for non-pending orders, 500 for service errors"
  ],
  "context_for_next": "Code changes are production-ready. Codex will provide additional security perspective. QA should test: cancel pending order (success), cancel completed order (400 error), email delivery timing.",
  "back_pressure": {
    "tests": "pass",
    "lint": "pass",
    "typecheck": "pass",
    "build": "pass"
  },
  "issues": []
}
```

### Step 7: Phase 3 — codex-reviewer (Inline Execution)

**Running Codex CLI directly:**
```bash
cd repos/private/order-system && codex review --uncommitted \
  "Review changed files for: security, correctness, performance, style. Focus: API endpoint security, transaction safety, email delivery reliability"
```

**Codex output:**
```
CODEX REVIEW: order-system (uncommitted changes)
═══════════════════════════════════════════════════════════

Files analyzed: 3 (73 total lines changed)

SECURITY:
✓ No SQL injection (using parameterized queries)
✓ No auth bypass (endpoint checks user.id ownership)
✓ Email rate limiting OK (uses queue, not inline)

CORRECTNESS:
✓ Transaction boundary correct (both operations in same transaction)
✓ Error messages don't leak internal state
✓ Idempotency: calling twice won't double-cancel (state check before update)

PERFORMANCE:
⚠ Minor: Email sending is async but no timeout (could hang indefinitely)
  Suggestion: Add 30s timeout to email task

Code Quality: A
Severity: info (not critical path)
```

**Handoff for next phase:**
```
Codex review completed. One informational finding: email timeout.
Ready for QA testing. All critical checks pass.
```

### Step 8: Phase 4 — dev-qa-tester

**Receives full handoff context:**
```
Implemented: POST /api/v1/orders/{id}/cancel endpoint
Code review: Passed, state machine pattern correct
Codex security: Passed, email timeout noted as info-level
Test coverage: All unit tests passing

Your tasks:
1. Test cancel pending order → returns 200, email sent, audit logged
2. Test cancel completed order → returns 400, email NOT sent
3. Test auth: Verify user can only cancel own orders
```

**QA Worker Output:**
```json
{
  "summary": "All acceptance criteria verified. E2E tests pass: cancel pending (200), cancel completed (400), auth check (403 for other user orders)",
  "files_created": [
    "apps/api/tests/e2e/cancel-order.e2e.ts"
  ],
  "files_modified": [
    "apps/api/tests/cancel-order.test.ts"
  ],
  "key_decisions": [
    "Added E2E test covering auth boundary (user A cannot cancel user B's orders)",
    "Email delivery tested via mock SES (no actual email sent)",
    "Tested idempotency: cancelling twice returns 200 both times (same result)"
  ],
  "context_for_next": "All acceptance criteria met. Endpoint ready for production.",
  "back_pressure": {
    "tests": "pass",
    "lint": "pass",
    "typecheck": "pass",
    "build": "pass"
  },
  "issues": []
}
```

### Step 9: Complete Task

**Update prd.json:**
```json
{
  "id": "US-003",
  "title": "Implement Cancel Order Endpoint",
  "passes": true,
  "linearIssueId": "ORD-42",
  "notes": "Completed 2026-03-08. All phases passed (backend → review → codex → qa)."
}
```

**Sync Linear:**
```
✓ Issue ORD-42 → Done state
✓ Comment: "Completed by HQ. Ready for production. Codex flagged email timeout (info-level)."
```

**Final Report:**
```
Task Complete: US-003 - Implement Cancel Order Endpoint

Phases: 4 completed
Workers: backend-dev, code-reviewer, codex-reviewer, dev-qa-tester
Files touched: 5 (3 modified, 2 created with tests)

Key decisions:
- Used state machine pattern for order transitions
- Email notification async with rate limiting
- Added comprehensive auth + idempotency tests

Back pressure summary:
✓ All tests pass (84 total)
✓ All lint checks pass
✓ All TypeScript checks pass
✓ Build succeeds

Learning captured: workspace/learnings/order-system/US-003.json
PRD updated: passes: true
Linear synced: issue → Done state
```

---

## Rules

- **ONE task at a time** - Never work on multiple tasks
- **Fresh context per worker** - Spawn sub-agents, don't accumulate
- **Back pressure is mandatory** - No skipping tests/lint/typecheck
- **Capture learnings** - Every task generates learning entry
- **Handoffs preserve context** - Next worker knows what happened
- **Fail fast, fail loud** - Stop on errors, don't hide them
- **prd.json is required** - never read or fall back to README.md
- **Validate prd.json on load** - fail loudly on missing/malformed fields
- **Orchestrator-compatible output** - always end with structured JSON block (step 7d) so `/run-project` can parse results without absorbing full context
- **ALWAYS use agent-browser** for all browser interactions (OAuth flows, GTM, Meta, Google Ads, CIO, etc.). NEVER open headed browsers expecting manual user input — agent-browser handles auth states automatically via saved browser-state files
- **Do NOT use EnterPlanMode or TodoWrite** — /execute-task IS the planning and execution pipeline. The PRD, task classification, and worker sequencing replace ad-hoc planning. Follow the steps in order.
- **Always reindex after task completion** — `qmd update` after every completed task (step 7b.6)
- **Never rewrite the PRD** — sub-agents may only update the current story's `passes`, `notes`, and `linearIssueId` fields. Never restructure, rename, add, or remove stories. The orchestrator validates PRD integrity after each sub-agent returns.
