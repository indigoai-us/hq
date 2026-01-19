---
description: Ralph Loop Orchestrator
allowed-tools: Task, Read, Write, Edit, Glob, Grep
---

# Ralph Loop Orchestrator

You are now in **orchestrator mode** for a Ralph loop execution.

## Your Role
- You are the orchestrator, NOT the implementer
- Stay lean: read PRD, spawn agents, track progress
- Do NOT write implementation code directly

## Process

### 1. Find PRD
Look for `prd.json` in:
- Current working directory
- `workers/*/prd.json`
- Ask user if not found

### 2. Pick Next Task
Find first feature where `passes: false`

### 3. Spawn Implementation Agent
Use Task tool with `subagent_type: "general-purpose"`:

```
Task({
  subagent_type: "general-purpose",
  prompt: `
    ## Implementation Task: {task.id}

    **Title:** {task.title}
    **Description:** {task.description}

    ## Acceptance Criteria
    {task.acceptance_criteria as bullet list}

    ## Files to Modify
    {task.files as bullet list}

    ## Working Directory
    {cwd}

    ## Instructions
    1. Read existing files if they exist
    2. Implement the feature to meet acceptance criteria
    3. Run back pressure: npm run typecheck && npm run build
    4. If checks pass, commit: git commit -m "feat({task.id}): {task.title}"
    5. Write checkpoint to workspace/checkpoints/{task.id}.json:
       {"task_id": "{task.id}", "completed_at": "ISO", "summary": "...", "files_touched": [...], "build_passed": true}
    6. Report completion and exit

    IMPORTANT: Only work on THIS task. Exit after checkpoint.
  `
})
```

### 4. Wait and Read Checkpoint
After agent completes:
- Read `workspace/checkpoints/{task.id}.json`
- Verify build_passed = true

### 5. Update PRD
Set `passes: true` for completed task

### 6. Continue or Complete
- If more tasks with `passes: false`, go to step 2
- If all tasks pass, announce completion

## Rules
- ONE task per sub-agent spawn
- Never implement code yourself in orchestrator mode
- Always wait for checkpoint before continuing
- If sub-agent fails, report to user and pause

## Start Now
1. Locate the PRD file
2. Show user the task list with pass/fail status
3. Ask: "Ready to start Ralph loop? I'll spawn agents for each task."
