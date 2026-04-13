---
description: Explore approaches and tradeoffs before committing to a PRD
allowed-tools: Task, Read, Glob, Grep, Write, Bash, AskUserQuestion, WebSearch
argument-hint: [company] <idea description or board idea ID>
visibility: public
---

# /brainstorm - Structured Exploration

Run the `/brainstorm` skill to think through a problem before committing to a PRD — research HQ context, compare approaches, surface unknowns.

**Input:** $ARGUMENTS

**Pipeline:** `/idea` → **`/brainstorm`** → `/prd` → `/run-project`

## Steps

1. Load the brainstorm skill from `.claude/skills/brainstorm/SKILL.md`
2. Parse `$ARGUMENTS` for optional company anchor + description or board idea ID
3. Execute the 7-step brainstorm process: parse input → mode selection → resolve company → HQ research + premise challenge → light interview → 3-layer landscape → generate brainstorm.md → board integration

## After Brainstorm

- Promote to PRD: `/prd {co} {slug}` (pre-populates interview from brainstorm.md)
- Refine: edit `brainstorm.md` directly before promoting
- Park: leave as exploring on the board
