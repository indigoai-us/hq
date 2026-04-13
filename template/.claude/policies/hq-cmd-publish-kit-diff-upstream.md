---
id: hq-cmd-publish-kit-diff-upstream
title: Diff against upstream template state before publishing
scope: command
trigger: /publish-kit patch or full release
enforcement: soft
version: 1
created: 2026-04-12
updated: 2026-04-12
source: session-experience
---

## Rule

ALWAYS diff changed items against the actual upstream template state (`origin/main` + open PR branches) before running `/publish-kit`. Do not rely solely on local commit history to determine what's "unpublished." Features may already exist in open PRs targeting the same repo. Including them again creates merge conflicts and duplicate content.

Concrete check: for each `--item`, verify the file does not already exist (or differ only trivially) on `origin/main` or any open PR branch before copying.

## Rationale

During the v10.7→v10.8 publish session, repo-coordination files (block-on-active-run.sh, check-repo-active-runs.sh, orchestrator.yaml) appeared "unpublished" based on local commit history but were already in open PRs #48/#49. The thorough diff analysis by an Explore agent prevented a duplicate-content PR that would have conflicted with those PRs on merge.
