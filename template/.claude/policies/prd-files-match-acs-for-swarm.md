---
id: prd-files-match-acs-for-swarm
title: PRD files[] must match ACs before swarm execution
scope: command
trigger: /run-project, /prd
enforcement: soft
created: "2026-04-02"
---

## Rule

Before launching `/run-project` with `--swarm`, verify that each story's `files[]` array includes ALL files mentioned in its acceptance criteria. Swarm mode uses `files[]` for overlap detection — missing declarations cause silent merge conflicts during cherry-pick.

## Rationale

Session 2026-04-02: US-004 ACs said "ae/compositions.md updated" but files[] only had `video-reference/outro.html`. US-003 also wrote `ae/compositions.md`. Without the pre-launch fix, both would have swarmed concurrently and conflicted during merge.
