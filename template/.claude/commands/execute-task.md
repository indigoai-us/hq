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

Read and validate `projects/{project}/prd.json`:

```javascript
// Strict: prd.json required. No README.md fallback.
const prdPath = `projects/${project}/prd.json`
if (!fileExists(prdPath)) {
  STOP: `ERROR: ${prdPath} not found. Run /prd ${project} first.`
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

**Codex worker routing** (applies when `worker_hints` or task indicators match):

| Pattern | Worker |
|---------|--------|
| "codex", "AI-generated" | codex-coder |
| "codex review", "second opinion" | codex-reviewer |
| "auto-fix", "debug recovery" | codex-debugger |

If task contains codex worker hints, include the matched codex worker(s) in the sequence.

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
  - code-reviewer
  - dev-qa-tester

api_development:
  - product-planner (if spec unclear)
  - backend-dev
  - codex-coder (optional, if worker_hints include codex)
  - code-reviewer
  - codex-reviewer (optional, for second opinion)
  - codex-debugger (optional, before QA if back-pressure issues)
  - dev-qa-tester

ui_component:
  - product-planner (if spec unclear)
  - frontend-dev
  - codex-coder (optional, if worker_hints include codex)
  - motion-designer
  - code-reviewer
  - codex-reviewer (optional, for second opinion)
  - codex-debugger (optional, before QA if back-pressure issues)
  - dev-qa-tester

full_stack:
  - product-planner
  - architect
  - database-dev
  - backend-dev
  - frontend-dev
  - codex-coder (optional, if worker_hints include codex)
  - code-reviewer
  - codex-reviewer (optional, for second opinion)
  - codex-debugger (optional, before QA if back-pressure issues)
  - dev-qa-tester

codex_fullstack:
  - product-planner (if spec unclear)
  - architect
  - database-dev
  - codex-coder
  - codex-reviewer
  - dev-qa-tester

content:
  - content-brand
  - content-product
  - content-sales
  - content-legal

enhancement:
  - (relevant dev based on files)
  - code-reviewer
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
| codex-reviewer | Second-opinion review via Codex AI |
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

### 5.5 Load Scoped Learnings

Learnings live inside the files they govern — no separate learnings files.

1. For each worker in the selected sequence:
   - Worker `instructions:` in `worker.yaml` includes a `## Learnings` subsection with accumulated rules from prior `/learn` injections
   - These are loaded automatically in step 6a when reading worker config
2. `.claude/CLAUDE.md` `## Learned Rules` (global hot rules) is already in session context

No extra file reads needed — learnings are part of the source files.

### 6. Execute Each Phase

For each worker in sequence:

#### 6a. Load Worker Config

Read `workers/public/dev-team/{worker-id}/worker.yaml` (or `workers/{worker-id}/worker.yaml` for non-dev-team):
- `instructions` - Worker's role and process
- `context.base` - Files worker always needs
- `skills.installed` - Worker's skills
- `verification.post_execute` - Back pressure checks

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

### Human-in-the-Loop Decisions
If your task requires the user to make BATCH decisions (5+ items with the same option set), use /decide instead of AskUserQuestion:
1. Build a DecisionQueue (see /decide command for schema)
2. Write queue.json to repos/private/decision-ui/data/
3. Start decision-ui server if not running, notify user
4. Poll GET /api/status until completedAt is set
5. Read responses.json and continue

Use AskUserQuestion for: single clarifications, yes/no, 1-3 choices.
Use /decide for: batch classification, review queues, multi-item triage (5+ items).

### Your Instructions
{worker.instructions}

### Back Pressure (Run Before Completing)
{worker.verification.post_execute commands}

If repo is `repos/private/widgets-site`, also run:
```bash
npm run check-coverage                                                    # all routes covered
npm run generate-manifest && git diff --quiet tests/e2e/manifest.json     # manifest fresh
```

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
  prompt: {built prompt above},
  description: "{worker.id} for {task.id}"
})
```

#### 6d. Process Worker Output

Parse worker's JSON output.

If back pressure failed:
1. **Auto-recover via codex-debugger** (max 1 attempt per phase):
   - Check `codex_debug_attempts` — skip if this phase already had a codex-debugger intervention
   - Spawn codex-debugger sub-agent with:
     ```
     Task({
       subagent_type: "general-purpose",
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

#### 6e. Update Execution State

After each phase:
```json
{
  "phases": [
    {"worker": "backend-engineer", "status": "completed", "completed_at": "..."},
    {"worker": "code-reviewer", "status": "in_progress"},
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

### 7. Complete Task

When all phases complete:

#### 7a. Update PRD

```javascript
// Update projects/{project}/prd.json
task.passes = true
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

#### 7b. Capture Learnings via /learn

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

`/learn` handles: injection into source files, global promotion, event logging, dedup.

If task completed cleanly with no failures/retries/notable patterns, `/learn` will log the event only (no rule injection).

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

#### 7d. Structured Output for Orchestrator

When invoked as a sub-agent by `/run-project`, end with this JSON so the orchestrator can parse results without absorbing full context:

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
    "build": "pass|fail|skipped",
    "e2e_manifest": "pass|fail|skipped"
  }
}
```

### 8. Handle Failures

If any phase fails after retry:

0. **Auto-capture failure as learning:**
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

## Rules

- **ONE task at a time** - Never work on multiple tasks
- **Fresh context per worker** - Spawn sub-agents, don't accumulate
- **Back pressure is mandatory** - No skipping tests/lint/typecheck
- **Capture learnings** - Every task generates learning entry
- **Handoffs preserve context** - Next worker knows what happened
- **Fail fast, fail loud** - Stop on errors, don't hide them
- **Widgets Inc E2E enforcement** - When repo is widgets-site, back pressure includes manifest freshness + coverage check. Workers must update/add E2E tests for modified pages.
- **prd.json is required** - never read or fall back to README.md
- **Validate prd.json on load** - fail loudly on missing/malformed fields
- **Orchestrator-compatible output** - always end with structured JSON block (step 7d) so `/run-project` can parse results without absorbing full context
- **ALWAYS use agent-browser** for all browser interactions (OAuth flows, GTM, Meta, Google Ads, CIO, etc.). NEVER open headed browsers expecting manual user input — agent-browser handles auth states automatically via saved browser-state files
- **Do NOT use EnterPlanMode or TodoWrite** — /execute-task IS the planning and execution pipeline. The PRD, task classification, and worker sequencing replace ad-hoc planning. Follow the steps in order.
