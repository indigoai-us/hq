---
description: Hand off to fresh session, work continues from checkpoint
allowed-tools: Write, Read, Bash, Edit
argument-hint: [message]
visibility: public
---

# /handoff - Fresh Session Continuity

Prepare for a new session to continue this work.

**User's message (optional):** $ARGUMENTS

## Process

0. **Capture session learnings**
   Reflect on this session. If any reusable learnings exist (mistakes, patterns, gotchas, workflow improvements), call `/learn` for each before proceeding. Skip if nothing novel was learned. See CLAUDE.md `## Session Learnings` for guidance.

0b. **Update knowledge (if applicable)**
    Review session work for domain knowledge worth documenting in company knowledge bases or repo docs. Complements step 0 — learnings = operational rules (NEVER/ALWAYS), knowledge = factual domain docs (what was built, how it works).

    **Quick gate — skip if trivial:**
    If session was a config tweak, typo fix, or minor edit with no new domain knowledge, skip entirely.

    **Detect context:**
    - Active company: infer from `pwd`, files_touched (`companies/{co}/` paths), or repo→company via `companies/manifest.yaml`
    - Active repos: from `pwd`, git remotes
    - Work category: feature, integration, schema change, process, infra, content

    **Scan all 3 doc layers:**

    **Layer 1 — HQ knowledge** (`companies/{co}/knowledge/`):
    ```bash
    ls companies/{co}/knowledge/ 2>/dev/null
    qmd search "{topic}" -c {company} --json -n 3
    ```
    Also use Grep across `companies/{co}/knowledge/` for exact terms if needed — Grep works from HQ root (`.ignore` protects it).

    **Layer 2 — Repo docs** (`{repo}/README.md`, `{repo}/docs/`, `{repo}/.claude/CLAUDE.md`):
    ```bash
    ls {repo}/README.md {repo}/docs/ {repo}/.claude/CLAUDE.md 2>/dev/null
    # Detect boilerplate/stale READMEs
    grep -l "create-next-app\|bootstrapped with\|TODO\|TBD\|FIXME" {repo}/README.md 2>/dev/null
    ```

    **Layer 3 — External docs** (knowledge sites, published docs):
    ```bash
    # Check if company has a knowledge site
    grep -A5 "^{co}:" companies/manifest.yaml | grep -i "knowledge_site\|docs_site" 2>/dev/null
    ls companies/{co}/knowledge/INDEX.md 2>/dev/null  # check for site references
    ```

    **Decide (per layer):**

    *HQ knowledge:*
    - Existing docs cover the work → skip
    - Docs exist but need updating → propose specific edits with file path
    - No docs for this topic → propose new file with suggested name

    *Repo docs:*
    - README is boilerplate (create-next-app, default template) → propose full rewrite with project context
    - README exists but missing new APIs/features/env vars → propose targeted section updates
    - No docs/ folder but session introduced significant architecture → propose new docs
    - `.claude/CLAUDE.md` missing repo-specific agent context → propose creation

    *External docs:*
    - Company has a knowledge site → flag: "New {topic} content available — consider publishing"
    - Do NOT auto-publish — awareness note only

    **Present to user** via AskUserQuestion:
    - Show numbered list of concrete UPDATE/CREATE proposals grouped by layer
    - Options: apply all, pick specific numbers, skip
    - If unsure what to propose, ask open-ended: "This session involved significant {co} work. Any knowledge worth documenting?"

    **Execute selected items:**
    - UPDATES: read existing file, edit relevant section
    - CREATES: write new file in appropriate location, following conventions of sibling files. Include: title heading, description, organized sections
    - Repo READMEs: if boilerplate → full rewrite covering stack, features, API routes, env vars, dev commands, deploy instructions
    - Repo docs/: follow existing conventions (if docs/ already has files, match format)
    - Do NOT regenerate INDEX.md here — step 4 handles it
    - Do NOT commit here — step 3/3b handles it

    **Edge cases:**
    - No company detected → ask user which company, or skip if purely HQ infra work
    - Multi-company session → handle each company separately (company isolation)
    - Knowledge dir has no `.git` → write files anyway, step 3b (HQ commit) catches them
    - Session already updated knowledge/docs directly → scan for remaining coverage gaps only
    - Repo README already comprehensive → skip (don't re-propose what's already covered)

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

3b. **Commit HQ changes**
    Commit any uncommitted HQ changes before handoff:
    ```bash
    if [[ -n $(git status --porcelain) ]]; then
      git add -A
      git commit -m "checkpoint: auto-commit before handoff"
    fi
    ```

4. **Update INDEX files and recent threads**
   - Update `workspace/threads/recent.md` with last 15 threads (table format)
   - Update `INDEX.md` timestamp only (do NOT regenerate full content — it's now slim)
   - Regenerate `workspace/threads/INDEX.md` (all threads, full table)
   - Regenerate `workspace/orchestrator/INDEX.md` (project progress)
   - Check files_touched for any `companies/*/knowledge/` paths — if found, regenerate that company's `knowledge/INDEX.md`
   - See `knowledge/public/hq-core/index-md-spec.md` for INDEX format

4b. **Document release**
    Run `/document-release` — the skill resolves company + project context on its own.
    Best-effort — skip silently on failure.

5. **Update search index**
   ```bash
   qmd update && qmd embed
   ```
   Ensures any content created this session is searchable in the next.

6. **Write handoff note** to `workspace/threads/handoff.json`:
   ```json
   {
     "created_at": "ISO8601 timestamp",
     "message": "user's handoff message if provided",
     "last_thread": "T-20260123-143052-mrr-report",
     "thread_path": "workspace/threads/T-20260123-143052-mrr-report.json",
     "context_notes": "important context for next session"
   }
   ```

7. **Report**
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
