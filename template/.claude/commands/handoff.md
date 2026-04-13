---
description: Hand off to fresh session, work continues from checkpoint
allowed-tools: Read, Write, Edit, Bash, AskUserQuestion
argument-hint: [message]
visibility: public
---

# /handoff - Fresh Session Continuity

Run the `/handoff` skill to prepare for a new session — captures learnings/insights, commits dirty repos, writes thread file + handoff.json, updates INDEX files, and refreshes the search index. Runtime-agnostic canonical logic lives in the skill.

**User's message (optional):** $ARGUMENTS

## Steps

1. Load the handoff skill from `.claude/skills/handoff/SKILL.md`
2. Execute the 9-step process: learnings → knowledge sync → insights → ensure thread → find latest thread → commit knowledge repos → commit HQ → update INDEX files → document-release → qmd update → detect pipelines → write handoff.json → report
3. Never enter plan mode during handoff — execute steps directly

## After Handoff

- Start a fresh session and run `/startwork` (or `/nexttask`) to continue
- Fallback: read `workspace/threads/handoff.json` directly
