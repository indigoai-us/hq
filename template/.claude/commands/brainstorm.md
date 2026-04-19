---
description: Explore approaches and tradeoffs before committing to a PRD
allowed-tools: Task, Read, Glob, Grep, Write, Bash, AskUserQuestion, WebSearch
argument-hint: [company] <idea description or board idea ID>
visibility: public
---

# /brainstorm - Structured Exploration

Run the `/brainstorm` skill to think through a problem before committing to a PRD — research HQ context, compare approaches, surface unknowns. The skill prescribes `AskUserQuestion` (decision mode) for all user-facing choices, and writes to `companies/{co}/projects/{slug}/brainstorm.md`. It refuses to run inside Plan Mode.

**Input:** $ARGUMENTS

**Pipeline:** `/idea` → **`/brainstorm`** → `/plan` → `/run-project`

## Steps

1. Load the brainstorm skill from `.claude/skills/brainstorm/SKILL.md`
2. **Plan-mode preflight (hard refuse):** If the current session is in Plan Mode, STOP immediately and surface the skill's Preflight message. Do not redirect the brainstorm output to the plan file.
3. Parse `$ARGUMENTS` for optional company anchor + description or board idea ID
4. **Repo-run preflight (warn only):** After the company is resolved, if a repo can be inferred from the manifest (`companies/manifest.yaml` → `services[].repo`), run `bash scripts/repo-run-registry.sh check "$REPO_PATH"`. On exit 2, print the foreign owner rows as a `<warning>` block but **do not abort** — brainstorm is research-first and does not register itself. If the user then makes real edits inside the owned tree, the `block-on-active-run` PreToolUse hook will catch them. Suggest `git worktree add` upfront if the exploration might involve prototype edits. Policy: `.claude/policies/repo-run-coordination.md`.
5. Execute the 8-step brainstorm process: Preflight plan-mode guard → parse input → mode selection → resolve company → HQ research + premise challenge → light interview (AskUserQuestion) → 3-layer landscape → resolve company + mkdir project dir → generate brainstorm.md → board integration → confirm + AskUserQuestion for next action

## After Brainstorm

- Promote to PRD: `/plan {co} {slug}` (pre-populates interview from brainstorm.md)
- Refine: edit `brainstorm.md` directly before promoting
- Park: leave as exploring on the board
