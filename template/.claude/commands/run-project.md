---
description: Run a project through the Ralph loop - orchestrator for multi-task execution
allowed-tools: Bash, Read, Write, AskUserQuestion
argument-hint: [project-name] or [--status] or [--help]
visibility: public
---

# /run-project - Ralph Loop Project Orchestrator

Ralph loop with process-level isolation. Each story runs as an independent `claude -p` headless invocation via `scripts/run-project.sh`. No context ceiling. Fresh context per task.

**Arguments:** $ARGUMENTS

## Ralph Principle

"Pick a task, complete it, commit it."

- Fresh context per task (independent `claude -p` process)
- Sub-agents do heavy lifting via `/execute-task`
- Back pressure keeps code on rails
- Handoffs preserve context between workers

## Usage

Launch the bash orchestrator:

```bash
# Start or resume (auto-detected)
bash scripts/run-project.sh {project} --no-permissions

# Explicit resume
bash scripts/run-project.sh --resume {project} --no-permissions

# Dry run — show story order without executing
bash scripts/run-project.sh --dry-run {project}

# With options
bash scripts/run-project.sh {project} --max-budget 10 --model sonnet --no-permissions --verbose

# Check all project statuses
bash scripts/run-project.sh --status
```

## Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--resume` | auto-detected | Resume from next incomplete story |
| `--status` | — | Show all project statuses, exit |
| `--dry-run` | — | Show story order without executing |
| `--max-budget N` | 5 | Per-story cost cap in USD |
| `--model MODEL` | (worker default) | Override model for all stories |
| `--no-permissions` | off | Pass `--dangerously-skip-permissions` to claude |
| `--retry-failed` | off | Re-run previously failed stories only |
| `--timeout N` | none | Per-story wall-clock timeout in minutes |
| `--verbose` | off | Show full claude output |

## How It Works (Ralph Loop)

### Task Selection (per iteration)

Selection order: **deps resolved → no file lock conflicts → lowest priority → array order**

1. Re-read PRD (sub-agent may have updated `passes`)
2. Filter: incomplete stories with all `dependsOn` satisfied
3. Filter: no file lock conflicts (checks `{repo}/.file-locks.json`)
4. Sort by `priority` field (lowest first)
5. First match = next task

### Per-Task Execution

For each selected story:

1. **PRE-TASK**: Branch setup (create/checkout `branchName` from `baseBranch`)
2. **PRE-TASK**: Linear sync → In Progress + comment (if `linearIssueId` configured)
3. **PRE-TASK**: Update `state.json` current_task
4. **EXECUTE**: `claude -p "/execute-task {project}/{story-id}"` as independent process
   - Model resolution: `--model` CLI flag > story `model_hint` > default
   - `/execute-task` handles: classification, worker selection, worker pipeline, PRD update, back pressure, learning capture
5. **POST-TASK**: Validate git state (auto-commit if sub-agent forgot)
6. **POST-TASK**: Codex CLI review safety net — `codex review` on latest changes (saved to `{story-id}.codex-review.md`). Flags critical issues. Best-effort, never blocks.
7. **POST-TASK**: Check `prd.json` `passes` field (source of truth)
8. **POST-TASK**: Linear sync → Done + comment (if configured)
9. **POST-TASK**: Update `state.json` + `progress.txt`
10. **POST-TASK**: `qmd update` reindex

### Regression Gates

Every 3 completed stories: run `metadata.qualityGates` commands from prd.json.
Interactive: retry/skip/pause/abort. Non-interactive: auto-pause on failure.

### Failure Handling

Interactive (terminal): retry / skip / pause / abort prompt.
Non-interactive (headless): auto-retry once, then skip to retry queue.
End-of-run: retry pass for all queued failures.

### Completion Flow

When all stories have `passes: true`:

1. **Board sync** → `done`
2. **Summary report** → `workspace/reports/{project}-summary.md`
3. **INDEX.md** — flag for rebuild (deferred to `/cleanup`)
4. **Manifest verification** — check repos/workers registered
5. **qmd reindex** — final search index update
6. **State** → `status: "completed"`

State: `workspace/orchestrator/{project}/state.json` + `progress.txt`

## --status (in-session)

If $ARGUMENTS is `--status`:
1. Run `bash scripts/run-project.sh --status`
2. Display formatted output

## Direct Execution (in-session fallback)

If running the bash script isn't possible (e.g., no `claude` CLI available), the command can still be invoked in-session. In that case, run:

```bash
bash scripts/run-project.sh $ARGUMENTS
```

If that fails, fall back to the legacy pattern: spawn Task() sub-agents per story via `/execute-task`, with a 10-task context safety net.

## Rules

- **prd.json required** — never fall back to README.md
- **`passes` field is source of truth** — set by `/execute-task`, checked by orchestrator
- **Git validation after every story** — catches sub-agent commit failures
- **File lock awareness** — skip stories with locked files, try next candidate
- **Model hints** — story-level `model_hint` respected (CLI `--model` overrides)
- **Linear sync** — best-effort, never blocks execution
- **Regression gates** — `metadata.qualityGates` run every 3 stories
- **Resume is first-class** — auto-detected from state.json
- **Codex CLI mandatory** — at least one codex step (review or exec) required per code task. Sub-agent prompt enforces it; orchestrator runs fallback `codex review` post-task
- **Back pressure** — enforced inside `/execute-task`, not by orchestrator

## Integration

- `/prd` → creates PRD → `/run-project {name}` executes it
- `/execute-task {project}/{id}` → runs single task (standalone or headless)
- `/run-project --resume` → continues from next incomplete story
- `/nexttask` → shows active projects
