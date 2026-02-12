---
description: Run a project through the Ralph loop - orchestrator for multi-task execution
allowed-tools: Task, Read, Write, Glob, Grep, Bash, AskUserQuestion
argument-hint: [project-name] or [--resume project] or [--status]
visibility: public
---

# /run-project - Project Orchestrator Loop

Ralph loop with fresh context per task. The orchestrator is an ultra-lean state machine — it delegates each task entirely to a sub-agent via `/execute-task`, receiving only a structured summary back. Each task gets clean context; nothing accumulates.

**Arguments:** $ARGUMENTS

## Core Pattern (Ralph Fresh-Context)

The orchestrator is an **ultra-lean state machine**. It picks tasks and delegates each one entirely to a sub-agent via `/execute-task`. The orchestrator:
- Selects the next incomplete task from the PRD
- Spawns ONE sub-agent per task (fresh context per task)
- Receives only a structured JSON summary back
- Updates state.json and progress.txt
- Never accumulates worker outputs, handoff blobs, or implementation details

Classification, worker selection, worker pipelines, PRD updates, and learning capture all happen inside the sub-agent. This mirrors Pure Ralph's fresh-terminal-per-task model.

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

**If `--resume {project}` (first-class operation — not a fallback):**
- Load state from `workspace/orchestrator/{project}/state.json`
- Read PRD to find next incomplete task
- Continue from next incomplete + unblocked task
- The orchestrator starts with ZERO accumulated context — only state.json + PRD
- If a task was mid-pipeline (has execution state with incomplete phases), `/execute-task` will resume from the incomplete phase inside its sub-agent

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

### 3.5 Launch Dashboard (silent, non-blocking)

Auto-open the HQ Dashboard so the user can watch progress in real-time:

```bash
# Only launch if not already running (uses pre-built release binary for instant startup)
HQ_DASH=~/Documents/HQ/repos/private/hq-dashboard/src-tauri/target/release/hq-dashboard
pgrep -f "hq-dashboard" > /dev/null 2>&1 || \
  ([ -x "$HQ_DASH" ] && "$HQ_DASH" > /dev/null 2>&1 &)
```

Skip silently if dashboard repo doesn't exist or build fails. Never block execution on dashboard launch.

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

The orchestrator is an **ultra-lean state machine**. It picks tasks and delegates everything to sub-agents. Classification, worker selection, worker pipelines, PRD updates, and learning capture all happen inside the sub-agent via `/execute-task`. The orchestrator NEVER accumulates implementation context.

```
while (remaining tasks with passes: false):

    5a. SELECT next task
        - Priority order from PRD
        - Respect dependsOn (skip if deps incomplete)
        - First incomplete + unblocked task

        Report:
        ```
        Next: {task.id} - {task.title}
        Progress: {completed}/{total}
        ```

    5a.5 SYNC LINEAR (if configured, best-effort)

        If the selected task has `linearIssueId` and prd.metadata has `linearCredentials`:
        ```bash
        LINEAR_KEY=$(cat {prd.metadata.linearCredentials} | python3 -c "import sys,json; print(json.load(sys.stdin)['apiKey'])")
        IN_PROGRESS_STATE="{prd.metadata.linearInProgressStateId}"
        curl -s -X POST https://api.linear.app/graphql \
          -H "Content-Type: application/json" \
          -H "Authorization: $LINEAR_KEY" \
          -d "{\"query\": \"mutation { issueUpdate(id: \\\"{task.linearIssueId}\\\", input: { stateId: \\\"$IN_PROGRESS_STATE\\\" }) { success } }\"}"
        ```
        Skip silently if not configured. Never block execution on Linear sync.

    5b. EXECUTE task via sub-agent

        Spawn a SINGLE sub-agent for the entire task.
        The sub-agent handles classification, worker selection,
        the full worker pipeline, PRD update, execution state,
        and learning capture — all via /execute-task.

        Task({
          subagent_type: "general-purpose",
          description: "Execute {task.id}: {task.title}",
          prompt: "IMPORTANT: Do NOT use EnterPlanMode or TodoWrite.
                   Execute /execute-task IMMEDIATELY — it handles all planning,
                   classification, worker selection, and execution internally.

                   Run /execute-task {project}/{task.id}

                   Note: If the task involves batch human decisions (classifying,
                   reviewing, or triaging 5+ items), use /decide to spawn the
                   decision-ui instead of AskUserQuestion.

                   After completion, output ONLY this structured JSON:
                   {
                     \"task_id\": \"{task.id}\",
                     \"status\": \"completed|failed|blocked\",
                     \"summary\": \"1-sentence summary\",
                     \"workers_used\": [\"list\"],
                     \"back_pressure\": {
                       \"tests\": \"pass|fail|skipped\",
                       \"lint\": \"pass|fail|skipped\",
                       \"typecheck\": \"pass|fail|skipped\",
                       \"build\": \"pass|fail|skipped\"
                     }
                   }"
        })

        The sub-agent's full context (worker outputs, handoff blobs,
        file diffs, error traces) is freed when it returns.
        Only the structured JSON crosses the boundary.

    5c. POST-TASK (orchestrator side — minimal)

        Parse the sub-agent's JSON output.

        i. If status == "completed":
           - Update state.json:
             completed_tasks.push({id, completed_at, workers_used})
             progress.completed++
             current_task = null
           - Log 1-line to progress.txt:
             [{timestamp}] {task.id}: {summary} ({completed}/{total})

        ii. If status == "failed" or "blocked":
            - Log error
            - AskUserQuestion:
              1. Retry this task
              2. Skip and continue
              3. Pause project (run /run-project --resume {project})

        iv. Update `workspace/orchestrator/INDEX.md` with new progress.

        v. DISCARD everything else.
             The orchestrator MUST NOT store worker outputs,
             handoff blobs, file lists, or error traces.
             Only retain: task_id, status, 1-sentence summary.

    5c.5 AUTO-REANCHOR (between tasks, silent)

        After processing each task result, refresh context:
        1. Re-read PRD from disk (sub-agent may have updated passes/notes)
        2. Refresh git state: `git log --oneline -3`
        3. If task failed: search for known fixes via `qmd vsearch "{error}" --json -n 5`
           (searches across all knowledge, worker yamls, and command files)
        4. Re-read CLAUDE.md `## Learned Rules`
           (another session may have added rules via /learn)

        This is silent — no user interaction. Prevents stale context
        between tasks, especially for multi-session projects.

    5d. CONTEXT SAFETY NET

        If > 10 tasks completed this session OR context heavy:
          - Save state.json
          - Print: "Context boundary reached. Run: /run-project --resume {project}"
          - STOP

        This rarely triggers because each task sub-agent releases
        its context. But it provides a hard ceiling.
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

**Aggregate learnings:**
1. Scan Tier 3 logs: `workspace/learnings/learn-*.json` matching this project
2. Identify repeated patterns (same rule triggered 3+ times across tasks)
3. Promote repeated patterns to Tier 1 via `/learn` (severity: high, source: pattern-repetition)
4. Write project retrospective to `workspace/reports/{project}-retro.md`

**Update state:** `status: "completed"`, `completed_at: "{ISO8601}"`

**Update INDEX.md files:** Regenerate `projects/INDEX.md` and `workspace/orchestrator/INDEX.md` per `knowledge/public/hq-core/index-md-spec.md`.

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
| api_development | backend-dev → [codex-coder] → code-reviewer → [codex-reviewer] → [codex-debugger] → dev-qa-tester |
| ui_component | frontend-dev → [codex-coder] → motion-designer → code-reviewer → [codex-reviewer] → [codex-debugger] → dev-qa-tester |
| full_stack | architect → database-dev → backend-dev → frontend-dev → [codex-coder] → code-reviewer → [codex-reviewer] → [codex-debugger] → dev-qa-tester |
| codex_fullstack | architect → database-dev → codex-coder → codex-reviewer → dev-qa-tester |
| content | content-brand → content-product → content-sales → content-legal |
| enhancement | (relevant dev) → code-reviewer → [codex-debugger] |

Prepend **product-planner** if task spec is unclear or acceptance criteria are vague.

`[brackets]` = optional codex workers, included when `worker_hints` contain codex or task indicators match codex patterns. **codex_fullstack** uses codex-coder instead of backend-dev/frontend-dev for Codex-native generation.

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
- **Sub-agent per task** — each task runs in its own Task() sub-agent via `/execute-task`. The orchestrator NEVER executes worker phases directly.
- **Context discipline** — the orchestrator stores ONLY task_id, status, and 1-sentence summary per task. No worker outputs, no handoff blobs, no file lists.
- **Fresh context per task** — sub-agent context is freed when it returns.
- **Resume is first-class** — `--resume` is how multi-session projects continue. Not a fallback — the expected path for large projects.
- **Back pressure is mandatory** — enforced inside `/execute-task`, not by the orchestrator
- **Fail fast** — pause on errors, surface to user
- **prd.json is required** — never read or fall back to README.md
- **Validate prd.json on load** — fail loudly on missing/malformed fields
- **Sub-agents must NOT use EnterPlanMode** — /execute-task is the planning pipeline; ad-hoc planning bypasses the PRD orchestrator

## Integration

- `/prd` → creates PRD → `/run-project {name}` executes it
- `/execute-task {project}/{id}` → runs single task with same pipeline (standalone or as sub-agent)
- `/run-project --resume` → continues from next incomplete task with fresh context
- `/nexttask` → shows active projects from /run-project
