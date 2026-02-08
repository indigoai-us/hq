---
description: Save checkpoint and check context status
allowed-tools: Write, Bash, Read
argument-hint: [task-id]
visibility: public
---

# /checkpoint - Save Progress

Save current work state as a thread to survive context loss.

**Task ID (optional):** $ARGUMENTS

## Process

1. **Generate thread ID** if not provided
   - Format: `T-{YYYYMMDD}-{HHMMSS}-{slug}`
   - Derive slug from recent work (e.g., `mrr-report`, `email-fix`)

2. **Capture git state**
   ```bash
   git rev-parse --abbrev-ref HEAD          # branch
   git remote get-url origin 2>/dev/null    # remote
   git rev-parse --short HEAD               # current commit
   git log --oneline -5                     # recent commits
   git diff --name-only HEAD~3              # recently touched files
   git status --porcelain                   # dirty check
   ```

3. **Capture knowledge repo git states**
   Knowledge folders are separate git repos (symlinked). For any knowledge path in files_touched, capture its repo state:
   ```bash
   # For each knowledge repo with changes:
   for symlink in knowledge/public/* knowledge/private/* companies/*/knowledge; do
     [ -L "$symlink" ] || continue
     repo_dir=$(cd "$symlink" && git rev-parse --show-toplevel 2>/dev/null) || continue
     dirty=$(cd "$repo_dir" && git status --porcelain)
     [ -z "$dirty" ] && continue
     echo "$symlink: $(cd "$repo_dir" && git rev-parse --short HEAD) (dirty)"
   done
   ```
   Include dirty knowledge repos in the thread JSON under `git.knowledge_repos`.

4. **Gather session state**
   - Summarize what was accomplished
   - List files touched
   - Identify next steps

5. **Write thread** to `workspace/threads/{thread_id}.json` (include knowledge_repos from step 3):
   ```json
   {
     "thread_id": "T-20260123-143052-mrr-report",
     "version": 1,
     "created_at": "ISO8601",
     "updated_at": "ISO8601",

     "workspace_root": "~/Documents/HQ",
     "cwd": "current/working/dir",

     "git": {
       "branch": "main",
       "remote_url": "git@github.com:...",
       "initial_commit": "abc1234",
       "current_commit": "def5678",
       "commits_made": ["hash: message"],
       "dirty": false,
       "knowledge_repos": {
         "knowledge-acme": {"commit": "abc1234", "dirty": true},
         "knowledge-ralph": {"commit": "def5678", "dirty": false}
       }
     },

     "worker": {
       "id": "worker-id or null",
       "skill": "skill-name or null",
       "state": "completed"
     },

     "conversation_summary": "1-2 sentence summary",
     "files_touched": ["relative/paths"],
     "next_steps": ["remaining tasks"],

     "metadata": {
       "title": "Human-readable title",
       "tags": ["searchable", "tags"]
     }
   }
   ```

6. **Also write legacy checkpoint** to `workspace/checkpoints/{task-id}.json` for backward compat

7. **Update INDEX.md files**
   - Regenerate `INDEX.md` at HQ root with current:
     - Workers from `workers/registry.yaml`
     - Recent threads from `workspace/threads/`
     - Update timestamp
   - Regenerate `workspace/threads/INDEX.md` (all threads, full table)
   - Check files_touched for any `companies/*/knowledge/` paths — if found, regenerate that company's `knowledge/INDEX.md`
   - See `knowledge/public/hq-core/index-md-spec.md` for INDEX format

8. **Report**
   ```
   Thread saved: workspace/threads/{thread_id}.json

   Summary: {summary}
   Git: {branch} @ {commit} ({dirty ? "dirty" : "clean"})
   Files: {count} files touched
   Next: {next_steps or "Work complete"}

   To hand off to fresh session: /handoff
   ```

## Thread vs Checkpoint

| Feature | Thread (new) | Checkpoint (legacy) |
|---------|--------------|---------------------|
| Git context | Full (branch, commits, dirty) | Minimal |
| Worker state | Captured | Not captured |
| Location | workspace/threads/ | workspace/checkpoints/ |
| Format | Rich JSON | Simple JSON |

## Notes

- Threads ensure work survives context clears
- Run frequently during long sessions
- If session feels long, suggest `/handoff`
- Threads are searchable via `/search`
