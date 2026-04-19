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

