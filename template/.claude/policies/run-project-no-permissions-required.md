---
id: run-project-no-permissions-required
title: Always pass --no-permissions for unattended orchestrator runs
scope: command
trigger: /run-project, run-project.sh
enforcement: hard
version: 1
created: 2026-03-27
source: session-learning
---

## Rule

ALWAYS pass `--no-permissions` when launching `run-project.sh` for an unattended (non-interactive) orchestrator run.

```bash
# CORRECT
bash scripts/run-project.sh {project} --no-permissions --timeout 45

# WRONG — sub-agents silently fail
bash scripts/run-project.sh {project} --timeout 45
```

Without `--no-permissions`, sub-agents (`claude -p`) default to restricted permission mode. They enter plan mode, write a plan, but fail to exit it (ExitPlanMode is denied). The sub-agent exits with code 0 and the orchestrator sees "passes not set after attempt 2" — 100% failure rate with no visible error.

The `--no-permissions` flag passes `--dangerously-skip-permissions --permission-mode bypassPermissions` to each sub-agent invocation, allowing them to edit files, run commands, and mark stories as passed.

## Rationale

Session 2026-03-27: {your-project}-v4 orchestrator launched without `--no-permissions`. All 10 stories run in the second batch failed with "passes not set after attempt 2". Sub-agent output showed `permission_denials: [{ tool_name: "ExitPlanMode" }]` — the agents were stuck in plan mode. Adding `--no-permissions` resolved the issue; subsequent 25 stories completed with 0 failures.
