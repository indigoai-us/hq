---
description: Force reanchoring conversation before next task
allowed-tools: AskUserQuestion
argument-hint:
---

Force a reanchoring checkpoint. Use this when you want to ensure alignment before the agent continues.

## Steps

1. **Review** - Summarize what was just built/changed:
   - Files modified
   - Key decisions made
   - Current state of the work

2. **Ask clarifying questions** using AskUserQuestion:
   - "Any issues with what was built?"
   - "Anything to adjust before continuing?"
   - "What should be the priority for the next task?"

3. **Wait for response** - Do NOT proceed until user responds

4. **Update plan** - If user provides feedback, incorporate it before moving on

5. **Confirm next step** - Only then proceed to the next task

## Why This Matters

Reanchoring prevents:
- Context drift (agent goes off-track)
- Wasted work (building wrong thing)
- Compounding errors (small misunderstanding becomes big problem)

This is core Ralph methodology: small loops with human checkpoints.
