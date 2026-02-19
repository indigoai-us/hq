---
description: Force reanchoring conversation before next task
allowed-tools: Read, Bash, AskUserQuestion
argument-hint:
visibility: public
---

# /reanchor - Pause and Realign

Stop and realign before continuing. Use when you want to ensure the agent is on track.

## When to Use

Only run when explicitly called or genuinely disoriented.
Never auto-trigger on session start — most tasks don't need full HQ orientation.

## Process

1. **Load INDEX context**
   - Read root `INDEX.md` (directory map, recent threads, workers)
   - Read `workspace/orchestrator/INDEX.md` (active projects + progress)
   - Read `workspace/threads/handoff.json` if exists (last handoff context)

2. **Check git state**
   ```bash
   git log --oneline -5
   ```

3. **Display combined summary**
   ```
   HQ State:
   - Active projects: {from orchestrator INDEX — name + progress %}
   - Recent threads: {from root INDEX — last 5}
   - Last handoff: {from handoff.json — summary + timestamp}
   - Recent commits: {from git log}
   ```

4. **Ask for focus**
   Use AskUserQuestion:
   - "What's the focus for the next stretch?"
   - Options: active projects from orchestrator INDEX + handoff next_steps + "Something else"

5. **Load company context if needed**
   If user picks a company-specific focus, read that company's `knowledge/INDEX.md`:
   - {Company-2} → `companies/{company-2}/knowledge/INDEX.md`
   - {Company-1} → `companies/{company-1}/knowledge/INDEX.md`
   - {Company-3} → `companies/{company-3}/knowledge/INDEX.md`

6. **Wait for response** before proceeding

## Why Reanchor

Reanchoring prevents:
- Context drift (agent goes off-track)
- Wasted work (building wrong thing)
- Compounding errors

Core Ralph methodology: small loops with human checkpoints.
