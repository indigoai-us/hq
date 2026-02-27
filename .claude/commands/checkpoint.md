---
description: Save checkpoint and capture current session state
allowed-tools: Write, Bash, Read
argument-hint: [slug]
visibility: public
---

# /checkpoint - Save Progress

Save current work state as a thread to survive context loss.

**Slug (optional):** $ARGUMENTS

## Process

1. **Check for recent auto-checkpoint** (upgrade instead of duplicate)
   ```bash
   find workspace/threads -name "T-*-auto-*.json" -mmin -5 2>/dev/null | sort -r | head -1
   ```
   If found: upgrade that file in-place (add full fields: `initial_commit`, `commits_made`, `remote_url`, `skill`, `next_steps`; change `type` to `"checkpoint"`; rename file to remove `-auto-`). Then skip to step 6 (INDEX updates).

2. **Generate thread ID**
   - Format: `T-{YYYYMMDD}-{HHMMSS}-{slug}`
   - If no slug provided, derive from recent work (e.g., `auth-feature`, `api-refactor`)

3. **Capture git state**
   ```bash
   git -C . rev-parse --abbrev-ref HEAD          # branch
   git -C . remote get-url origin 2>/dev/null    # remote
   git -C . rev-parse --short HEAD               # current commit
   git -C . log --oneline -5                     # recent commits
   git -C . diff --name-only HEAD~3 2>/dev/null  # recently touched files
   git -C . status --porcelain                   # dirty check
   ```

4. **Gather session state**
   - Summarize what was accomplished (1-2 sentences)
   - List files created or modified this session
   - Identify any remaining next steps

5. **Write thread** to `workspace/threads/{thread_id}.json`:
   ```json
   {
     "thread_id": "T-20260123-143052-auth-feature",
     "version": 1,
     "type": "checkpoint",
     "created_at": "ISO8601",
     "updated_at": "ISO8601",

     "workspace_root": "~/repos/ghq",
     "cwd": "repos/ghq",

     "git": {
       "branch": "main",
       "remote_url": "https://github.com/hassaans/ghq.git",
       "initial_commit": "abc1234",
       "current_commit": "def5678",
       "commits_made": ["def5678: feat: add auth endpoints"],
       "dirty": false
     },

     "skill": {
       "id": "backend",
       "state": "completed",
       "started_at": "ISO8601",
       "completed_at": "ISO8601"
     },

     "conversation_summary": "1-2 sentence summary of what was accomplished",
     "files_touched": ["relative/paths"],
     "next_steps": ["remaining tasks if any"],

     "metadata": {
       "title": "Human-readable title",
       "tags": ["searchable", "tags"]
     }
   }
   ```
   Set `skill` to `null` if no skill was active this session.

6. **Update `workspace/threads/recent.md`**
   Prepend a row to the threads table (create file if absent):
   ```markdown
   # Recent Threads

   | Thread ID | Title | Date | Summary |
   |-----------|-------|------|---------|
   | T-20260123-143052-auth-feature | Auth Feature | 2026-01-23 | Implemented JWT auth |
   ```
   Keep last 15 rows only.

7. **Report**
   ```
   Thread saved: workspace/threads/{thread_id}.json

   Summary: {summary}
   Git: {branch} @ {commit} ({dirty ? "dirty" : "clean"})
   Files: {count} files touched
   Next: {next_steps or "Work complete"}

   To hand off to a fresh session: /handoff
   ```

## Notes

- Run frequently during long sessions
- If session feels long or complex, follow with `/handoff`
- Threads are lightweight JSON — cheap to create, valuable when context runs out
- Thread schema reference: `knowledge/ghq-core/thread-schema.md`
