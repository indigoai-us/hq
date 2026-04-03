---
id: dual-repo-prd-routing
title: Dual-repo PRD routing via story notes
scope: command
trigger: /run-project, /execute-task, /prd
enforcement: soft
---

## Rule

When a PRD spans two repos (`repoPath` + `secondaryRepoPath`), add a `REPO:` prefix in each story's `notes` field directing the sub-agent to the correct repo. Example: `"REPO: This story targets repos/private/{repo} (NOT {repo}). CD to that repo before working."` Also expand `qualityGates` to run typecheck in both repos using subshell: `"(cd /path/to/secondary/repo && npm run typecheck)"`.

## Rationale

`execute-task` resolves CWD from `metadata.repoPath` only. Stories targeting the secondary repo get the wrong working directory. Per-story `notes` are included in the worker prompt — this is zero-infrastructure routing without modifying execute-task code. Proven in {project} (Mar 2026): 3 {repo} stories + 7 {repo} stories, all routed correctly.
