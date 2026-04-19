---
id: git-add-explicit-paths-no-drift
title: Stage focused commits by explicit path, never git add -A when unrelated drift exists
scope: global
trigger: committing PRD artifacts, infrastructure changes, or any focused deliverable
enforcement: hard
public: true
version: 1
created: 2026-04-16
updated: 2026-04-16
source: starter-kit
---

## Rule

Before committing a focused deliverable (PRD, policy, infrastructure file, feature code), run `git status --short` and inspect the working tree. If unrelated modifications, untracked files, or submodule pointer drift exist alongside the intended change, stage **only the intended paths explicitly**:

```bash
git add path/one path/two path/three
git commit -m "..."
```

Never use `git add -A`, `git add .`, or `git add -u` when the working tree contains drift the commit is not meant to address. If the drift is itself worth committing, commit it separately with its own message — one concern per commit.

When the drift is a submodule or knowledge-repo pointer (e.g. `m companies/{company}/tools/chart-renderer`), check whether it represents in-progress upstream work before deciding to stage, skip, or reset. Never silently fold submodule pointer bumps into an unrelated commit.
