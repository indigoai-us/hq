---
description: Scan HQ and suggest next tasks or projects to work on
allowed-tools: Read, Glob, Bash, AskUserQuestion
visibility: public
---

# /nexttask - Find Work

Scan HQ to surface actionable work. Prioritize by: beads tasks, checkpoints, projects.

## Process

### 1. Check Beads (Primary Source)
```bash
bd list --status open --limit 10
```
Beads is the canonical task tracker. Open issues are the primary work queue.

### 2. Check Checkpoints (In-Progress Work)
```
workspace/checkpoints/*.json
```
Look for recent checkpoints with `next_steps`. These are work that was started.

Also check `workspace/checkpoints/handoff.json` for explicit handoffs.

### 3. Check Projects (Secondary)
```
projects/*/prd.json
```
Scan for projects with incomplete features (beads syncs from PRDs, so this is backup).

## Output Format

```
Next Tasks:

BEADS (open issues):
  1. [PROJECT-123] Task title
  2. [PROJECT-456] Another task

IN PROGRESS (checkpoints):
  3. skills-redesign - "Rewriting HQ skills per plan"
     Next: Move content skills to worker

PROJECTS (with work):
  4. customer-cube - 3 features remaining

Pick a number, or:
  /run {worker}    Run a worker skill
  /prd             Create a new project
```

## Priority Rules

1. **Handoff work** - explicit continuations from last session
2. **Beads open issues** - canonical task queue
3. **In-progress checkpoints** - finish what was started
4. **Projects with defined features** - clear work to do

## After Presenting

Use AskUserQuestion:
- "Which task to work on?"
- Options: numbered list + "Something else"

Then execute the chosen work in the current session.
