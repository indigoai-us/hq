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

### 1.5 Pre-flight: Sync Pull

Pull latest files from cloud before loading the task. Non-blocking — failures do not prevent the command from continuing.

```bash
# Check for hq-cloud credentials
if [ -f ~/.hq/credentials.json ]; then
  hq sync pull
else
  # Not authenticated with hq-cloud — skip silently
  true
fi
```

- If `~/.hq/credentials.json` does not exist, skip silently (user is not connected to hq-cloud)
- If `hq sync pull` fails (network error, server down), log a warning and continue:
  `Cloud sync pull failed (continuing without sync)`
- On success, report concisely: `Pulled 3 files from cloud` or `Already up to date`

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
| `enhancement` | animation, polish, refactor, optimization, UX |

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
  - code-reviewer
  - dev-qa-tester

ui_component:
  - product-planner (if spec unclear)
  - frontend-dev
  - motion-designer
  - code-reviewer
  - dev-qa-tester

full_stack:
  - product-planner
  - architect
  - database-dev
  - backend-dev
  - frontend-dev
  - code-reviewer
  - dev-qa-tester

content:
  - content-brand
  - content-product
  - content-sales
  - content-legal

enhancement:
  - (relevant dev based on files)
  - code-reviewer
```

**Skip product-planner** if task has detailed acceptance criteria already.

**Filter by active workers**: Check `workers/registry.yaml` for status: active.

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
  "handoffs": []
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

### Your Instructions
{worker.instructions}

### Back Pressure (Run Before Completing)
{worker.verification.post_execute commands}

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
- Retry once with error context
- If still fails, pause and report

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
- **prd.json is required** - never read or fall back to README.md
- **Validate prd.json on load** - fail loudly on missing/malformed fields
- **Orchestrator-compatible output** - always end with structured JSON block (step 7d) so `/run-project` can parse results without absorbing full context
