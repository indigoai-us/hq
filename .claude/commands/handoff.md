---
description: Hand off to fresh session, work continues from checkpoint
allowed-tools: Write, Read, Bash
argument-hint: [message]
---

# /handoff - Fresh Session Continuity

Prepare for a new session to continue this work.

**User's message (optional):** $ARGUMENTS

## Process

1. **Ensure checkpoint exists**
   - Check `workspace/checkpoints/` for recent checkpoint
   - If none, run checkpoint first

2. **Update INDEX.md**
   - Regenerate `INDEX.md` at HQ root (same as checkpoint)

3. **Write handoff note** to `workspace/checkpoints/handoff.json`:
   ```json
   {
     "created_at": "ISO8601 timestamp",
     "message": "user's handoff message if provided",
     "last_checkpoint": "path to most recent checkpoint",
     "context_notes": "important context for next session"
   }
   ```

3. **Report**
   ```
   Handoff ready.

   Checkpoint: workspace/checkpoints/{checkpoint-id}.json

   To continue in a fresh session:
   1. Start new Claude Code session
   2. Run: /nexttask (it will find your checkpoint)

   Or manually: read workspace/checkpoints/handoff.json
   ```

## Why Fresh Sessions

Fresh context means:
- No accumulated noise from previous work
- Clean slate for complex tasks
- Follows Ralph methodology (fresh agent per task)

Use `/handoff` when:
- Session has been running a while
- Switching to a different type of task
- Want cleaner separation between work chunks
