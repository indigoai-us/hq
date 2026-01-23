---
description: Force reanchoring conversation before next task
allowed-tools: Read, Bash, AskUserQuestion
argument-hint:
---

# /reanchor - Pause and Realign

Stop and realign before continuing. Use when you want to ensure the agent is on track.

## Process

1. **Show recent state**
   - Read last checkpoint if exists (`workspace/checkpoints/`)
   - Run `git log --oneline -5` for recent commits
   - Summarize current working state

2. **Display summary**
   ```
   Recent commits:
   - abc123: feat: add /run skill
   - def456: refactor: simplify checkpoint

   Last checkpoint: {task-id}
   Summary: {checkpoint summary}
   Next steps: {from checkpoint}
   ```

3. **Ask for focus**
   Use AskUserQuestion:
   - "What's the focus for the next stretch?"
   - Options based on checkpoint next_steps + "Something else"

4. **Wait for response** before proceeding

## Why Reanchor

Reanchoring prevents:
- Context drift (agent goes off-track)
- Wasted work (building wrong thing)
- Compounding errors

Core Ralph methodology: small loops with human checkpoints.
