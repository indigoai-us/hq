---
id: run-project-no-inline
title: Project execution must use run-project.sh orchestrator
scope: command
trigger: /run-project, project execution, implementing PRD stories
enforcement: hard
version: 1
created: 2026-03-18
updated: 2026-03-18
source: user-correction
command: run-project
---

## Rule

When user invokes `/run-project` or asks to execute a project with a `prd.json`, ALWAYS launch `scripts/run-project.sh` as the orchestrator. NEVER implement stories inline — no direct Write/Edit to repo files, no creating service files, no editing package.json.

**Exception:** When `--inline` flag is explicitly passed, in-session execution is permitted. The flag is the user's explicit opt-in to interactive mode. All other `/run-project` invocations (without `--inline`) MUST still use `run-project.sh`.

The only acceptable actions in the interactive session are:
1. Validate PRD exists and is well-formed
2. Pre-launch prep (state.json fix, env placeholder, branch setup)
3. Launch `nohup bash scripts/run-project.sh` with appropriate flags
4. Poll `state.json` for progress
5. Report status to user

Pre-launch prep MUST NOT include writing code in the target repo. If `run-project.sh` fails or needs adjustment, fix the script — don't bypass it.

