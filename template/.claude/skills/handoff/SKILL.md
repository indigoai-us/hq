---
name: handoff
description: Prepare for a new session to continue this work. Captures session learnings, syncs domain knowledge and insights, commits dirty repos, writes a thread file and handoff.json, updates INDEX files, and refreshes the search index. Ensures continuity across sessions.
allowed-tools: Read, Write, Edit, Grep, Glob, Bash(git:*), Bash(qmd:*), Bash(ls:*), Bash(date:*), Bash(jq:*)
---

# Fresh Session Continuity

Prepare for a new session to continue this work. Commit pending changes, capture learnings and insights, write thread state, update INDEX files, and produce a handoff pointer.

**User's message (optional):** $ARGUMENTS

## Process

### 0. Capture Session Learnings

Reflect on this session. If any reusable learnings exist (mistakes that cost time, unexpected behaviors, patterns that worked well, gotchas, workflow improvements), run the `learn` skill for each before proceeding. Skip if nothing novel was learned.

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

### 0c. Extract Session Insights

Complements step 0 (operational rules) and step 0b (domain knowledge).
Insights are educational understanding (why things work, patterns, concepts).

**Quick gate — skip if:** Session was purely mechanical (deploys, config, quick fixes) with no educational Insight blocks or explanatory content generated.

**If insights exist:**
Self-reflect on session for 0-5 educational/conceptual takeaways worth persisting.
For each, run the `learn` skill with source `session-insight`:
- Title + core insight text (2-4 sentences)
- `learn` handles dedup, scope classification, and writes to `workspace/insights/`

**Rules:**
- Only persist genuinely reusable understanding, not session-specific facts
- An insight about "why EventBridge retries reset on DLQ republish" = good
- "We deployed to staging" = not an insight, skip
- Max 5 per handoff (cap token cost)

### 1. Ensure Thread Exists

Check `workspace/threads/` for a recent thread file. If none exists, run the `checkpoint` skill first to create one, or write a basic thread file inline:

```json
{
  "thread_id": "T-{YYYYMMDD}-{HHMMSS}-handoff",
  "version": 1,
  "type": "handoff",
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "workspace_root": "~/HQ",
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

Knowledge folders are separate git repos (often symlinked). Before handoff, commit any uncommitted knowledge changes:

```bash
for symlink in knowledge/public/* knowledge/private/* companies/*/knowledge; do
  [ -L "$symlink" ] || [ -d "$symlink/.git" ] || continue
  repo_dir=$(cd "$symlink" && git rev-parse --show-toplevel 2>/dev/null) || continue
  dirty=$(cd "$repo_dir" && git status --porcelain)
  [ -z "$dirty" ] && continue
  (cd "$repo_dir" && git add -A && git commit -m "checkpoint: auto-commit before handoff")
done
```

### 3b. Commit HQ Changes

```bash
cd ~/HQ
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

Run the `document-release` skill — it resolves company + project context on its own. Best-effort — skip silently on failure or if the skill is unavailable.

### 5. Update Search Index

```bash
qmd update 2>/dev/null && qmd embed 2>/dev/null || true
```

Ensures any content created this session is searchable in the next. Skip silently if qmd CLI is unavailable.

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
