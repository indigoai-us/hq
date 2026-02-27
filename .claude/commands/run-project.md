---
description: Run a project through the orchestrator loop - multi-story execution
allowed-tools: Task, Read, Write, Edit, Glob, Grep, Bash
argument-hint: [project-name] or [--resume project] or [--status]
visibility: public
---

# /run-project - Project Orchestrator Loop

Ultra-lean state machine with fresh context per task. Delegates each story entirely to a sub-agent via `/execute-task`, receiving only a structured JSON summary back. Each story gets clean context; nothing accumulates.

**Arguments:** $ARGUMENTS

## Core Pattern (Fresh-Context)

The orchestrator is an **ultra-lean state machine**. It picks stories and delegates each one entirely to a sub-agent via `/execute-task`. The orchestrator:
- Selects the next incomplete story from the PRD
- Spawns ONE sub-agent per story (fresh context per story)
- Receives only a structured JSON summary back
- Updates workspace/orchestrator/state.json after each story
- Never accumulates worker outputs, handoff blobs, or implementation details

## Usage

```bash
/run-project my-app              # Start new
/run-project --resume my-app     # Resume paused
/run-project --status            # Check all projects
```

## Process

### 1. Parse Arguments

**If `--status`:**
- Read `workspace/orchestrator/state.json`
- Display all project statuses
- Exit

**If `--resume {project}`:**
- Load state from `workspace/orchestrator/state.json`
- Read PRD to find next incomplete story
- Continue from next incomplete + unblocked story
- Orchestrator starts with ZERO accumulated context -- only state.json + PRD

**If `{project}`:**
- Resolve project location: search `projects/{project}/prd.json` first, then `companies/*/projects/{project}/prd.json`
- If prd.json **MISSING** everywhere: STOP immediately.
  ```
  ERROR: prd.json not found for {project}.

  /run-project requires prd.json (not README.md).
  Fix: Run /prd {project} to generate prd.json.
  ```
- If prd.json **EXISTS**: validate structure (see Step 2)
- Check if project exists in state.json (offer resume or restart)
- Initialize fresh state if new

### 2. Load Project

Resolve and read prd.json:
```javascript
const prdPath = glob(`projects/${project}/prd.json`)[0]
  || glob(`companies/*/projects/${project}/prd.json`)[0]
const prd = JSON.parse(read(prdPath))

// Strict: userStories required. No fallback.
const stories = prd.userStories
if (!stories || !Array.isArray(stories) || stories.length === 0) {
  STOP: "prd.json has no userStories array (or it's empty)."
}

// Validate each story has required fields
for (const story of stories) {
  const required = ['id', 'title', 'description', 'passes']
  const missing = required.filter(f => !(f in story))
  if (missing.length > 0) {
    STOP: `Story ${story.id || '?'} missing fields: ${missing.join(', ')}`
  }
}

// Filter: skip archived stories
const active = stories.filter(s => !s.archive)
const total = active.length
const completed = active.filter(s => s.passes).length
const remaining = active.filter(s => !s.passes)
```

### 3. Ask Work Mode

**ALWAYS ask the user before starting. GHQ never uses feature branches.**

```
Project: {project}
Progress: {completed}/{total} ({percentage}%)

Remaining:
  1. {id}: {title} (next)
  2. {id}: {title}
  ...

Work mode (GHQ never uses feature branches):
  1. Work on main (simple, direct)
  2. Use a git worktree (isolated, parallel-safe)

Which mode?
```

Use the user's answer to determine work mode. If worktree:
- Create a worktree for the project using `git worktree add`
- All sub-agents work in the worktree directory
- Track `worktree_path` in state.json

If main:
- Verify currently on `main` branch
- All sub-agents work in the repo directory on main

**NEVER create feature branches.** The only two options are main or worktree.

### 4. Initialize/Load State

```bash
mkdir -p workspace/orchestrator
```

Read `workspace/orchestrator/state.json`. Find or create the project entry in the `projects` array:

```json
{
  "name": "{project}",
  "state": "IN_PROGRESS",
  "prdPath": "{resolved prdPath}",
  "startedAt": "{ISO8601}",
  "updatedAt": "{ISO8601}",
  "storiesComplete": 0,
  "storiesTotal": "{total}",
  "currentStory": null,
  "completedStories": [],
  "workMode": "main|worktree",
  "worktreePath": null,
  "checkedOutFiles": [],
  "retries": 0
}
```

If the project already exists in state.json, update its `state` to `"IN_PROGRESS"` and refresh counts.

### 5. The Loop

The orchestrator is an **ultra-lean state machine**. It picks stories and delegates everything to sub-agents. Classification, skill selection, skill chains, PRD updates, and learning capture all happen inside the sub-agent via `/execute-task`. The orchestrator NEVER accumulates implementation context.

```
while (remaining stories with passes: false):

    5a. SELECT next story
        - Priority order from PRD
        - Respect dependsOn (skip if deps incomplete)
        - Check file lock conflicts (see 5a.1)
        - First incomplete + unblocked + non-conflicting story

        Report:
        ```
        ────────────────────────────────────
        Next: {story.id} - {story.title}
        Progress: {completed}/{total} ({percentage}%)
        ────────────────────────────────────
        ```

    5a.1 FILE LOCK CONFLICT CHECK

        Read `.file-locks.json` in the target repo (from prd metadata.repoPath).
        If file does not exist, skip this check.

        For each candidate story (incomplete + deps met):
        - Compare story `files` against active locks
        - If ANY overlap: skip this story, try next candidate

        If ALL remaining stories conflict:
        ```
        All remaining stories have file conflicts.
        Locked files: {list with owners}
        Options:
        1. Wait (locks may release when other sessions complete)
        2. Force-clear stale locks
        3. Abort
        ```

    5b. EXECUTE story via sub-agent

        Spawn a SINGLE sub-agent for the entire story.
        The sub-agent handles classification, skill selection,
        the full skill chain, PRD update, execution state,
        and learning capture -- all via /execute-task.

        Task({
          description: "Execute {story.id}: {story.title}",
          prompt: "IMPORTANT: Do NOT use EnterPlanMode or TodoWrite.
                   Execute /execute-task IMMEDIATELY -- it handles all planning,
                   classification, skill selection, and execution internally.

                   Run /execute-task {project}/{story.id}

                   After completion, output ONLY this structured JSON:
                   {
                     \"task_id\": \"{story.id}\",
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

    5c. POST-STORY (orchestrator side -- minimal)

        Parse the sub-agent's JSON output.

        i. If status == "completed":
           - Update state.json project entry:
             completedStories.push({id, completedAt, workersUsed})
             storiesComplete++
             currentStory = null
             updatedAt = now

        ii. If status == "failed" or "blocked":
            - Log error
            - Ask user:
              1. Retry this story
              2. Skip and continue
              3. Pause project (run /run-project --resume {project})

    5d. PROGRESS DISPLAY

        After each story completes, show progress:
        ```
        ════════════════════════════════════
        PROJECT: {project}
        PROGRESS: {completed}/{total} ({percentage}%)

        Completed this session:
          {id}: {summary} ✓
          {id}: {summary} ✓

        Remaining:
          {id}: {title}
          {id}: {title}
        ════════════════════════════════════
        ```

    5e. AUTO-REANCHOR (between stories, silent)

        After processing each story result, refresh context:
        1. Re-read PRD from disk (sub-agent may have updated passes/notes)
        2. Refresh git state: `git log --oneline -3`
        3. If story failed: search for known fixes via `qmd vsearch "{error}" --json -n 5`

    5f. CONTEXT SAFETY NET

        If > 8 stories completed this session OR context heavy:
          - Save state.json
          - Print: "Context boundary reached. Run: /run-project --resume {project}"
          - STOP
```

### 6. Handle Story Failure

If a sub-agent returns failed/blocked:

```
Story {story.id} failed: {summary}

Options:
1. Retry this story
2. Skip and continue to next story
3. Pause project (/run-project --resume {project})
4. Abort
```

Use the user's response to decide next action.

### 7. Complete Project

When all active (non-archived) stories have `passes: true`:

**Update state:**
- Set project `state: "COMPLETE"` in state.json
- Set `completedAt: "{ISO8601}"`

**Display completion report:**
```
════════════════════════════════════
PROJECT COMPLETE: {project}

Stories: {completed}/{total}
Skills used: {aggregated from completedStories}
════════════════════════════════════
```

**If worktree mode -- ask user:**
```
Project completed in worktree. How should we merge?

1. Merge directly to main
2. Create a PR for review
```

If merge: `git checkout main && git merge {worktree-branch}`
If PR: `gh pr create --title "{project}: all stories complete" --body "..."`

**Ask about archiving:**
```
Archive this project? (moves PRD to projects/archive/{project}/)

1. Yes, archive it
2. No, keep it active
```

If archive:
- `mkdir -p projects/archive/{project}`
- Move prd.json and README.md to `projects/archive/{project}/`
- Update state.json: set project `state: "ARCHIVED"`

**Post-project cleanup:**
1. `qmd update 2>/dev/null || true` -- reindex all changes
2. Commit if dirty: `git add -A && git commit -m "project-complete: {project}"`

### 8. Status Display (--status)

Read `workspace/orchestrator/state.json` and display:

```
Project Status

ACTIVE:
  {name} -- {storiesComplete}/{storiesTotal} ({pct}%) -- {currentStory || "idle"}

PAUSED:
  (none)

COMPLETED:
  {name} -- {storiesComplete}/{storiesTotal}

ARCHIVED:
  {name}
```

## State File Format

`workspace/orchestrator/state.json`:
```json
{
  "projects": [
    {
      "name": "my-app",
      "state": "READY|IN_PROGRESS|PAUSED|COMPLETE|ARCHIVED",
      "prdPath": "projects/my-app/prd.json",
      "startedAt": "ISO8601",
      "updatedAt": "ISO8601",
      "completedAt": null,
      "storiesComplete": 3,
      "storiesTotal": 8,
      "currentStory": null,
      "completedStories": [
        {"id": "US-001", "completedAt": "ISO8601", "workersUsed": ["architect", "backend"]}
      ],
      "workMode": "main",
      "worktreePath": null,
      "checkedOutFiles": [],
      "retries": 0
    }
  ]
}
```

## Rules

- **ONE project at a time**
- **Sub-agent per story** -- each story runs in its own Task() sub-agent via `/execute-task`. The orchestrator NEVER executes skill phases directly.
- **Context discipline** -- the orchestrator stores ONLY story_id, status, and 1-sentence summary per story. No skill outputs, no handoff blobs, no file lists.
- **Fresh context per story** -- sub-agent context is freed when it returns.
- **Resume is first-class** -- `--resume` is how multi-session projects continue. Not a fallback -- the expected path for large projects.
- **Back pressure is mandatory** -- enforced inside `/execute-task`, not by the orchestrator.
- **Fail fast** -- pause on errors, surface to user.
- **prd.json is required** -- never read or fall back to README.md.
- **Validate prd.json on load** -- fail loudly on missing/malformed fields.
- **Sub-agents must NOT use EnterPlanMode** -- /execute-task is the planning pipeline.
- **Work mode: main or worktree only** -- NEVER create feature branches. Always ask the user which mode before starting.
- **If worktree: ask merge or PR on completion** -- never assume one or the other.
- **Zero accumulation** -- receives only structured JSON back from sub-agents. Discards everything else.

## Integration

- `/prd` creates PRD -> `/run-project {name}` executes it
- `/execute-task {project}/{id}` runs single story (standalone or as sub-agent)
- `/run-project --resume` continues from next incomplete story with fresh context
