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

0. **Capture session learnings**
   Reflect on this session. If any reusable learnings exist (mistakes, patterns, gotchas, workflow improvements), call `/learn` for each before proceeding. Skip if nothing novel was learned. See CLAUDE.md `## Session Learnings` for guidance.

0c. **Emit observations (best-effort)**
    Scan this session for signals worth capturing. Write each observation as a YAML file to `workspace/curiosity/observations/` named `{YYYY-MM-DD}-{HH-MM-SS}-{slug}.yaml`. This step is best-effort — if anything fails, log the error and continue to step 1. Never block checkpoint completion.

    **Schema** (each YAML file):
    ```yaml
    type: knowledge_gap | stale_knowledge | worker_limitation | repeated_question | external_drift | correction
    signal: "Free-text description of what was observed"
    domain: "file path or category (e.g., knowledge/integrations/slack.md or 'deployment')"
    source_thread: "thread ID if available, or null"
    timestamp: "ISO8601"
    ```

    **Auto-detection — scan the session for these 3 signal types:**

    1. **knowledge_gap** — Any `qmd search`, `qmd vsearch`, or `qmd query` that returned 0 results (the query was asked but HQ had no answer). Signal = the query text.
    2. **correction / stale_knowledge** — Any moment the user corrected factual content (pricing, descriptions, config values) or you noticed a knowledge file contained outdated information. Signal = what was wrong and what the correction was.
    3. **knowledge_gap (from /learn or /remember)** — Any `/learn` or `/remember` invocation during this session indicates something was missing from the knowledge base. Signal = the learning that was captured.

    **Procedure:**
    ```bash
    # Ensure directory exists
    mkdir -p workspace/curiosity/observations
    ```
    For each detected signal, write a YAML file. Use `date -u +%Y-%m-%d-%H-%M-%S` for the timestamp prefix. Append a short slug derived from the signal (e.g., `slack-token-lookup`, `missing-deploy-docs`). Keep slugs to 3-4 words max, lowercase, hyphenated.

    If no signals detected, skip silently — not every session produces observations.

1. **Check for recent auto-checkpoint** (upgrade instead of duplicate)
   ```bash
   # Find auto-checkpoints from last 5 minutes
   find workspace/threads -name "T-*-auto-*.json" -mmin -5 2>/dev/null | sort -r | head -1
   ```
   If found: upgrade that file in-place (add full fields: `initial_commit`, `commits_made`, `remote_url`, `knowledge_repos`, `worker`, `next_steps`; change `type` to `"checkpoint"`; rename file to remove `-auto-`). Then continue from step 7 (INDEX updates).

2. **Generate thread ID** if not provided
   - Format: `T-{YYYYMMDD}-{HHMMSS}-{slug}`
   - Derive slug from recent work (e.g., `mrr-report`, `email-fix`)

3. **Capture git state**
   ```bash
   git rev-parse --abbrev-ref HEAD          # branch
   git remote get-url origin 2>/dev/null    # remote
   git rev-parse --short HEAD               # current commit
   git log --oneline -5                     # recent commits
   git diff --name-only HEAD~3              # recently touched files
   git status --porcelain                   # dirty check
   ```

4. **Capture knowledge repo git states**
   Knowledge folders are separate git repos (symlinked or embedded). For any knowledge path in files_touched, capture its repo state:
   ```bash
   # For each knowledge repo with changes:
   for symlink in knowledge/public/* knowledge/private/* companies/*/knowledge; do
     [ -L "$symlink" ] || [ -d "$symlink/.git" ] || continue
     repo_dir=$(cd "$symlink" && git rev-parse --show-toplevel 2>/dev/null) || continue
     dirty=$(cd "$repo_dir" && git status --porcelain)
     [ -z "$dirty" ] && continue
     echo "$symlink: $(cd "$repo_dir" && git rev-parse --short HEAD) (dirty)"
   done
   ```
   Include dirty knowledge repos in the thread JSON under `git.knowledge_repos`.

5. **Gather session state**
   - Summarize what was accomplished
   - List files touched
   - Identify next steps

6. **Write thread** to `workspace/threads/{thread_id}.json` (include knowledge_repos from step 3):
   ```json
   {
     "thread_id": "T-20260123-143052-mrr-report",
     "version": 1,
     "created_at": "ISO8601",
     "updated_at": "ISO8601",

     "workspace_root": "~/",
     "cwd": "current/working/dir",

     "git": {
       "branch": "main",
       "remote_url": "git@github.com:...",
       "initial_commit": "abc1234",
       "current_commit": "def5678",
       "commits_made": ["hash: message"],
       "dirty": false,
       "knowledge_repos": {
         "knowledge-{company}": {"commit": "abc1234", "dirty": true},
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

7. **Also write legacy checkpoint** to `workspace/checkpoints/{task-id}.json` for backward compat

8. **Update INDEX files and recent threads**
   - Update `workspace/threads/recent.md` with last 15 threads (table format)
   - Update `INDEX.md` timestamp only (do NOT regenerate full content — it's now slim)
   - Regenerate `workspace/threads/INDEX.md` (all threads, full table)
   - Check files_touched for any `companies/*/knowledge/` paths — if found, regenerate that company's `knowledge/INDEX.md`
   - See `knowledge/public/hq-core/index-md-spec.md` for INDEX format

9. **Report**
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
