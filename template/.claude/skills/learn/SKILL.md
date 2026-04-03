---
name: learn
description: Capture and classify learnings as structured policy files. Deduplicates via qmd (Grep fallback). Callable manually or from /execute-task and /run-project.
allowed-tools: Read, Write, Edit, Grep, Bash(qmd:*), Bash(grep:*), Bash(mkdir:*), Bash(date:*), Bash(ls:*)
---

# Learn - Automated Learning Pipeline

Capture a learning, classify it, and inject the rule as a structured policy file in the correct directory.

Called programmatically by `$execute-task` and `$run-project` after task completion or failure. Also callable manually. `$remember` delegates here.

**Input:** The user's argument — structured JSON event data, or free text description of what to learn.

**Note:** Hook-triggered mode (observe-patterns) is not available in Codex. Use manual invocation or structured JSON from task pipelines instead.

## Core Principle

**Policy files are the primary output.** Learnings become structured policy files in scope-appropriate directories:

| Scope | Target directory | Format |
|-------|-----------------|--------|
| Company | `companies/{co}/policies/{slug}.md` | Policy file (YAML frontmatter + Rule + Rationale) |
| Repo | `repos/{pub\|priv}/{repo}/.claude/policies/{slug}.md` | Policy file |
| Command | `.claude/policies/{slug}.md` (scope: command) | Policy file |
| Global | `.claude/policies/{slug}.md` | Policy file |
| Worker (legacy) | `workers/*/{id}/worker.yaml` | Instructions block `## Learnings` |

**Before creating:** always scan existing policies for updates (Step 4.5). Update > duplicate.

## Step 1: Parse Input

### Mode A: Structured JSON (from $execute-task / $run-project)

If input is a JSON object:
```json
{
  "task_id": "TASK-001",
  "project": "my-project",
  "source": "back-pressure-failure|user-correction|success-pattern|task-completion|build-activity",
  "severity": "critical|high|medium|low",
  "scope": "global|worker:{id}|command:{name}|knowledge:{path}|project:{slug}",
  "workers_used": ["backend-dev"],
  "back_pressure_failures": [{"worker": "frontend-dev", "check": "lint", "error": "..."}],
  "retries": 0,
  "key_decisions": ["..."],
  "issues_encountered": ["..."],
  "patterns_discovered": ["..."]
}
```

Parse it and proceed to Step 2.

### Mode B: Free Text (manual invocation or $remember delegation)

Parse for keywords to determine scope. Generate rule statement from description. Proceed to Step 2.

## Step 2: Extract Rules

From structured input, generate rules:

- `back_pressure_failures` → `NEVER: {anti-pattern that caused failure}` (scope: worker:{id})
- `retries > 0` → Rule about what caused retry and how to avoid it
- `key_decisions` → `ALWAYS: {pattern}` if broadly applicable
- `issues_encountered` → Scoped rule to prevent recurrence
- `patterns_discovered` → `ALWAYS: {pattern}` for success patterns

From free text:
- Extract the core rule in NEVER/ALWAYS/condition→action format

If no meaningful rules can be extracted (task completed cleanly, no failures, no notable patterns), skip injection — log to event log only.

## Step 3: Classify Scope & Resolve Target

For each extracted rule, determine scope (most specific wins):

| Signal | Scope | Policy directory |
|--------|-------|------------------|
| Related to specific company | `company` | `companies/{co}/policies/` |
| Related to specific repo | `repo` | `repos/{pub\|priv}/{repo}/.claude/policies/` |
| Error in specific command | `command` | `.claude/policies/` (with `scope: command`) |
| Failure in specific worker | `worker` | `workers/*/{id}/worker.yaml` instructions block |
| Universal pattern | `global` | `.claude/policies/` |
| User correction via $remember | From context, default global | Detected scope directory |

**Resolve company/repo context:**
- From `prd.json` metadata if in project context
- From `companies/manifest.yaml` repo lookup if in repo context
- From worker path if worker-scoped (`companies/{co}/workers/` → `{co}`)
- Fall back to `.claude/policies/` (global scope)

## Step 4: Dedup Check

**Primary (if qmd available):**
```bash
qmd vsearch "{rule text}" --json -n 5
```

Check results for similarity to the new rule:
- Similarity > 0.85 → **Skip** (already captured somewhere)
- Similarity 0.6–0.85 → **Merge** (update existing rule to be more precise)
- Similarity < 0.6 → **Add new**

**Fallback (if qmd unavailable):**
Use the Grep tool to search for key terms from the rule across the policy directories:
- Pattern: key terms from the rule (2-3 significant words)
- Files: `*.md` in `companies/*/policies/`, `.claude/policies/`, and any repo policy dirs
- If matching content found → review and decide whether to merge or skip

Report dedup action taken.

## Step 4.5: Scan Existing Policies

Before creating a new rule, check if an existing policy file already covers this topic:

1. **Resolve policy directories** based on scope:
   - Company scope → scan `companies/{co}/policies/` (skip `example-policy.md`)
   - Repo scope → scan `{repoPath}/.claude/policies/`
   - Global/command scope → scan `.claude/policies/`

2. **Search for matching policies** using Grep:
   - Pattern: key terms from the rule
   - Files: `*.md` in the resolved policy directory
   - Also check qmd vsearch results from Step 4 for hits in policy files

3. **If matching policy found:**
   - Read the policy file
   - **Update** the existing policy: append to `## Rule` section, bump `version`, update `updated` date
   - If new learning contradicts existing policy, flag for user review instead of auto-merging
   - Set `dedup_action: "merged-into-policy"` in event log

4. **If no matching policy found:**
   - Proceed to Step 5 (create new rule)
   - Prefer creating a **policy file** over injecting into worker.yaml or CLAUDE.md

## Step 5: Create or Update Policy File

### Primary: Policy File (company/repo/global/command scopes)

If Step 4.5 found a matching policy → update was already handled. Otherwise, create a new policy file.

**Target directory:**
- Company scope → `companies/{co}/policies/{slug}.md`
- Repo scope → `repos/{pub|priv}/{repo}/.claude/policies/{slug}.md`
- Command scope → `.claude/policies/{slug}.md`
- Global scope → `.claude/policies/{slug}.md`

**Create the directory if needed:**
```bash
mkdir -p {target_directory}
```

**Policy file format:**

```markdown
---
id: {scope-prefix}-{slug}
title: {Rule title}
scope: {company|repo|command|global}
trigger: {when this applies}
enforcement: {hard|soft}
version: 1
created: {YYYY-MM-DD}
updated: {YYYY-MM-DD}
source: {back-pressure-failure|user-correction|success-pattern|task-completion}
---

## Rule

{Rule in imperative form}

## Rationale

{Why this rule exists — from context/failure/correction}
```

**Enforcement mapping:**
- `source: user-correction` → `enforcement: hard`
- `severity: critical` → `enforcement: hard`
- Everything else → `enforcement: soft`

**Slug generation:** lowercase, hyphens, from rule keywords. Prefix: `{co}-` for company, `{repo}-` for repo, `hq-cmd-{name}-` for command, `hq-` for global.

### Fallback: Worker.yaml (worker-scoped learnings)

For worker-specific learnings, inject into `workers/*/{id}/worker.yaml` instructions block:

```yaml
instructions: |
  ...existing instructions...

  ## Learnings
  - NEVER: {new rule}
```

### Legacy: CLAUDE.md Learned Rules (global promotion only)

Only used for **global promotion** of critical/user-correction rules (Step 6).

## Step 6: Evaluate Global Promotion

If the rule was injected into a scoped file (worker/command/knowledge), also add to `.claude/CLAUDE.md` `## Learned Rules` if ANY:
- `severity == critical`
- `source == user-correction` (explicit $remember invocation)
- Rule triggered 3+ times (check event log)

### Cap Enforcement

`## Learned Rules` is capped at 20 rules.

1. Count existing rules in section
2. If >= 20: find the oldest rule (by date in comment), remove it from CLAUDE.md
   - The rule still lives in its source file — only the CLAUDE.md copy is removed
3. Append new rule

Format:
```markdown
- **{NEVER|ALWAYS}**: {rule} <!-- {source} | {date} -->
```

## Step 7: Log Event

```bash
mkdir -p workspace/learnings
```

Write `workspace/learnings/learn-{YYYYMMDD-HHMMSS}.json`:
```json
{
  "event_id": "learn-{timestamp}",
  "rules": [
    {
      "rule": "NEVER: ...",
      "scope": "worker:frontend-dev",
      "target_file": "workers/public/dev-team/frontend-dev/worker.yaml",
      "severity": "high"
    }
  ],
  "source": "back-pressure-failure",
  "task_id": "TASK-001",
  "project": "my-project",
  "dedup_action": "new|merged|skipped",
  "promoted_to_global": true,
  "created_at": "{ISO8601}"
}
```

## Step 8: Reindex

```bash
qmd update 2>/dev/null || true
```

## Step 9: Report

```
Learning captured:
  Rule: {rule}
  Target: {policy file path | worker.yaml path}
  Action: {created-policy | updated-policy | merged-into-policy | worker-yaml-injection}
  Global: {promoted|not promoted}
  Dedup: {new|merged|skipped}
  Event: workspace/learnings/learn-{timestamp}.json
```

If multiple rules extracted, report each.

## Rules

- **Policy files first** — always create structured policy files for company/repo/global/command scoped rules. Worker.yaml injection only for worker-specific learnings
- **Scan before create** — always check existing policies for updates before creating new files (Step 4.5)
- **Never inject empty/trivial rules** — "task completed successfully" is not a learning
- **Dedup is mandatory** — always check before injecting (qmd first, Grep fallback)
- **Global cap is hard** — never exceed 20 rules in CLAUDE.md `## Learned Rules`
- **Reindex after every injection** — keeps qmd search current
- **Preserve existing rules** — append only, never overwrite existing rules
- **User corrections always promote** — $remember delegations go to both target file AND CLAUDE.md
- **Match existing style** — use the same rule format as existing rules in the target file
- **No hook-triggered mode** — observe-patterns integration not available in Codex; skip if input is empty
