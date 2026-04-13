---
description: Plan a project and generate PRD for execution
allowed-tools: Task, Read, Glob, Grep, Write, Bash, AskUserQuestion
argument-hint: [project/feature description]
visibility: public
---

# /prd - Project Planning & PRD Generation

Run the `/prd` skill to scan HQ context, interview the user in batches, and generate execution-ready PRD files (`prd.json` + `README.md`). Runtime-agnostic canonical logic lives in the skill.

**User's input:** $ARGUMENTS

**Important:** Do NOT implement. Just create the PRD.

## Steps

1. Load the prd skill from `.claude/skills/prd/SKILL.md`
2. Anchor company from first word of `$ARGUMENTS` if it matches a manifest slug; resolve mode (company / repo / personal-HQ)
3. Execute the 9-step process: company anchor → scan HQ (gated by mode) → infra pre-check → name + brainstorm detection → batched interview → generate prd.json + README → board sync → orchestrator register → beads + learn + doc scout → Linear ({company} only) → confirm + handoff

## After PRD

- HARD BLOCK: do NOT implement in the same session — PRD creation ends with `/handoff`
- To execute: start a fresh session and run `/run-project {name}` or `/execute-task {name}/US-001`
