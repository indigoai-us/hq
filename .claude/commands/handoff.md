---
description: Hand off to fresh session, work continues from checkpoint
allowed-tools: Write
argument-hint: [message]
---

Hand off work to a fresh session.

User's handoff message (if any): $ARGUMENTS

## Steps

1. **Ensure checkpoint exists** - If no recent checkpoint, run `/checkpoint` first

2. **Write handoff note** to `workspace/checkpoints/handoff.json`:
   ```json
   {
     "created_at": "ISO8601 timestamp",
     "message": "user's handoff message if provided",
     "last_checkpoint": "path to most recent checkpoint",
     "context_notes": "any important context for next session"
   }
   ```

3. **Inform user**:
   ```
   Handoff ready!

   Your work is saved to: workspace/checkpoints/{checkpoint-id}.json

   To continue in a fresh session:
   1. Start a new Claude Code session
   2. Run: `/nexttask` (it will find your checkpoint)

   Or manually resume:
   - Read workspace/checkpoints/{checkpoint-id}.json
   - Continue from next_steps
   ```

## Why Handoff?

Fresh context means:
- No accumulated noise from previous work
- Clean slate for complex tasks
- Follows Ralph methodology (fresh agent per task)

Use `/handoff` when:
- Context usage is >50% (check with `/checkpoint`)
- Switching to a different type of task
- Want cleaner separation between work chunks
