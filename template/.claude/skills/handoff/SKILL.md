---
name: handoff
description: Prepare for a new session to continue this work. Commits dirty repos, captures session state to a thread file, writes handoff.json, and updates the search index. Ensures continuity across sessions.
allowed-tools: Read, Write, Edit, Grep, Glob, Bash(git:*), Bash(qmd:*), Bash(ls:*), Bash(date:*)
---

# Fresh Session Continuity

Prepare for a new session to continue this work. Commits pending changes, writes thread state, and produces a handoff pointer.

## Process

### 0. Capture Session Learnings

Reflect on the session and note any reusable learnings (mistakes that cost time, unexpected behaviors, patterns that worked well, gotchas). If there are notable learnings, include them in the thread file's `learnings` array when writing it. If nothing new was learned, skip.

### 0b. Update Knowledge (skip if trivial)

If session was a config tweak, typo fix, or minor edit with no new domain knowledge, skip entirely.

Otherwise:
- Detect active company from pwd or files touched. If ambiguous, scan `companies/manifest.yaml` for a company whose repos match current cwd
- Check `companies/{co}/knowledge/` for relevant docs
- If significant domain knowledge was created, note it in the thread file's `conversation_summary`

### 1. Ensure Thread Exists

Check `workspace/threads/` for a recent thread file. If none exists, write a basic checkpoint thread file first:

```json
{
  "thread_id": "T-{YYYYMMDD}-{HHMMSS}-handoff",
  "version": 1,
  "type": "handoff",
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "workspace_root": "~/Documents/HQ",
  "cwd": "current/working/dir",
  "git": {
    "branch": "current-branch",
    "current_commit": "abc1234",
    "dirty": false
  },
  "conversation_summary": "What was accomplished this session",
  "next_steps": ["What should happen next"],
  "files_touched": ["relative/paths"],
  "learnings": [],
  "metadata": {
    "title": "Handoff: brief description",
    "tags": ["handoff"]
  }
}
```

### 2. Find Latest Thread

```bash
ls -t workspace/threads/*.json | head -1
```

Update the thread file with current session state if needed (conversation_summary, next_steps, git state, files_touched, learnings).

### 3. Commit Dirty Knowledge Repos

```bash
for dir in knowledge/public/* knowledge/private/* companies/*/knowledge; do
  [ -d "$dir/.git" ] || { [ -L "$dir" ] && target=$(cd "$dir" && git rev-parse --show-toplevel 2>/dev/null) || continue; dir="$target"; } || continue
  dirty=$(cd "$dir" && git status --porcelain 2>/dev/null)
  [ -z "$dirty" ] && continue
  (cd "$dir" && git add -A && git commit -m "checkpoint: auto-commit before handoff")
done
```

### 3b. Commit HQ Changes

```bash
cd ~/Documents/HQ
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -m "checkpoint: auto-commit before handoff"
fi
```

### 4. Update Search Index

```bash
qmd update 2>/dev/null && qmd embed 2>/dev/null || true
```

Skip silently if qmd CLI is unavailable.

### 5. Write Handoff Note

Write to `workspace/threads/handoff.json`:

```json
{
  "created_at": "ISO8601 timestamp",
  "message": "user's handoff message if provided",
  "last_thread": "T-{YYYYMMDD}-{HHMMSS}-{slug}",
  "thread_path": "workspace/threads/T-{YYYYMMDD}-{HHMMSS}-{slug}.json",
  "context_notes": "important context for next session"
}
```

### 6. Report

```
Handoff ready.

Latest thread: {thread_id}
Summary: {conversation_summary}
Git: {branch} @ {commit}

To continue in a fresh session:
1. Start new session
2. Run: startwork (it will find your thread)

Or read: workspace/threads/handoff.json
```

## Rules

- Always commit all pending changes before writing handoff.json
- Never leave partial file edits — save everything first
- Thread file must be valid JSON
- handoff.json must point to the actual latest thread file
- If git state is dirty after commit attempts, note it in the report
- Skip INDEX.md rebuilds (Claude Code-specific)
- If `document-release` skill is available, run it. Otherwise skip silently
- Use `qmd update` via shell command — skip silently if unavailable
- Context diet: don't load extra files just for the handoff. Use what's already in context
