---
id: hq-swarm-pr-branch
title: Swarm worktree merges land on local main
scope: command
trigger: /run-project --swarm completion, PR creation after swarm execution
enforcement: hard
version: 1
created: 2026-03-11
updated: 2026-03-11
source: success-pattern
---

## Rule

After `run-project --swarm` completes, all story commits are cherry-picked onto local `main` (the working tree), NOT the PRD's `branchName`. To create a PR:

1. Delete the stale feature branch (`git branch -D {branchName}`)
2. Create a new branch from local main (`git checkout -b {branchName}`)
3. Push with force (`git push -u origin {branchName} --force`)

The PRD `branchName` is only used for per-story worktree naming during swarm execution, not as the merge target.

## Rationale

Discovered during `inbound-conversations` project (Mar 2026). The orchestrator's swarm mode creates isolated git worktrees per story, then cherry-picks each worktree's commits back into the main working tree (local main) after completion. The PRD's `branchName` branch may exist from a previous run but points to stale history. Attempting `git checkout` to it and pushing would miss all swarm commits.
