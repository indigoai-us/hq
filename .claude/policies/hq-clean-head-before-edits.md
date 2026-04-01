---
id: hq-clean-head-before-edits
title: Verify clean working tree before editing
scope: repo
trigger: before editing any file in this repo
enforcement: hard
version: 1
created: 2026-03-31
updated: 2026-03-31
source: back-pressure-failure
---

## Rule

ALWAYS run `git diff --stat` and `git status --short` BEFORE making edits in this repo. The local working tree often has divergent uncommitted changes from previous sessions that don't match the published npm version. If uncommitted changes exist, either `git stash` or `git checkout -- {file}` to start from clean HEAD before editing.

Editing on top of stale uncommitted changes produces PRs that mix unrelated diffs, making review impossible and requiring rework.

## Rationale

Session on 2026-03-31: edited `packages/create-hq/src/scaffold.ts` and `git.ts` without checking for pre-existing uncommitted changes. The working tree had divergent changes from a previous template sync session. The resulting PR mixed our 4-line fix with 150+ lines of unrelated diffs. Files were reverted by linter/user, requiring the fix to be re-applied.
