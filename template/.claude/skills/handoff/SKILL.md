---
name: handoff
description: Prepare for a new session to continue this work. Captures session learnings, syncs domain knowledge and insights, commits dirty repos, writes a thread file and handoff.json, updates INDEX files, and refreshes the search index. Ensures continuity across sessions.
allowed-tools: Read, Write, Edit, Grep, Glob, Bash(git:*), Bash(qmd:*), Bash(nohup:*), Bash(ls:*), Bash(date:*), Bash(jq:*)
---

# Fresh Session Continuity

Prepare for a new session to continue this work. Commit pending changes, capture learnings and insights, write thread state, update INDEX files, and produce a handoff pointer.

**User's message (optional):** $ARGUMENTS

## Process

### 0. Capture Session Learnings

**Concurrent Launch — run this first, before reflection:**

Launch the knowledge repo git loop as a background process so it runs concurrently with learning capture:

```bash
nohup bash -c '
for symlink in knowledge/public/* knowledge/private/* companies/*/knowledge; do
  [ -L "$symlink" ] || [ -d "$symlink/.git" ] || continue
  repo_dir=$(cd "$symlink" && git rev-parse --show-toplevel 2>/dev/null) || continue
  dirty=$(cd "$repo_dir" && git status --porcelain)
  [ -z "$dirty" ] && continue
  (cd "$repo_dir" && git add -A && git commit -m "checkpoint: auto-commit before handoff") \
    && echo "OK: $repo_dir" || echo "ERR: $repo_dir"
done
' > /tmp/handoff-git-bg.log 2>&1 &
echo $! > /tmp/handoff-git-bg.pid
```

Now proceed with learning capture while git commits run in background.

Reflect on this session and collect ALL operational learnings into a structured list — do NOT call the `learn` skill yet. Learnings include: mistakes that cost time, unexpected behaviors, patterns that worked well, gotchas, workflow improvements, user corrections.

If no learnings found, skip entirely.

**If learnings exist**, format them as a batch JSON array:
```json
[
  {"type": "rule", "content": "NEVER: ...", "scope": "global|company:{co}|...", "source": "session-learning"},
  {"type": "rule", "content": "ALWAYS: ...", "scope": "global", "source": "session-learning"}
]
```

Then call the `learn` skill **ONCE** with the entire batch array as input.

**Why batch:** Collect all learnings into a batch first, then invoke the `learn` skill once with the full array — this runs qmd dedup once and rebuilds the policy digest once instead of 3-8 times.

### 0b. Update Knowledge (skip if trivial)

Review session work for domain knowledge worth documenting in company knowledge bases or repo docs. Complements step 0 — learnings are operational rules (NEVER/ALWAYS); knowledge is factual domain docs (what was built, how it works).

**Quick gate — skip if trivial:** If the session was a config tweak, typo fix, or minor edit with no new domain knowledge, skip entirely.

**Detect context:**
- Active company: infer from `pwd`, files touched (`companies/{co}/` paths), or repo→company via `companies/manifest.yaml`
- Active repos: from `pwd`, git remotes
- Work category: feature, integration, schema change, process, infra, content

**Scan all 3 doc layers:**

Layer 1 — HQ knowledge (`companies/{co}/knowledge/`):
```bash
ls companies/{co}/knowledge/ 2>/dev/null
qmd search "{topic}" -c {company} --json -n 3
```
Grep works across `companies/{co}/knowledge/` for exact terms (`.ignore` protects Grep from HQ root).

Layer 2 — Repo docs (`{repo}/README.md`, `{repo}/docs/`, `{repo}/.claude/CLAUDE.md`):
```bash
ls {repo}/README.md {repo}/docs/ {repo}/.claude/CLAUDE.md 2>/dev/null
grep -l "create-next-app\|bootstrapped with\|TODO\|TBD\|FIXME" {repo}/README.md 2>/dev/null
```

Layer 3 — External docs (knowledge sites, published docs):
```bash
grep -A5 "^{co}:" companies/manifest.yaml | grep -i "knowledge_site\|docs_site" 2>/dev/null
ls companies/{co}/knowledge/INDEX.md 2>/dev/null
```

**Decide (per layer):**

*HQ knowledge:*
- Existing docs cover the work → skip
- Docs exist but need updating → propose specific edits with file path
- No docs for this topic → propose new file with suggested name

*Repo docs:*
- README is boilerplate (create-next-app, default template) → propose full rewrite with project context
- README exists but missing new APIs/features/env vars → propose targeted section updates
- No `docs/` folder but session introduced significant architecture → propose new docs
- `.claude/CLAUDE.md` missing repo-specific agent context → propose creation

*External docs:*
- Company has a knowledge site → flag: "New {topic} content available — consider publishing"
- Awareness note only — skip auto-publishing

**Present to user:**
Ask the user with a numbered list of concrete UPDATE/CREATE proposals grouped by layer. Options: apply all, pick specific numbers, skip. If unsure what to propose, ask open-ended: "This session involved significant {co} work. Any knowledge worth documenting?"

**Execute selected items:**
- UPDATES: read existing file, edit relevant section
- CREATES: write new file in appropriate location, following conventions of sibling files. Include title heading, description, organized sections
- Repo READMEs: if boilerplate → full rewrite covering stack, features, API routes, env vars, dev commands, deploy instructions
- Repo docs/: follow existing conventions (if `docs/` already has files, match format)
- INDEX.md regeneration is handled in step 4 — skip here
- Committing is handled in step 3/3b — skip here

**Edge cases:**
- No company detected → ask user which company, or skip if purely HQ infra work
- Multi-company session → handle each company separately (company isolation)
- Knowledge dir has no `.git` → write files anyway; step 3b (HQ commit) catches them
- Session already updated knowledge/docs directly → scan for remaining coverage gaps only
- Repo README already comprehensive → skip (don't re-propose what's already covered)

### 0c. Sync Barrier — Wait for Background Git

Wait for the background git process launched at Step 0 start to complete before proceeding. This ensures all knowledge repo commits are finished before Step 3b commits HQ changes.

```bash
GIT_BG_PID=$(cat /tmp/handoff-git-bg.pid 2>/dev/null)
if [ -n "$GIT_BG_PID" ]; then
  wait "$GIT_BG_PID" 2>/dev/null || true
  git_log=$(cat /tmp/handoff-git-bg.log 2>/dev/null)
  if echo "$git_log" | grep -q "^ERR:"; then
    echo "Warning: Some knowledge repo commits had errors:"
    echo "$git_log" | grep "^ERR:"
    # Record error for handoff report — handoff continues regardless
    GIT_BG_ERRORS="$(echo "$git_log" | grep "^ERR:")"
  fi
  rm -f /tmp/handoff-git-bg.pid
fi
```

If errors are found, record them in `$GIT_BG_ERRORS` for inclusion in the Step 8 report. Do NOT abort the handoff — continue to the next step regardless of errors.

### 1. Ensure Thread Exists

Check `workspace/threads/` for a recent thread file. If none exists, run the `checkpoint` skill first to create one, or write a basic thread file inline:

```json
{
  "thread_id": "T-{YYYYMMDD}-{HHMMSS}-handoff",
  "version": 1,
  "type": "handoff",
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "workspace_root": "/Users/{your-name}/Documents/HQ",
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

Knowledge repo commits ran as a background process launched at Step 0 start. The sync barrier in Step 0c awaited completion. **Skip the git loop here** — it already ran. If Step 0c reported errors, note them in Step 8 (Report).

### 3b. Commit HQ Changes

```bash
cd /Users/{your-name}/Documents/HQ
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -m "checkpoint: auto-commit before handoff"
fi
```

### 4. Update INDEX Files and Recent Threads

- Update `workspace/threads/recent.md` with last 15 threads (table format)
- Update `INDEX.md` timestamp only (do not regenerate full content — it's slim by design)
- Regenerate `workspace/threads/INDEX.md` (all threads, full table)
- Regenerate `workspace/orchestrator/INDEX.md` (project progress)
- Check files_touched for any `companies/*/knowledge/` paths — if found, regenerate that company's `knowledge/INDEX.md`
- See `knowledge/public/hq-core/index-md-spec.md` for INDEX format

### 4b. Document Release

**Session scope gate** — evaluate before running document-release:

Read `files_touched` from the latest thread file (identified in Step 2). Check whether any path matches `companies/*/` or `repos/*/` patterns:

```bash
# THREAD_FILE = path found in Step 2 (e.g. workspace/threads/T-20260415-123456-handoff.json)
jq -r '.files_touched[]? // empty' "$THREAD_FILE" 2>/dev/null \
  | grep -qE '(companies/|repos/)' \
  && echo "SCOPE:company-or-repo" || echo "SCOPE:hq-only"
```

- **SCOPE:hq-only** → skip Step 4b entirely. Print: `Document-release skipped (no company/repo files touched)` and continue to Step 5.
- **SCOPE:company-or-repo** → proceed with document-release below.

*Why this gate exists:* `document-release` is a heavyweight sub-skill (20-60s) that audits company/repo docs, diffs changes, and may ask interactive questions. For sessions that only touched HQ infra files (skills, policies, orchestrator state, thread files), this audit is a no-op and wastes time. Gating on session scope is the highest-value single optimization for pure HQ infra sessions.*

**If scope matched:** Run the `document-release` skill — it resolves company + project context on its own. Best-effort — skip silently on failure or if the skill is unavailable.

### 5. Update Search Index (Background)

Launch qmd reindex as a fire-and-forget background process — do NOT wait for it to complete:

```bash
nohup bash -c 'qmd cleanup 2>/dev/null; qmd update 2>/dev/null && qmd embed 2>/dev/null' > /tmp/qmd-handoff.log 2>&1 &
```

- `qmd cleanup` runs first to clear tombstones (fixes SQLite UNIQUE constraint crash from stale index entries)
- `qmd update` reindexes new content for BM25 search
- `qmd embed` generates embeddings for semantic search (may take 30-90s — runs entirely in background)
- Log output goes to `/tmp/qmd-handoff.log` for diagnostics
- Proceed immediately to Steps 6-8 — do NOT wait for this process
- Skip silently if qmd CLI is unavailable

### 6. Detect Active Pipelines

Check for in-progress pipelines to include in handoff state:

```bash
for sf in workspace/orchestrator/_pipeline/*/pipeline-state.json; do
  [ -f "$sf" ] || continue
  status=$(jq -r '.status // ""' "$sf" 2>/dev/null)
  if [ "$status" = "in_progress" ] || [ "$status" = "paused" ]; then
    pipeline_id=$(jq -r '.pipeline_id' "$sf")
    company=$(jq -r '.company' "$sf")
    done_count=$(jq -r '.summary.done // 0' "$sf")
    total=$(jq -r '.summary.total // 0' "$sf")
    echo "Active pipeline: ${pipeline_id} (${company}) — ${done_count}/${total} done"
  fi
done
```

If any active/paused pipelines are found, include in `handoff.json`:

```json
"active_pipeline": {
  "id": "{pipeline_id}",
  "company": "{company}",
  "status": "{status}",
  "progress": "{done}/{total}"
}
```

In the final report, suggest: `scripts/run-pipeline.sh --resume {pipeline_id}` to reconnect.

### 7. Write Handoff Note

Write to `workspace/threads/handoff.json`:

```json
{
  "created_at": "ISO8601 timestamp",
  "message": "user's handoff message if provided",
  "last_thread": "T-20260123-143052-mrr-report",
  "thread_path": "workspace/threads/T-20260123-143052-mrr-report.json",
  "context_notes": "important context for next session"
}
```

### 8. Report

```
Handoff ready.

Latest thread: {thread_id}
Summary: {conversation_summary}
Git: {branch} @ {commit}

To continue in a fresh session:
1. Start a new session
2. Run: startwork (it will find your thread)

Or read: workspace/threads/handoff.json

Note: qmd reindex running in background → /tmp/qmd-handoff.log
```

If `$GIT_BG_ERRORS` is set (from Step 0c), append to the report:

```
⚠ Knowledge repo git errors: {GIT_BG_ERRORS}
```

## Thread vs Checkpoint

Threads are the current format with richer context:
- Git state (branch, commits, dirty)
- Worker state (skill, status)
- Better searchability

Legacy checkpoints in `workspace/checkpoints/` still work.

## Why Fresh Sessions

Fresh context means:
- No accumulated noise from previous work
- Clean slate for complex tasks
- Follows Ralph methodology (fresh agent per task)

Use handoff when:
- Session has been running a while
- Switching to a different type of task
- Want cleaner separation between work chunks

## Rules

- Always commit all pending changes before writing `handoff.json`
- Never leave partial file edits — save everything first
- Thread file must be valid JSON
- `handoff.json` must point to the actual latest thread file
- If git state is dirty after commit attempts, note it in the report
- Context diet: don't load extra files just for the handoff. Use what's already in context
- Session handoffs execute steps directly — skip any planning-mode detour
