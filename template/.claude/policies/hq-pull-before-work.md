---
id: hq-pull-before-work
title: Always pull latest main before starting repo work
scope: global
trigger: Starting any coding session on a repo
enforcement: hard
version: 1
created: 2026-03-21
updated: 2026-03-21
source: user-correction
---

## Rule

ALWAYS run `git pull` (or `git fetch && git merge`) on the active branch before making any changes to a repo. If the repo is significantly behind origin (50+ commits), address the divergence before starting new work.

At session start, after identifying the target repo:
1. `cd` to the repo
2. `git fetch origin`
3. Check `git rev-list --count HEAD..origin/main` — if > 0, pull before proceeding
4. If pull fails due to local changes, stash first

## Rationale

In a session (2026-03-21), we built a multi-instance control plane on a local main that was 372 commits behind origin/main. The remote had undergone major restructuring (package renames, new packages, type rewrites). The resulting merge had 21 conflicted files and was effectively unresolvable. A `git pull` at session start would have cost 10 seconds and saved hours of wasted work.
