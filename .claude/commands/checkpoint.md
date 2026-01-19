---
description: Save checkpoint and check context status
allowed-tools: Write
argument-hint: [task-id]
---

Save current work state and check if context clearing is needed.

Task ID (optional): $ARGUMENTS

## Steps

1. **Generate task ID** if not provided (use short descriptive slug, e.g., `auth-refactor-01`)

2. **Write checkpoint** to `workspace/checkpoints/{task-id}.json`:
   ```json
   {
     "task_id": "the-task-id",
     "completed_at": "ISO8601 timestamp",
     "summary": "1-2 sentence summary of work done this session",
     "next_steps": ["array of remaining tasks"],
     "files_touched": ["relative/paths/from/HQ"],
     "context_notes": "any important context for next session"
   }
   ```

3. **Report context status**:
   - Show approximate context usage %
   - If >50%: strongly suggest `/handoff`
   - If >75%: WARN that context is nearly full

4. **Ask user** using AskUserQuestion:
   - Continue in this session
   - Run `/handoff` (clear context, resume from checkpoint)
   - Stop here (work saved to checkpoint)

## Purpose

Checkpoints ensure:
- Work survives context clears
- Next session can resume seamlessly
- Ralph methodology is followed (fresh context per task)
