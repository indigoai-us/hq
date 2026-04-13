---
id: run-project-progress-txt-no-commit-misleading
title: progress.txt [no-commit] tag is misleading — real commits may exist
scope: command
command: run-project
trigger: Reading workspace/orchestrator/{slug}/progress.txt to verify story shipping status
enforcement: soft
version: 1
created: 2026-04-10
updated: 2026-04-10
---

## Rule

Lines in `workspace/orchestrator/{slug}/progress.txt` tagged `[no-commit]` **do not** reliably indicate that a story made no commits. They indicate only that the orchestrator's post-story commit-detection heuristic did not find a commit to attribute to that specific story at the moment it checked.

**Real commits may still exist in the target repo's `git log` even for stories tagged `[no-commit]` in progress.txt.** Possible reasons:
- The sub-agent committed work but with a message that didn't match the expected `US-XXX:` / `feat(US-XXX):` pattern.
- The commit landed slightly before the orchestrator's detection pass due to async file watchers.
- The story's work was folded into a prior story's commit (chained changes) and the later story's post-hoc detection saw no new HEAD movement.
- A pre-sprint drift commit (like `fix(api/accounts)`) ran ahead of the orchestrator and never got tagged.

**Mitigation:**

- **Never** use `progress.txt` alone to answer "did this story ship?" or "is there uncommitted work?".
- **Always** cross-check against `git log --oneline origin/main..HEAD` in the target repo.
- When writing landing PRDs, size `sourceCommitCount` from `git rev-list --count origin/main..HEAD`, not from progress.txt.
- When writing release notes / handoffs, quote commit SHAs from `git log`, not story tags from progress.txt.

## Rationale

Observed 2026-04-10 on `{company}-{your-project}`: `progress.txt` showed all 14 stories completing, but the question "how many commits are unpushed?" couldn't be answered from progress.txt alone. `git log origin/main..HEAD` revealed **12 commits** across US-009..US-014 — matching the story count in spirit but not in raw numbers, because US-009 had 3 commits (initial + 2 review fixes) and US-014 had 2 commits. Without the git-log cross-check, a landing PRD would have under-counted the review surface and US-L02 would have missed commits.

The tag is useful as a *hint* ("this story may not have produced a commit"), but not as a *truth*. Trust git, not the orchestrator's annotation.

## Related

- `.claude/policies/run-project-file-locks-stale.md` — sibling orchestrator artifact leak
- `.claude/commands/run-project.md` — orchestrator completion contract
