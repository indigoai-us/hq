---
description: Paranoid pre-landing code review — two-pass analysis (CRITICAL/INFORMATIONAL) with file:line references
allowed-tools: Read, Grep, Glob, Bash(git:*), AskUserQuestion
---

# Pre-Landing Code Review

Run the `/review` skill to perform a semantic code review of the current branch diff.

## Steps

1. Load the review skill from `.claude/skills/review/SKILL.md`
2. Load the checklist — check for repo-local override at `{repo}/.claude/review-checklist.md`, fall back to `.claude/skills/review/checklist.md`
3. Execute the 5-step review process: branch validation → checklist load → diff retrieval → two-pass analysis → report

## After Review

- If critical issues remain unresolved: do NOT proceed to PR creation
- If all critical issues resolved: suggest `/quality-gate` then `/pr`
