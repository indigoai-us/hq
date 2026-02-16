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

3. **Commit dirty knowledge repos**
   Knowledge folders are separate git repos (symlinked). Before handoff, commit any uncommitted knowledge changes:
   ```bash
   for symlink in knowledge/public/* knowledge/private/* companies/*/knowledge; do
     [ -L "$symlink" ] || continue
     repo_dir=$(cd "$symlink" && git rev-parse --show-toplevel 2>/dev/null) || continue
     dirty=$(cd "$repo_dir" && git status --porcelain)
     [ -z "$dirty" ] && continue
     (cd "$repo_dir" && git add -A && git commit -m "checkpoint: auto-commit before handoff")
   done
   ```

4. **Sync to cloud (non-blocking)**
   Push local changes (including freshly committed knowledge repos) to hq-cloud so cloud sessions have the latest files.
   ```bash
   # Only attempt sync if user is authenticated with hq-cloud
   if [ -f ~/.hq/credentials.json ]; then
     hq sync push 2>&1 || echo "Cloud sync failed (non-fatal)"
   fi
   ```
   - If `~/.hq/credentials.json` does not exist, skip silently (user is not connected to hq-cloud)
   - If `hq sync push` fails (network error, auth expired, etc.), log the warning but do **not** fail the handoff
   - On success, include the sync result in the report (e.g., "Synced 12 files to cloud")

5. **Update INDEX.md files**
   - Regenerate `INDEX.md` at HQ root with:
     - Workers from `workers/registry.yaml`
     - Recent threads from `workspace/threads/`
   - Regenerate `workspace/threads/INDEX.md` (all threads, full table)
   - Regenerate `workspace/orchestrator/INDEX.md` (project progress)
   - Check files_touched for any `companies/*/knowledge/` paths — if found, regenerate that company's `knowledge/INDEX.md`
   - See `knowledge/public/hq-core/index-md-spec.md` for INDEX format

6. **Update search index**
   ```bash
   qmd update && qmd embed
   ```
   Ensures any content created this session is searchable in the next.

7. **Write handoff note** to `workspace/threads/handoff.json`:
   ```json
   {
     "created_at": "ISO8601 timestamp",
     "message": "user's handoff message if provided",
     "last_thread": "T-20260123-143052-mrr-report",
     "thread_path": "workspace/threads/T-20260123-143052-mrr-report.json",
     "context_notes": "important context for next session"
   }
   ```

8. **Report**
   ```
   Handoff ready.

   Latest thread: {thread_id}
   Summary: {conversation_summary}
   Git: {branch} @ {commit}
   Cloud: {sync result, e.g. "Synced 12 files to cloud" | "Cloud sync skipped (not authenticated)" | "Cloud sync failed (warning)"}

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
