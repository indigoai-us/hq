---
name: run-project
description: "Routes to scripts/run-project.sh for process-isolated project execution. NEVER executes stories inline unless --inline is explicitly passed."
allowed-tools: Read, Bash(bash:*), Bash(jq:*), Bash(cat:*), Bash(tail:*), Bash(kill:*), Bash(ls:*), Bash(mkdir:*), Bash(nohup:*), Bash(echo:*), Bash(sleep:*), Bash(qmd:*)
argument-hint: "{project} [--status] [--resume] [--dry-run] [--inline]"
---

# Run Project — Script Orchestrator

**CRITICAL: This skill routes to `scripts/run-project.sh`.** Stories execute in isolated `claude -p` subprocesses — NOT inline in this session. The only exception is `--inline` (explicit opt-in). See policy: `.claude/policies/run-project-no-inline.md`.

For full execution details, flags, swarm mode, and worked examples: `.claude/commands/run-project.md`.

**User's input:** $ARGUMENTS

---

## Step 1 — Parse Arguments

Extract from `$ARGUMENTS`:
- `{project}` — project name (required unless `--status`)
- `--status` → run `bash scripts/run-project.sh --status` synchronously, display output, stop
- `--dry-run` → run `bash scripts/run-project.sh --dry-run {project}` synchronously, display output, stop
- `--help` → display flags from `.claude/commands/run-project.md`, stop
- `--inline` → **route to inline execution** per `.claude/commands/run-project.md` "Inline Execution" section. Load that section and follow it
- All other flags pass through verbatim to `run-project.sh`

If no arguments: error — project name required.

## Step 2 — Validate PRD

1. Resolve PRD: `companies/{co}/projects/{project}/prd.json` (use `qmd search` if needed)
2. Read prd.json → display: project name, company, total stories, completed, remaining
3. `mkdir -p workspace/orchestrator/{project}`

## Step 3 — Launch Background

```bash
cd /Users/{your-name}/Documents/HQ && \
  nohup bash scripts/run-project.sh {project} {passthrough_flags} --no-permissions \
  > workspace/orchestrator/{project}/run.log 2>&1 &
echo "PID:$!"
```

Capture PID. Announce: `Launched run-project.sh for {project} (PID {pid}). Monitoring progress...`

## Step 4 — Poll Loop

Every ~30 seconds:
1. Read state: `jq -r '.status' workspace/orchestrator/{project}/state.json`
2. Read new progress: `tail -n +{last_line} workspace/orchestrator/{project}/progress.txt`
3. Check PID: `kill -0 {pid} 2>/dev/null && echo "ALIVE" || echo "DEAD"`
4. Print new progress lines
5. Branch:
   - `in_progress` + alive → continue polling
   - `paused` → surface pause reason from `run.log`, prompt user: resume / abort
   - `completed` → exit loop → Step 5
   - PID dead + not completed → tail `run.log`, report error

Poll ceiling: 4 hours. After that, offer to detach.

## Step 5 — Completion Summary

1. Read final `state.json` + `progress.txt`
2. Read `workspace/reports/{project}-summary.md` if exists
3. Display formatted summary
