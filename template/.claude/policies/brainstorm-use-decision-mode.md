---
id: brainstorm-use-decision-mode
title: /brainstorm must use AskUserQuestion + company project path
scope: command
trigger: during /brainstorm execution
enforcement: hard
version: 1
created: 2026-04-19
updated: 2026-04-19
applies_to: [brainstorm]
---

## Rule

1. `/brainstorm` MUST present every user-facing choice via `AskUserQuestion` (decision mode). A markdown numbered list ("Option 1... Option 2...") is NOT a substitute — the user cannot click a markdown list. This applies to Step 3 (light interview) and Step 7 (next action).
2. `/brainstorm` MUST write its output to `companies/{co}/projects/{slug}/brainstorm.md` (or `projects/{slug}/brainstorm.md` for personal/HQ scope). It MUST run `mkdir -p` before the write.
3. `/brainstorm` MUST refuse to run inside Plan Mode. It must print the Preflight message and abort — no redirect to the plan file, no silent degrade.

## Examples

**Correct:**
- Step 3 missing direction + company → single `AskUserQuestion` call with two items, each with 2–4 labeled options.
- Step 7 summary followed by `AskUserQuestion` with options `Promote to PRD`, `Refine brainstorm`, `Park on board`, `End here`.
- Output at `companies/{company}/projects/onboarding-one-page/brainstorm.md` after `mkdir -p` on the parent dir.

**Incorrect:**
- "How would you like to proceed?" followed by a 1./2./3./4. markdown list.
- Writing `brainstorm.md` contents into a plan file at `~/.claude/plans/*.md`.
- Skipping `mkdir -p` and letting Write fail silently against a nonexistent project dir.
