---
description: Run a project through the Ralph loop - orchestrator for multi-task execution
allowed-tools: Task, Read, Write, Glob, Grep, Bash, AskUserQuestion
argument-hint: [project-name] or [--resume project] or [--status]
---

# /run-project - Project Orchestrator Loop

Loom-inspired Ralph loop. The orchestrator is the **caller** — it drives the worker pipeline directly. Each task is classified, routed through a worker sequence, and each worker is a fresh sub-agent.

**Arguments:** $ARGUMENTS

## Core Pattern (Loom-Style)

The orchestrator drives all I/O. Workers are sub-agents that receive instructions and return results. The orchestrator:
- Classifies tasks
- Selects worker sequences
- Spawns each worker with full context
- Collects results and passes handoff context to next worker
- Runs post-task hooks (PRD update, learnings)

## Usage

```bash
/run-project campaign-migration        # Start new
/run-project --resume campaign-migration # Resume paused
/run-project --status                   # Check all projects
```

## Process

### 1. Parse Arguments

**If `--status`:**
- Scan `workspace/orchestrator/*/state.json`
- Display all project statuses
- Exit

**If `--resume {project}`:**
- Load state from `workspace/orchestrator/{project}/state.json`
- Find last completed task, continue from next
- If a task was mid-pipeline (has execution state with incomplete phases), resume from the incomplete phase

**If `{project}`:**
- Check `projects/{project}/prd.json` exists
- If prd.json **MISSING**: STOP immediately. Do not fall back to README.md.
  ```
  ERROR: projects/{project}/prd.json not found.

  /run-project requires prd.json (not README.md).
  Fix: Run /prd {project} to generate prd.json.
  ```
- If prd.json **EXISTS**: validate structure (see Step 2)
- Check if state.json exists (offer resume or restart)
- Initialize fresh state if new

### 2. Load Project

Read and validate `projects/{project}/prd.json`:
```javascript
const prd = JSON.parse(read(`projects/${project}/prd.json`))

// Strict: userStories required. No fallback.
const stories = prd.userStories
if (!stories || !Array.isArray(stories) || stories.length === 0) {
  STOP: "prd.json has no userStories array (or it's empty). Migrate legacy 'features' key to 'userStories'."
}

// Validate each story has required fields
for (const story of stories) {
  const required = ['id', 'title', 'description', 'passes']
  const missing = required.filter(f => !(f in story))
  if (missing.length > 0) {
    STOP: `Story ${story.id || '?'} missing fields: ${missing.join(', ')}`
  }
}

const total = stories.length
const completed = stories.filter(s => s.passes).length
const remaining = stories.filter(s => !s.passes)
```

### 3. Display Status

```
Project: {project}
Progress: {completed}/{total} ({percentage}%)

Remaining:
  1. {id}: {title} (next)
  2. {id}: {title}

Continue? [Y/n]
```

### 4. Initialize/Load State

```bash
mkdir -p workspace/orchestrator/{project}/executions
```

Write `workspace/orchestrator/{project}/state.json`:
```json
{
  "project": "{project}",
  "prd_path": "projects/{project}/prd.json",
  "status": "in_progress",
  "started_at": "{ISO8601}",
  "updated_at": "{ISO8601}",
  "progress": { "total": 0, "completed": 0, "failed": 0, "in_progress": 0 },
  "current_task": null,
  "completed_tasks": [],
  "retries": 0
}
```

### 5. The Loop

```
while (remaining tasks with passes: false):

    5a. SELECT next task
        - Priority order from PRD
        - Respect dependsOn (skip if deps incomplete)
        - First incomplete + unblocked task

    5b. CLASSIFY task type
        Analyze title, description, acceptance criteria:

        | Type             | Indicators                                          |
        |------------------|-----------------------------------------------------|
        | schema_change    | database, migration, schema, table, column, prisma  |
        | api_development  | endpoint, API, REST, GraphQL, route, service        |
        | ui_component     | component, page, form, button, React, UI            |
        | full_stack       | Combination of backend + frontend indicators        |
        | content          | copy, messaging, brand voice, content, SEO          |
        | enhancement      | animation, polish, refactor, optimization           |

    5c. SELECT worker sequence
        Based on type, pick worker pipeline:

        schema_change:    database-dev → backend-dev → code-reviewer → dev-qa-tester
        api_development:  backend-dev → code-reviewer → dev-qa-tester
        ui_component:     frontend-dev → motion-designer → code-reviewer → dev-qa-tester
        full_stack:       architect → database-dev → backend-dev → frontend-dev → code-reviewer → dev-qa-tester
        content:          content-brand → content-product → content-sales → content-legal
        enhancement:      (relevant dev based on files) → code-reviewer

        If task has unclear spec, prepend product-planner to sequence.

        Report plan:
        ```
        Task: {id} - {title}
        Type: {type}
        Pipeline: {worker1} → {worker2} → {worker3}
        ```

    5d. INITIALIZE execution state
        Write workspace/orchestrator/{project}/executions/{task-id}.json:
        {
          "task_id": "{id}",
          "status": "in_progress",
          "started_at": "{ISO8601}",
          "current_phase": 1,
          "phases": [
            {"worker": "backend-dev", "status": "pending"},
            {"worker": "code-reviewer", "status": "pending"}
          ],
          "handoffs": []
        }

    5e. EXECUTE worker pipeline
        For each worker in sequence:

        i. LOAD worker config
           Read workers/dev-team/{worker-id}/worker.yaml
           (or workers/{worker-id}/worker.yaml for non-dev-team)
           Extract: instructions, context.base files, verification.post_execute

        ii. BUILD worker prompt
            ```
            ## You are: {worker.name} ({worker.description})

            ## Task: {task.id} - {task.title}

            ### Description
            {task.description}

            ### Acceptance Criteria
            {task.acceptance_criteria as checklist}

            ### Files to Focus On
            {task.files or inferred from description}

            ### Context from Previous Worker
            {handoff JSON from previous worker, or "First in pipeline — no prior context."}

            ### Your Instructions
            {worker.yaml instructions}

            ### Back Pressure (MUST run before completing)
            {worker.yaml verification.post_execute commands}
            If no specific commands: run typecheck, lint, tests, build as applicable.

            ### Output Requirements
            When complete, output this JSON block:
            ```json
            {
              "summary": "What you accomplished",
              "files_created": ["paths"],
              "files_modified": ["paths"],
              "key_decisions": ["decision and rationale"],
              "context_for_next": "What the next worker needs to know",
              "back_pressure": {
                "tests": "pass|fail|skipped",
                "lint": "pass|fail|skipped",
                "typecheck": "pass|fail|skipped",
                "build": "pass|fail|skipped"
              },
              "issues": ["any blocking issues"]
            }
            ```
            ```

        iii. SPAWN worker sub-agent
             Task({
               subagent_type: "general-purpose",
               prompt: {built prompt},
               description: "{worker-id} for {task.id}"
             })

        iv. PROCESS worker output
            Parse the JSON output block.

            If back pressure has failures:
              - Retry ONCE with error context appended to prompt
              - If still fails → pause, report to user

            If issues array is non-empty:
              - Log issues
              - If blocking → pause, ask user

            If success:
              - Store output as handoff context for next worker
              - Update execution state: phase status → completed
              - Advance to next worker

        v. UPDATE execution state after each phase
           Update workspace/orchestrator/{project}/executions/{task-id}.json:
           - Mark completed phase
           - Add handoff to handoffs array
           - Increment current_phase

    5f. POST-TASK HOOK (after all workers complete)

        i. Update PRD
           Set task.passes = true in projects/{project}/prd.json

        ii. Write learning entry
            workspace/learnings/{project}/{task-id}.json:
            {
              "task_id": "{id}",
              "project": "{project}",
              "created_at": "{ISO8601}",
              "task_type": "{classified type}",
              "workers_used": ["list"],
              "key_decisions": ["aggregated from all phases"],
              "insights": ["extracted from worker outputs"]
            }

        iii. Update state.json
             - completed_tasks.push({id, completed_at, workers_used})
             - progress.completed++
             - current_task = null

        iv. Log to progress.txt
            [{timestamp}] Completed: {task.id} - {task.title}
              Pipeline: {worker1} → {worker2} → {worker3}
              Progress: {completed}/{total}

    5g. CHECK context budget
        If context feels heavy or > 30%:
          - Save state
          - Suggest: "Context filling. Run /run-project --resume {project}"
```

### 6. Handle Task Failure

If any worker phase fails after retry:

```
Phase {N} ({worker}) failed for {task.id}

Error: {details}
Attempts: {count}

Options:
1. Retry this worker phase
2. Skip worker, continue pipeline
3. Pause project (/run-project --resume {project})
4. Abort
```

Use AskUserQuestion.

### 7. Complete Project

When all stories have `passes: true`:

**Generate report:**
```
Project Complete: {project}

Tasks: {completed}/{total}
Workers Used: {worker}: {N} tasks, ...
Learnings: {count}
```

**Aggregate learnings** from `workspace/learnings/{project}/*.json` into `knowledge/workers/{project}-learnings.md`.

**Update state:** `status: "completed"`, `completed_at: "{ISO8601}"`

### 8. Status Display (--status)

```
Project Status

ACTIVE:
  campaign-migration — 5/11 (45%) — backend-dev phase on CAM-006

PAUSED:
  (none)

COMPLETED:
  user-auth (3d ago) — 8/8
```

## Worker Pipeline Reference

| Task Type | Worker Sequence |
|-----------|----------------|
| schema_change | database-dev → backend-dev → code-reviewer → dev-qa-tester |
| api_development | backend-dev → code-reviewer → dev-qa-tester |
| ui_component | frontend-dev → motion-designer → code-reviewer → dev-qa-tester |
| full_stack | architect → database-dev → backend-dev → frontend-dev → code-reviewer → dev-qa-tester |
| content | content-brand → content-product → content-sales → content-legal |
| enhancement | (relevant dev) → code-reviewer |

Prepend **product-planner** if task spec is unclear or acceptance criteria are vague.

## Handoff Context Format

```json
{
  "from_worker": "backend-dev",
  "to_worker": "code-reviewer",
  "timestamp": "ISO8601",
  "summary": "What was accomplished",
  "files_created": ["src/services/foo.ts"],
  "files_modified": ["src/index.ts"],
  "key_decisions": ["Used strategy pattern"],
  "context_for_next": "Focus review on cache invalidation",
  "back_pressure": { "tests": "pass", "lint": "pass", "typecheck": "pass" }
}
```

## State File Format

`workspace/orchestrator/{project}/state.json`:
```json
{
  "project": "campaign-migration",
  "prd_path": "projects/campaign-migration/prd.json",
  "status": "in_progress|paused|completed",
  "started_at": "ISO8601",
  "updated_at": "ISO8601",
  "progress": { "total": 11, "completed": 5, "failed": 0, "in_progress": 1 },
  "current_task": {
    "id": "CAM-006",
    "started_at": "ISO8601",
    "phase": 2,
    "worker": "backend-dev"
  },
  "completed_tasks": [
    { "id": "CAM-001", "completed_at": "ISO8601", "workers_used": ["backend-dev", "code-reviewer"] }
  ],
  "retries": 0
}
```

## Rules

- **ONE project at a time**
- **Orchestrator classifies + routes, workers implement** — never implement directly
- **Fresh sub-agent per worker** — no context accumulation
- **Back pressure is mandatory** — no skipping tests/lint/typecheck
- **Handoffs preserve context** — next worker knows what happened
- **Checkpoint between tasks** — state survives interruptions
- **Fail fast** — pause on errors, surface to user
- **prd.json is required** — never read or fall back to README.md
- **Validate prd.json on load** — fail loudly on missing/malformed fields

## Integration

- `/prd` → creates PRD → `/run-project {name}` executes it
- `/execute-task {project}/{id}` → runs single task with same pipeline (standalone)
- `/run-project --resume` → continues after pause or context reset
- `/nexttask` → shows active projects from /run-project
