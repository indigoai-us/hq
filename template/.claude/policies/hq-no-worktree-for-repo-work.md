---
id: hq-no-worktree-for-repo-work
title: "Never create HQ worktrees or branches for repo work"
scope: global
trigger: "/startwork, repo-scoped tasks, company repo work"
enforcement: hard
version: 1
created: 2026-04-03
updated: 2026-04-03
source: user-correction
---

## Rule

NEVER create a git worktree or new branch in HQ when starting work on a project repo ({PRODUCT}, {company}-{your-project}, etc.). HQ must stay on `main` at all times. All branching and worktree creation happens inside the target repo itself (e.g. `repos/private/{product}`). Each repo has its own branching strategy independent of HQ.

When `/startwork` resolves to a repo context, `cd` into that repo and work there directly. Do not use `EnterWorktree` on the HQ repository.

