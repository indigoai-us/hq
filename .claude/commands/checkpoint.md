---
description: Save checkpoint and check context status
allowed-tools: Write, Bash, Read
argument-hint: [task-id]
---

# /checkpoint - Save Progress

Save current work state to survive context loss.

**Task ID (optional):** $ARGUMENTS

## Process

1. **Generate task ID** if not provided
   - Use short descriptive slug from recent work (e.g., `skills-redesign`, `email-worker-fix`)

2. **Gather state**
   - Run `git diff --name-only HEAD~3` for recently touched files
   - Run `git log --oneline -3` for recent commits
   - Summarize what was accomplished this session

3. **Write checkpoint** to `workspace/checkpoints/{task-id}.json`:
   ```json
   {
     "task_id": "the-task-id",
     "created_at": "ISO8601 timestamp",
     "summary": "1-2 sentence summary of work done",
     "files_touched": ["relative/paths"],
     "recent_commits": ["hash: message", ...],
     "next_steps": ["remaining tasks if any"],
     "notes": "important context for next session"
   }
   ```

4. **Update INDEX.md**
   - Regenerate `INDEX.md` at HQ root with current:
     - Workers from `workers/registry.yaml`
     - Active projects from `workspace/orchestrator/state.json`
     - Update timestamp

5. **Report**
   ```
   Checkpoint saved: workspace/checkpoints/{task-id}.json

   Summary: {summary}
   Files: {count} files touched
   Next: {next_steps or "Work complete"}

   To hand off to fresh session: /handoff
   ```

## Notes

- Checkpoints ensure work survives context clears
- Run frequently during long sessions
- If session feels long, suggest `/handoff`
