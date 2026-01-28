---
description: Hand off to fresh session, work continues from checkpoint
allowed-tools: Write, Read, Bash
argument-hint: [message]
visibility: public
---

# /handoff - Fresh Session Continuity

Prepare for a new session to continue this work.

**User's message (optional):** $ARGUMENTS

## Process

1. **Ensure thread exists**
   - Check `workspace/threads/` for recent thread
   - If none, run `/checkpoint` first to create one

2. **Find latest thread**
   ```bash
   ls -t workspace/threads/*.json | head -1
   ```

3. **Update INDEX.md**
   - Regenerate `INDEX.md` at HQ root with:
     - Workers from `workers/registry.yaml`
     - Recent threads from `workspace/threads/`

4. **Update search index**
   ```bash
   qmd update && qmd embed
   ```
   Ensures any content created this session is searchable in the next.

5. **Write handoff note** to `workspace/threads/handoff.json`:
   ```json
   {
     "created_at": "ISO8601 timestamp",
     "message": "user's handoff message if provided",
     "last_thread": "T-20260123-143052-mrr-report",
     "thread_path": "workspace/threads/T-20260123-143052-mrr-report.json",
     "context_notes": "important context for next session"
   }
   ```

6. **Report**
   ```
   Handoff ready.

   Latest thread: {thread_id}
   Summary: {conversation_summary}
   Git: {branch} @ {commit}

   To continue in a fresh session:
   1. Start new Claude Code session
   2. Run: /nexttask (it will find your thread)

   Or read: workspace/threads/handoff.json
   ```

## Thread vs Checkpoint

Threads are the new format with richer context:
- Git state (branch, commits, dirty)
- Worker state (skill, status)
- Better searchability

Legacy checkpoints in `workspace/checkpoints/` still work.

## Why Fresh Sessions

Fresh context means:
- No accumulated noise from previous work
- Clean slate for complex tasks
- Follows Ralph methodology (fresh agent per task)

Use `/handoff` when:
- Session has been running a while
- Switching to a different type of task
- Want cleaner separation between work chunks
