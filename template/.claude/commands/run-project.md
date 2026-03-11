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
| `--tmux` | off | Launch in tmux session with RC (observe from phone) |

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

4. **INDEX.md** — flag for rebuild (deferred to `/cleanup`)
5. **Manifest verification** — check repos/workers registered
6. **qmd reindex** — final search index update
7. **State** → `status: "completed"`

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
- **Policy-aware** — load company + repo + global policies before first task. Hard-enforcement policies block the loop if violated
- **ALWAYS**: Use `"userStories"` key in prd.json (not `"stories"`) — `run-project.sh` greps for this exact key name

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
