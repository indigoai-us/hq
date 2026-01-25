---
description: Run a project through the Ralph loop - orchestrator for multi-task execution
allowed-tools: Task, Read, Write, Glob, Grep, Bash, AskUserQuestion
argument-hint: [project-name] or [--resume project] or [--status]
---

# /run-project - Project Orchestrator Loop

The Ralph loop orchestrator. Manages a project from start to finish, spawning task executors for each story.

**Arguments:** $ARGUMENTS

## Ralph Principle

"A for loop beats elaborate orchestration."

- Orchestrator stays lean (<30% context)
- Spawns sub-agents for implementation
- One task at a time, one project at a time
- Fresh context per task prevents rot

## Usage

```bash
# Start new project execution
/run-project campaign-migration

# Resume paused project
/run-project --resume campaign-migration

# Check all project status
/run-project --status
```

## Process

### 1. Parse Arguments

**If `--status`:**
- Scan `workspace/orchestrator/*/state.json`
- Display all project statuses
- Exit

**If `--resume {project}`:**
- Load existing state from `workspace/orchestrator/{project}/state.json`
- Find last completed task
- Continue from next task

**If `{project}`:**
- Check if `projects/{project}/prd.json` exists
- Check if state.json exists (offer resume or restart)
- Initialize fresh state if new

### 2. Load Project

Read `projects/{project}/prd.json`:
```javascript
const prd = JSON.parse(read(`projects/${project}/prd.json`))
const stories = prd.userStories || prd.features
const total = stories.length
const completed = stories.filter(s => s.passes).length
const remaining = stories.filter(s => !s.passes)
```

### 3. Display Status

```
Project: {project}
PRD: projects/{project}/prd.json

Progress: {completed}/{total} stories ({percentage}%)
[=========>          ]

Completed:
  - {id}: {title}
  - {id}: {title}

Remaining:
  1. {id}: {title} (next)
  2. {id}: {title}
  3. {id}: {title}

Continue execution? [Y/n]
```

### 4. Initialize/Load State

**New project:**
```bash
mkdir -p workspace/orchestrator/{project}
```

Write `workspace/orchestrator/{project}/state.json`:
```json
{
  "project": "{project}",
  "prd_path": "projects/{project}/prd.json",
  "status": "in_progress",
  "started_at": "{ISO8601}",
  "updated_at": "{ISO8601}",
  "progress": {
    "total": 11,
    "completed": 0,
    "failed": 0,
    "in_progress": 0
  },
  "current_task": null,
  "completed_tasks": [],
  "learnings_pushed": 0,
  "retries": 0
}
```

Create `workspace/orchestrator/{project}/progress.txt`:
```
# Project: {project}
# Started: {date}

```

### 5. The Loop

```
while (remaining tasks with passes: false):

    1. SELECT next task
       - Priority order from PRD
       - Respect dependsOn (skip if dependencies not complete)
       - First incomplete task that's unblocked

    2. LOG to progress.txt
       [{timestamp}] Starting: {task.id} - {task.title}

    3. UPDATE state
       current_task = {id, started_at}
       progress.in_progress = 1

    4. SPAWN task executor
       Use Task tool:
       Task({
         subagent_type: "general-purpose",
         prompt: "Execute /execute-task {project}/{task.id}

                  This task: {task.title}
                  Acceptance: {task.acceptance_criteria}

                  Complete all phases. Return when done.",
         description: "execute-task {task.id}"
       })

    5. WAIT for completion
       Task tool returns when sub-agent finishes

    6. READ results
       - Check workspace/orchestrator/{project}/executions/{task.id}.json
       - Check if task.passes updated in PRD
       - Check workspace/learnings/{project}/{task.id}.json

    7. PROCESS results
       If success:
         - Update state: completed_tasks.push({...})
         - Update progress counts
         - Log to progress.txt
         - Continue loop

       If failure:
         - Update state: failed++, status: "paused"
         - Log error to progress.txt
         - Present recovery options
         - Wait for user decision

    8. CHECK context budget
       If orchestrator feels slow or context > 30%:
         - Save state
         - Suggest: "Context filling. Run /run-project --resume {project}"
```

### 6. Handle Task Completion

After each successful task:

```
[{timestamp}] Completed: {task.id} - {task.title}
  Workers: {workers used}
  Time: {duration}
  Learning: workspace/learnings/{project}/{task.id}.json

Progress: {completed}/{total} ({percentage}%)
```

Update state.json:
```json
{
  "completed_tasks": [
    ...,
    {
      "id": "{task.id}",
      "completed_at": "{ISO8601}",
      "workers_used": ["backend-engineer", "code-reviewer"],
      "duration_ms": 180000,
      "learning_id": "learn-{task.id}"
    }
  ]
}
```

### 7. Handle Task Failure

If task executor reports failure:

```
Task Failed: {task.id} - {task.title}

Error: {error details}
Phase: {which worker failed}
Attempts: {retry count}

Options:
1. Retry this task
2. Skip and continue to next task
3. Pause project (fix manually, then --resume)
4. Abort project
```

Use AskUserQuestion for decision.

### 8. Complete Project

When all stories have `passes: true`:

#### 8a. Generate Report

```
Project Complete: {project}

Summary:
  Total tasks: {total}
  Completed: {completed}
  Duration: {total time}

Tasks:
  - {id}: {title} ({duration})
  - {id}: {title} ({duration})
  ...

Workers Used:
  - backend-engineer: {N} tasks
  - frontend-engineer: {N} tasks
  - code-reviewer: {N} tasks

Learnings Generated: {count}
```

#### 8b. Aggregate Learnings

Read all `workspace/learnings/{project}/*.json` and aggregate patterns:

Write to `knowledge/workers/{project}-learnings.md`:
```markdown
# Learnings from {project}

## Patterns That Worked
- {pattern from insights.what_worked}

## Key Decisions
- {aggregated decisions}

## For Future Projects
- {aggregated for_next_time}
```

#### 8c. Update State

```json
{
  "status": "completed",
  "completed_at": "{ISO8601}",
  "progress": {
    "total": 11,
    "completed": 11,
    "failed": 0,
    "in_progress": 0
  }
}
```

#### 8d. Final Log

Append to progress.txt:
```
[{timestamp}] PROJECT COMPLETE
  Total time: {duration}
  Tasks: {count}
  Learnings: {count}
```

### 9. Status Display (--status)

When called with `--status`:

```
Project Status

ACTIVE:
  campaign-migration
    Progress: 5/11 (45%)
    Current: CAM-006 (backend-engineer phase)
    Started: 2h ago

PAUSED:
  (none)

COMPLETED:
  user-auth (3 days ago) - 8/8 tasks
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
  "completed_at": "ISO8601 (if completed)",

  "progress": {
    "total": 11,
    "completed": 5,
    "failed": 0,
    "in_progress": 1
  },

  "current_task": {
    "id": "CAM-006",
    "started_at": "ISO8601",
    "phase": 2,
    "worker": "backend-engineer"
  },

  "completed_tasks": [
    {
      "id": "CAM-001",
      "completed_at": "ISO8601",
      "workers_used": ["product-planner", "backend-engineer", "code-reviewer"],
      "duration_ms": 180000,
      "learning_id": "learn-CAM-001"
    }
  ],

  "failed_tasks": [],

  "learnings_pushed": 5,
  "retries": 1,

  "context_checkpoints": [
    {"at_task": "CAM-003", "reason": "context filling"}
  ]
}
```

## Progress File Format

`workspace/orchestrator/{project}/progress.txt`:
```
# Project: campaign-migration
# Started: 2026-01-24 10:00

[2026-01-24 10:00:15] Starting project execution
[2026-01-24 10:00:20] Task: CAM-001 - Campaign List View (starting)
[2026-01-24 10:15:32] Task: CAM-001 - Campaign List View (completed)
  Workers: product-planner → backend-engineer → code-reviewer
  Duration: 15m 12s
[2026-01-24 10:15:35] Task: CAM-002 - Campaign Detail View (starting)
...
```

## Rules

- **ONE project at a time** - Never run multiple projects concurrently
- **Orchestrator doesn't implement** - Always spawn sub-agents
- **Checkpoint early, checkpoint often** - State survives interruptions
- **Dependencies matter** - Never start task if dependsOn incomplete
- **Learn from every task** - Capture insights, aggregate patterns
- **Fail gracefully** - Pause on errors, offer recovery options

## Integration

### With /newproject
```
/newproject → creates PRD
/run-project {name} → executes PRD
```

### With /nexttask
```
/nexttask shows active projects from /run-project
```

### With /checkpoint
```
/run-project auto-checkpoints between tasks
```

### With /handoff
```
/handoff preserves project state
/run-project --resume continues
```
