---
description: Run a project through the Ralph loop - orchestrator for multi-task execution
allowed-tools: Bash, Read, Write, AskUserQuestion
argument-hint: [project-name] or [--status] or [--help]
visibility: public
---

<!-- THIN-ROUTER SPLIT — this .md is the canonical docs/examples/flags source. The paired SKILL.md is a minimal bash wrapper that execs scripts/run-project.sh. They stay forked on purpose: one is human-facing docs, the other is a dispatch shim. -->

# /run-project - Ralph Loop Project Orchestrator

Ralph loop orchestrator. All execution routes through `scripts/run-project.sh` — the single spawner for `claude -p` process isolation, worktree management, swarm mode, codex autofix, regression gates, and retry queues.

**Arguments:** $ARGUMENTS

## Ralph Principle

"Pick a task, complete it, commit it."

- Fresh context per task (`claude -p` process isolation)
- Sub-agents do heavy lifting via `/execute-task`
- Back pressure keeps code on rails
- Handoffs preserve context between workers

## Execution Modes

| Mode | When | How |
|------|------|-----|
| **Default** | `/run-project` invoked interactively | `run-project.sh` in background, Claude polls state files |
| **inline** | `--inline` flag | Plan from PRD → user approves → execute stories in-session via worker sub-agents |
| **tmux** | `--tmux` flag | `run-project.sh` in tmux session (observe from phone) |
| **direct** | `bash scripts/run-project.sh` (CI/nohup/cron) | Direct shell execution |

## In-Session Execution (Default)

When `/run-project` is invoked in an interactive Claude session, it launches `run-project.sh` as a background OS process and monitors progress via state file polling.

### Step 1 — Parse Arguments

Parse `$ARGUMENTS` into project name + passthrough flags:
- `--inline`: route to **Inline Execution** flow (see below) — do NOT launch `run-project.sh`
- `--status`: delegate synchronously via `bash scripts/run-project.sh --status` (display + exit)
- `--dry-run`: delegate synchronously via `bash scripts/run-project.sh --dry-run {project}` (display + exit)
- `--help`: display flags table + exit
- Empty (no project name): error — project name required
- All other flags pass through verbatim to `run-project.sh`

### Step 2 — Validate PRD + Display Summary

1. Resolve PRD path: `companies/{co}/projects/{project}/prd.json` (use qmd search if needed)
2. Read prd.json → display: project name, total stories, completed, remaining
3. Ensure `workspace/orchestrator/{project}/` dir exists (create if not)

### Step 2.4 — Repo-Run Preflight (active-run coordination)

**Why:** Prevents colliding with another live `/run-project` on the same repo.
Policy: `.claude/policies/repo-run-coordination.md`. Registry:
`workspace/orchestrator/active-runs.json`.

1. Resolve `$REPO_PATH` from prd.json (`repoPath` or manifest reverse lookup).
2. Run `bash scripts/repo-run-registry.sh check "$REPO_PATH"`.
3. On exit 0: proceed to Step 2.5.
4. On exit 2 (foreign owner found):
   - The registry prints the owner row(s) to stderr: command, project, PID, started_at.
   - Display them to the user verbatim.
   - Ask the user (AskUserQuestion) to choose:
     - **wait** — abort this `/run-project` invocation; re-run when the owner finishes.
     - **worktree** — create a sibling worktree (`git worktree add ../{repo}-wt-{project}`), cd into it, re-run `/run-project` from the worktree (the new registration will use `scope: worktree:{path}`).
     - **bypass** — pass `--ignore-active-runs` (sets `HQ_IGNORE_ACTIVE_RUNS=1` and appends a JSON audit row to `workspace/learnings/active-run-bypasses.jsonl`). Use only when the owner is verifiably dead.
   - Never bypass silently. Always require explicit user confirmation.

**Flag:** `--ignore-active-runs` — user-gated bypass. On confirmation, export
`HQ_IGNORE_ACTIVE_RUNS=1` for the session environment and continue. Append
`{ts, run_id, bypassed_by, target_repo, reason}` to
`workspace/learnings/active-run-bypasses.jsonl` before launching.

### Step 2.5 — Warm-Start (Checkpoint + Compact)

**Unconditional.** Runs every invocation, regardless of current context usage. Preflight (PRD read, policy load, state rehydration, dry-run decisions) often consumes significant context before the orchestrator is even ready. Warm-start resets the parent session before the long-running poll loop begins.

1. Run `/checkpoint` — writes a thread file capturing: project name, PRD path, incomplete story count, loaded policies, any preflight findings or blockers
2. Run `/compact` — clears conversation context

**Durability note:** All orchestration state is already on disk before this step runs — `workspace/orchestrator/{project}/state.json`, `{repo}/.file-locks.json`, `prd.json`, loaded policy digests. Compaction drops only conversation context, so Step 3's background launch and Step 4's poll loop read fresh from disk and continue without loss.

**Skip conditions:** `--status`, `--dry-run`, and `--help` already exit before this point (Step 1 routes them synchronously), so warm-start never runs for them.

### Step 3 — Launch Background

```bash
# Bash tool with run_in_background: true
cd ~/HQ && \
  nohup bash scripts/run-project.sh {project} {passthrough_flags} --no-permissions \
  > workspace/orchestrator/{project}/run.log 2>&1 &
echo "PID:$!"
```

Capture the PID from output. Announce to user:
> Launched `run-project.sh` for **{project}** (PID {pid}). Monitoring progress...

### Step 4 — Poll Loop

Execute sequential Bash calls every ~30 seconds. Each poll:

1. **Read state**: `jq -r '.status' workspace/orchestrator/{project}/state.json`
2. **Read progress delta**: `tail -n +{last_line_count} workspace/orchestrator/{project}/progress.txt`
3. **Check PID alive**: `kill -0 {pid} 2>/dev/null && echo "ALIVE" || echo "DEAD"`
4. **Print new progress lines** to user (only lines not yet shown)
5. **Branch on status**:
   - `in_progress` + PID alive → sleep 30, continue polling
   - `paused` → read last 20 lines of `run.log`, surface pause reason. Prompt user: **resume** (`bash scripts/run-project.sh --resume {project} --no-permissions`) / **abort** (kill PID)
   - `completed` → exit poll loop → Step 5
   - PID dead + status not `completed` → tail `run.log` for error context, report to user

**Poll ceiling:** After 4 hours (480 cycles), warn user and offer to detach monitoring. Script keeps running — reattach with `/run-project --status`.

### Step 5 — Completion Summary

1. Read final `state.json` → stories completed/failed, regression gate results
2. Read `progress.txt` → full run log
3. Read `workspace/reports/{project}-summary.md` (if generated by completion flow)
4. Display formatted summary to user

### Failure / Pause Handling

The script runs headless (no tty) — it takes non-interactive paths automatically:
- **Story failure**: auto-retry once, then skip to retry queue
- **Regression gate failure**: auto-pause (sets `state.json` status to `paused`)
- Claude's poll loop detects `paused` state and surfaces the choice to the user

## Inline Execution (--inline)

Interactive, plan-first execution in the current session. Best for small-to-medium projects (3-8 stories) where user input is valuable — ambiguous specs, design decisions, creative work.

### Step 1 — Parse + Validate

Same as default mode:
1. Resolve PRD path: `companies/{co}/projects/{project}/prd.json`
2. Read prd.json → display: project name, total stories, completed, remaining
3. Ensure `workspace/orchestrator/{project}/` dir exists

**Incompatible flags** — error immediately if combined with `--inline`:
- `--swarm` (inline is sequential by nature)
- `--tmux` (no background process to observe)
- `--codex-autofix` (user handles issues interactively)

### Step 2 — Generate Plan from PRD

1. Read all stories from prd.json
2. Filter incomplete (`passes: false`), sort by deps → priority → array order
3. For each story, classify task type (same logic as `/execute-task` step 3) and determine worker sequence (step 4)
4. Present numbered implementation plan:

```
## Implementation Plan: {project}

1. **{story-id}**: {title}
   - Workers: architect → backend-dev → code-reviewer
   - Files: {files list from PRD}
   - ACs: {acceptance criteria summary}

2. **{story-id}**: {title}
   ...
```

5. **Enter plan mode** — user reviews, can request reordering or story adjustments
6. Wait for user approval before proceeding

### Step 3 — Load Policies

Same as default: company → repo → global policies. Display count.

### Step 3.5 — Warm-Start (Checkpoint + Compact)

**Unconditional.** Runs after plan approval and policy load, before the first story executes. Inline mode runs all orchestration in-session, so preflight context (plan generation, user review, policy load) must be cleared to preserve headroom for the Ralph loop — which stays in-session for every story.

1. Run `/checkpoint` — writes a thread file capturing: project name, approved plan (story order + workers), loaded policies, pending story list
2. Run `/compact` — clears conversation context

**Durability note:** The approved plan is durable in `prd.json` (`passes` flags + story order) and `workspace/orchestrator/{project}/state.json`. Compaction drops only conversation — the loop resumes reading from disk in Step 4.

**Why both modes warm-start:** Default mode's parent session still runs the poll loop in-process (surfacing progress to the user), so preflight context bloat hurts it too. Inline mode is more obviously affected, but neither mode benefits from carrying preflight context into execution.

### Step 4 — Sequential Story Execution (In-Session Ralph Loop)

For each incomplete story in approved plan order:

1. **Announce**: display story ID, title, full ACs, planned worker sequence
2. **Branch setup**: create/checkout `branchName` from `baseBranch` (if specified in PRD)
3. **Linear sync**: set In Progress (best-effort, non-blocking)
4. **Execute via workers**: spawn worker sub-agents via **Agent tool** (not `claude -p`)
   - Classify task type → select worker sequence (same as `/execute-task` steps 3-4)
   - Each worker gets: story spec + ACs + repo context + policy summaries + prior worker output
   - Workers run sequentially per story (e.g. architect → backend-dev → code-reviewer → QA)
   - Use Agent tool with worker prompt built from `worker.yaml` config + task context
5. **Back pressure**: run `metadata.qualityGates` after workers complete (tests, lint, typecheck)
6. **Commit**: verify all changes committed. Auto-commit if sub-agent forgot
7. **User checkpoint**: report what was done, then ask:
   - **Continue** → proceed to next story
   - **Adjust** → user modifies next story's approach/ACs before execution
   - **Stop** → pause execution, preserve progress (resume later with `--inline --resume`)
8. **Mark complete**: set `passes: true` in prd.json, update `state.json`
9. **Linear sync**: set Done + comment (best-effort)

### Step 5 — Regression Gates

Every 3 completed stories, run full `metadata.qualityGates`. On failure: report to user inline (no auto-pause/retry — user decides).

### Step 6 — Completion

Same as default mode but all inline (no `claude -p` spawning):
1. Board sync → `done`
2. Summary report → `workspace/reports/{project}-summary.md`
3. Doc sweep — run inline via Agent tool (not headless `claude -p`)
4. Document release — run `/document-release` inline
5. INDEX.md rebuild, manifest verification, `qmd update`
6. State → `status: "completed"`

## Headless Bash Execution

Launch the bash orchestrator directly for long-running, unattended execution:

```bash
# Start or resume (auto-detected)
bash scripts/run-project.sh {project} --no-permissions

# Explicit resume
bash scripts/run-project.sh --resume {project} --no-permissions

# Dry run — show story order without executing
bash scripts/run-project.sh --dry-run {project}

# With options
bash scripts/run-project.sh {project} --model sonnet --no-permissions --verbose

# Check all project statuses
bash scripts/run-project.sh --status
```

## Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--resume` | auto-detected | Resume from next incomplete story |
| `--status` | — | Show all project statuses, exit |
| `--dry-run` | — | Show story order without executing |
| `--model MODEL` | (worker default) | Override model for all stories |
| `--no-permissions` | off | Pass `--dangerously-skip-permissions` to claude (auto-set in-session) |
| `--retry-failed` | off | Re-run previously failed stories only |
| `--timeout N` | none | Per-story wall-clock timeout in minutes |
| `--verbose` | off | Show full claude output |
| `--tmux` | off | Launch in tmux session with RC (observe from phone) |
| `--swarm [N]` | off (4) | Run eligible stories in parallel (max N concurrent) |
| `--checkin-interval N` | 180 | Seconds between check-in status prints |
| `--codex-autofix` | off | Auto-fix P1/P2 codex review findings (opt-in) |
| `--inline` | off | Execute in current session with plan-first flow. User stays in the loop |

## How It Works (Ralph Loop)

### Pre-Loop: Load Policies

Before entering the Ralph loop:

1. Read prd.json → extract `metadata.company` (or resolve from `metadata.repoPath` via manifest)
2. Load `companies/{co}/policies/` (skip `example-policy.md`) — read all
3. If `metadata.repoPath` set, check `{repoPath}/.claude/policies/` — read all
4. Load `.claude/policies/` — filter to policies with triggers relevant to "task execution", "deployment", "commit"
5. Pass applicable policy summaries to each `claude -p "/execute-task ..."` invocation context

Ensures orchestrator respects hard constraints (deploy safety, credential isolation) before delegating to execute-task.

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

### Project Reanchor (Mid-Loop Spec Validation)

Every 3 completed stories (same cadence as regression gates), **after** the gate passes and **before** next task selection:

1. Re-read full prd.json — all stories, not just `passes`
2. Read `progress.txt` + recent `executions/*.output.json` + `executions/*.codex-review.md`
3. Evaluate remaining stories:
   - ACs still accurate given implemented work?
   - Did a completed story partially address a later story's work?
   - New required work discovered? (missing routes, data bugs from codex review)
   - Any story now unnecessary?
4. Write reanchor report: `workspace/orchestrator/{project}/reanchor-{n}.md`
5. **In-session (poll loop):** When Claude's poll detects a reanchor report file, surface it to user — apply suggestions / skip / review each
6. **Headless:** Write report, log summary, continue (never auto-modify PRD)

**Must NOT:** Auto-rewrite stories (breaks execute-task's "never rewrite PRD" invariant). Run per-story (too expensive). Block headless execution.

**Integration:**
- In-session loop: after regression gate block, read reanchor report, present to user
- Bash script: `run_project_reanchor()` spawns `claude -p` with reanchor prompt after `run_regression_gate()`

### Swarm Mode (`--swarm`)

When `--swarm [N]` is passed, the orchestrator dispatches eligible stories in parallel:

1. **Candidate selection**: `get_swarm_candidates()` finds stories with resolved deps, declared `files[]`, no file lock conflicts, and no pairwise file overlap
2. **Pre-acquire locks**: Orchestrator writes file locks BEFORE launching background processes (prevents race between concurrent execute-task lock acquisitions)
3. **Per-story worktrees**: Each story gets its own git worktree for branch isolation
4. **Background dispatch**: Each story launches as `claude -p` with `&`, tracked by PID
5. **Monitor loop**: Polls every 15s (`kill -0`), prints check-in status every `--checkin-interval` seconds
6. **Completion processing**: When a PID exits — validate git, codex review, orchestrator writes `passes`, update state
7. **Sequential merge**: Cherry-pick each worktree's commits into main project worktree (no conflicts since files don't overlap)
8. **Cleanup**: Remove worktrees, run regression gate if interval hit

Falls back to sequential for single candidates or stories without `files[]` declared.

**Safety**: Stories without `files[]` in prd.json are never swarmed (conservative — unknown file surface). The orchestrator (not execute-task) writes `passes: true` to prd.json, eliminating concurrent write races.

**Check-ins**: Both swarm and sequential modes print periodic status (story IDs, PIDs, elapsed time, output sizes).

**Config** (`settings/orchestrator.yaml`):
```yaml
swarm:
  max_concurrency: 4
  checkin_interval_seconds: 180
  require_files_declared: true
```

### Failure Handling

Interactive (terminal): retry / skip / pause / abort prompt.
Non-interactive (headless): auto-retry once, then skip to retry queue.
End-of-run: retry pass for all queued failures.

### Completion Flow

When all stories have `passes: true`:

1. **Board sync** → `done`
2. **Summary report** → `workspace/reports/{project}-summary.md`
3. **Doc sweep** — headless `claude -p` invocation updates 4 doc layers:

   a. **Internal docs** (team-facing: tech guides, SOPs, manuals, ontology, taxonomy)
      - `{repoPath}/docs/` or similar MDX dirs
      - New APIs, services, patterns, config not yet documented

   b. **External docs** (customer/vendor-facing documentation)
      - `{repoPath}/docs/` or published doc site
      - User-facing features needing doc updates. Skip if no external surface

   c. **Repo knowledge** (agent context)
      - `{repoPath}/.claude/CLAUDE.md`, `{repoPath}/.claude/policies/`
      - New patterns, gotchas, file locations from project execution

   d. **Company knowledge** (business knowledge)
      - `companies/{co}/knowledge/` — SEPARATE git repo, committed independently
      - Architecture, integration, process docs

   Output: `{execDir}/doc-sweep.output.json`. Non-blocking on failure.

3b. **Document release** — run `/document-release {company} {project}` (or headless `claude -p` with document-release skill).
    Runs the full document-release pipeline (diff analysis → doc audit → apply updates → consistency check → cleanup).
    Non-blocking on failure — log output to `{execDir}/doc-release.output.json`.

4. **INDEX.md** — flag for rebuild (deferred to `/cleanup`)
5. **Manifest verification** — check repos/workers registered
6. **qmd reindex** — final search index update
7. **State** → `status: "completed"`

State: `workspace/orchestrator/{project}/state.json` + `progress.txt`

## --status (in-session)

If $ARGUMENTS is `--status`:
1. Run `bash scripts/run-project.sh --status`
2. Display formatted output

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
- **Policy-aware** — load company + repo + global policies before first task. Hard-enforcement policies block the loop if violated
- **ALWAYS**: Use `"userStories"` key in prd.json (not `"stories"`) — `run-project.sh` greps for this exact key name
- **`--inline` isolation** — incompatible with `--swarm`, `--tmux`, `--codex-autofix` (error if combined)
- **`--inline` respects `--resume`** — skips completed stories, picks up from next incomplete
- **`--inline` does NOT launch `run-project.sh`** — all orchestration happens in the Claude session
- **`--inline` uses Agent tool** — worker sub-agents via Agent tool (in-process), not `claude -p` (process isolation)
- **`--inline` preserves progress** — user can stop between stories; partial progress saved in prd.json + state.json

## Worked Example: Complete Project Execution (Ralph Loop)

This example shows `/run-project campaign-migration` executing through multiple stories, showing task selection, execution, regression gates, and completion.

### Scenario: Multi-Story Campaign Migration Project

**Project:** `campaign-migration` — Migrate 3 campaigns from legacy system to new platform.

**PRD State (at start):**
```json
{
  "name": "campaign-migration",
  "metadata": {
    "company": "{company}",
    "repoPath": "repos/private/{product}",
    "qualityGates": ["bun test", "bun check", "bun lint"]
  },
  "userStories": [
    {
      "id": "CM-001",
      "title": "Set up campaign database tables",
      "passes": false,
      "priority": 1,
      "dependsOn": []
    },
    {
      "id": "CM-002",
      "title": "Migrate campaign A data",
      "passes": false,
      "priority": 2,
      "dependsOn": ["CM-001"]
    },
    {
      "id": "CM-003",
      "title": "Migrate campaign B data",
      "passes": false,
      "priority": 2,
      "dependsOn": ["CM-001"]
    },
    {
      "id": "CM-004",
      "title": "Verify all campaigns migrated",
      "passes": false,
      "priority": 3,
      "dependsOn": ["CM-002", "CM-003"]
    }
  ]
}
```

### Start Execution

```bash
bash scripts/run-project.sh campaign-migration --no-permissions
```

### Iteration 1: CM-001 (Database Schema)

**Task Selection:**
```
Re-reading PRD...
Candidates: CM-001 (deps OK, priority 1), CM-002 (blocked on CM-001), CM-003 (blocked on CM-001)
Selected: CM-001 (lowest priority value)
```

**Execution:**
```
[1/4] Task: CM-001 - Set up campaign database tables
├─ Branch: checkout feature/cm-001 from main
├─ Linear sync: Issue CMG-1 → In Progress
├─ Command: claude -p "/execute-task campaign-migration/CM-001"
│  └─ Workers: [architect, database-dev, code-reviewer, codex-reviewer, dev-qa-tester]
│  └─ Phases: 5 completed (all passed)
├─ Post-task validation: git diff confirms 3 files modified
├─ Codex review: ✓ passed (no critical issues)
├─ Linear sync: Issue CMG-1 → Done
└─ Result: ✓ PASS (5 phases, 0 issues)

Updated PRD: CM-001 passes: true
Updated state.json: current_task = CM-001, status = completed
Updated progress.txt: [1/4] Complete
```

### Iteration 2: CM-002 (Campaign A Migration)

**Task Selection:**
```
Re-reading PRD...
Candidates: CM-002 (CM-001 done ✓), CM-003 (CM-001 done ✓)
Selected: CM-002 (priority 2, first in array order)
```

**Execution:**
```
[2/4] Task: CM-002 - Migrate campaign A data
├─ Branch: checkout feature/cm-002 from main
├─ Linear sync: Issue CMG-2 → In Progress
├─ Command: claude -p "/execute-task campaign-migration/CM-002"
│  └─ Workers: [backend-dev, code-reviewer, codex-reviewer, dev-qa-tester]
│  └─ Phases: 4 completed (all passed)
├─ Post-task validation: git diff confirms 2 files modified, 1 migration created
├─ Codex review: ✓ passed
├─ Linear sync: Issue CMG-2 → Done
└─ Result: ✓ PASS (4 phases, 0 issues)

Updated PRD: CM-002 passes: true
Progress: [2/4] Complete
```

### Iteration 3: CM-003 (Campaign B Migration)

**Task Selection:**
```
Re-reading PRD...
Candidates: CM-003 (CM-001 done ✓, CM-002 independent)
Selected: CM-003 (priority 2, available)
```

**Execution:**
```
[3/4] Task: CM-003 - Migrate campaign B data
├─ Branch: checkout feature/cm-003 from main
├─ Linear sync: Issue CMG-3 → In Progress
├─ Command: claude -p "/execute-task campaign-migration/CM-003"
│  └─ Workers: [backend-dev, code-reviewer, codex-reviewer, dev-qa-tester]
│  └─ Phases: 4 completed (all passed)
├─ Post-task validation: git diff confirms 2 files modified, 1 migration created
├─ Codex review: ✓ passed
├─ Linear sync: Issue CMG-3 → Done
└─ Result: ✓ PASS (4 phases, 0 issues)

Updated PRD: CM-003 passes: true
Progress: [3/4] Complete

>>> REGRESSION GATE: Every 3 stories complete, run quality gates
Running: bun test, bun check, bun lint
├─ bun test: 127 passed, 0 failed ✓
├─ bun check: 0 TypeScript errors ✓
├─ bun lint: 0 issues ✓
Result: ✓ ALL GATES PASSED
```

### Iteration 4: CM-004 (Verification)

**Task Selection:**
```
Re-reading PRD...
Candidates: CM-004 (CM-002 done ✓, CM-003 done ✓)
Selected: CM-004 (all deps satisfied)
```

**Execution:**
```
[4/4] Task: CM-004 - Verify all campaigns migrated
├─ Branch: checkout feature/cm-004 from main
├─ Linear sync: Issue CMG-4 → In Progress
├─ Command: claude -p "/execute-task campaign-migration/CM-004"
│  └─ Workers: [dev-qa-tester, code-reviewer]
│  └─ Phases: 2 completed (all passed)
├─ Post-task validation: git status clean
├─ Codex review: ✓ passed
├─ Linear sync: Issue CMG-4 → Done
└─ Result: ✓ PASS (2 phases, 0 issues)

Updated PRD: CM-004 passes: true
Progress: [4/4] Complete
```

### Completion Flow

**All Stories Complete:**
```
✓ CM-001: Set up campaign database tables
✓ CM-002: Migrate campaign A data
✓ CM-003: Migrate campaign B data
✓ CM-004: Verify all campaigns migrated

Running completion flow...
├─ Linear board sync: Project → done state
├─ Generate summary report: workspace/reports/campaign-migration-summary.md
├─ INDEX.md flagged for rebuild (deferred to /cleanup)
├─ Manifest verification: ✓ all repos registered
├─ Final reindex: qmd update
└─ State: status → completed

Completion Summary:
╔═══════════════════════════════════════════════════════╗
║  campaign-migration: ALL 4 STORIES COMPLETE          ║
╠═══════════════════════════════════════════════════════╣
║  Started: 2026-03-08 14:15 UTC                       ║
║  Completed: 2026-03-08 16:47 UTC (2h 32m)            ║
║  Total phases: 15                                    ║
║  Total workers: 6 unique workers                     ║
║  Back pressure: 15/15 phases passed ✓                ║
║  Regression gates: 2/2 passed ✓                      ║
╚═══════════════════════════════════════════════════════╝

Report saved: workspace/reports/campaign-migration-summary.md
State saved: workspace/orchestrator/campaign-migration/state.json
Progress: workspace/orchestrator/campaign-migration/progress.txt

Next step: /run-project --status to see all projects
```

### Summary Output

The orchestrator stores execution metadata at:
- **State:** `workspace/orchestrator/campaign-migration/state.json`
- **Progress:** `workspace/orchestrator/campaign-migration/progress.txt`
- **Report:** `workspace/reports/campaign-migration-summary.md`

**progress.txt:**
```
campaign-migration: 4/4 complete
[✓] CM-001: Set up campaign database tables
[✓] CM-002: Migrate campaign A data
[✓] CM-003: Migrate campaign B data
[✓] CM-004: Verify all campaigns migrated

Regression gates: 2/2 passed
Last updated: 2026-03-08 16:47:33 UTC
```

**state.json (final):**
```json
{
  "project": "campaign-migration",
  "status": "completed",
  "started_at": "2026-03-08T14:15:00Z",
  "completed_at": "2026-03-08T16:47:33Z",
  "stories_total": 4,
  "stories_completed": 4,
  "stories_failed": 0,
  "current_task": null,
  "phases_total": 15,
  "phases_completed": 15,
  "regressions_run": 2,
  "regressions_passed": 2
}
```

---

## Integration

- `/prd` → creates PRD → `/run-project {name}` executes it
- `/execute-task {project}/{id}` → runs single task (standalone or headless)
- `/run-project --resume` → continues from next incomplete story
- `/nexttask` → shows active projects
