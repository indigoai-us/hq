---
description: Hand off to fresh session — commit, persist state, update indexes
allowed-tools: Write, Read, Bash
argument-hint: [message]
visibility: public
---

# /handoff - Fresh Session Continuity

Prepare for a new session to continue this work cleanly.

**User's message (optional):** $ARGUMENTS

## Process

1. **Ensure a thread exists**
   ```bash
   ls workspace/threads/*.json 2>/dev/null | grep -v handoff | tail -1
   ```
   If none found, run `/checkpoint` first to create one, then continue here.

2. **Find the latest thread**
   ```bash
   ls -t workspace/threads/*.json 2>/dev/null | grep -v handoff | head -1
   ```
   Read this file to get `thread_id`, `conversation_summary`, and `git` state.

3. **Commit any uncommitted changes**
   ```bash
   if [[ -n $(git -C . status --porcelain) ]]; then
     git -C . add -A
     git -C . commit -m "checkpoint: save state before handoff"
   fi
   ```

4. **Push to origin**
   ```bash
   git -C . push origin main
   ```

5. **Update `workspace/threads/recent.md`**
   Ensure the latest thread appears at the top of the table. Create file if absent:
   ```markdown
   # Recent Threads

   | Thread ID | Title | Date | Summary |
   |-----------|-------|------|---------|
   | T-... | ... | ... | ... |
   ```
   Keep last 15 rows only.

6. **Run search reindex**
   ```bash
   qmd update 2>/dev/null || true
   ```
   Ensures any content created this session is discoverable in the next.

7. **Write handoff note** to `workspace/threads/handoff.json`:
   ```json
   {
     "created_at": "ISO8601 timestamp",
     "message": "user's handoff message or null",
     "last_thread": "T-20260123-143052-auth-feature",
     "thread_path": "workspace/threads/T-20260123-143052-auth-feature.json",
     "git": {
       "branch": "main",
       "current_commit": "def5678",
       "remote_url": "https://github.com/hassaans/ghq.git"
     },
     "context_notes": "Important context for the next session"
   }
   ```

8. **Report**
   ```
   Handoff ready.

   Latest thread: {thread_id}
   Summary: {conversation_summary}
   Git: {branch} @ {commit} (pushed)

   To continue in a fresh session:
   1. Start a new Claude Code session in this repo
   2. Read: workspace/threads/handoff.json
   3. Or run: /nexttask (if available)
   ```

## When to Use

Run `/handoff` when:
- Session has been running a long time (many turns, approaching context limit)
- Switching to a different type of task or skill
- About to stop work and want clean resumption
- Auto-compaction has triggered (PreCompact hook fires)

## Why Fresh Sessions

Fresh context means:
- No accumulated noise from previous work
- Clean slate for complex tasks
- Follows GHQ's Ralph methodology (fresh agent per task)

## Thread Schema Reference

`knowledge/ghq-core/thread-schema.md`
