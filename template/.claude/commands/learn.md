---
description: Auto-capture and classify learnings from task execution
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
argument-hint: [json-event or "rule description"]
visibility: public
---

# /learn - Automated Learning Pipeline

Capture a learning, classify it, and inject the rule directly into the file it governs.

Called programmatically by `/execute-task` and `/run-project` after task completion or failure. Also callable manually. `/remember` delegates here.

**Input:** $ARGUMENTS

**Input modes:**
- Structured JSON (from /execute-task): Full learning event data with scope, severity, patterns
- Free text (manual): Description of what to learn
- Empty/"auto" (hook-triggered): Read from `.observe-patterns-latest.json` if it exists (created by observe-patterns.sh hook)

## Core Principle

**Policy files are the primary output.** Learnings become structured policy files in scope-appropriate directories:

| Scope | Target directory | Format |
|-------|-----------------|--------|
| Company | `companies/{co}/policies/{slug}.md` | Policy file (YAML frontmatter + Rule + Rationale) |
| Repo | `repos/{pub|priv}/{repo}/.claude/policies/{slug}.md` | Policy file |
| Command | `.claude/policies/{slug}.md` (scope: command) | Policy file |
| Global | `.claude/policies/{slug}.md` | Policy file |
| Worker (legacy) | `workers/*/{id}/worker.yaml` | Instructions block `## Learnings` |

**Before creating:** always scan existing policies for updates (Step 4.5). Update > duplicate.

## Step 1: Parse Input

**Three input modes:**

### Mode 1: Hook-Triggered (auto/empty input)

If `$ARGUMENTS` is empty or "auto":
1. Check for `workspace/learnings/.observe-patterns-latest.json`
2. If file exists, read it and extract observations array
3. For each observation in the array:
   - Extract `pattern_type`, `confidence`, `description`, `severity`, `evidence`
   - Generate structured learning event with `source: "hook-observation"`, `scope: "global"` (or inferred from pattern type)
   - Process through Steps 2–9 (Extract Rules, Classify Scope, Dedup, Inject, etc.)
4. Delete the file after processing all observations
5. Report each learning processed

Example `.observe-patterns-latest.json`:
```json
{
  "metadata": {
    "created_at": "2026-03-07T21:35:00Z",
    "session_end_timestamp": "20260307-213500",
    "git_branch": "main",
    "git_commit": "abc1234",
    "project_context": "hq"
  },
  "observations": [
    {
      "pattern_type": "back-pressure-retry",
      "confidence": 0.8,
      "description": "Git log shows fixup/amend commits",
      "severity": "high",
      "evidence": "fixup commits in recent history",
      "recommendation": "Extract pattern about what caused retry"
    }
  ]
}
```

**If structured JSON** (from /execute-task):
```json
{
  "task_id": "TASK-001",
  "project": "my-project",
  "source": "back-pressure-failure|user-correction|success-pattern|task-completion|build-activity|hook-observation",
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

**If free text** (manual invocation or /remember delegation):
- Parse for keywords to determine scope
- Generate rule statement from description

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
| Related to specific repo | `repo` | `repos/{pub|priv}/{repo}/.claude/policies/` |
| Error in specific command | `command` | `.claude/policies/` (with `scope: command`) |
| Failure in specific worker | `worker` | `workers/*/{id}/worker.yaml` instructions block (legacy, still supported) |
| Universal pattern | `global` | `.claude/policies/` |
| User correction via /remember | From context, default global | Detected scope directory |

**Primary output = policy files.** The canonical format for persistent rules is structured policy files (per `knowledge/public/hq-core/policies-spec.md`). Worker.yaml injection is still supported for worker-specific learnings.

**Resolve company/repo context:**
- From `prd.json` metadata if in project context
- From `companies/manifest.yaml` repo lookup if in repo context
- From worker path if worker-scoped (`companies/{co}/workers/` → `{co}`)
- Fall back to `.claude/policies/` (global scope)

## Step 4: Dedup Check

```bash
qmd vsearch "{rule text}" --json -n 5
```

Check results for similarity to the new rule:
- Similarity > 0.85 → **Skip** (already captured somewhere)
- Similarity 0.6–0.85 → **Merge** (update existing rule to be more precise)
- Similarity < 0.6 → **Add new**

Report dedup action taken.

## Step 4.5: Scan Existing Policies

Before creating a new rule, check if an existing policy file already covers this topic:

1. **Resolve policy directories** based on scope:
   - Company scope → scan `companies/{co}/policies/` (skip `example-policy.md`)
   - Repo scope → scan `{repoPath}/.claude/policies/`
   - Global/command scope → scan `.claude/policies/`

2. **Search for matching policies:**
   ```bash
   # Grep policy titles and rules for keyword overlap
   grep -rl "{key terms from rule}" {policy_dir}/*.md 2>/dev/null
   ```
   Also check `qmd vsearch` results from Step 4 for hits in policy files.

3. **If matching policy found:**
   - Read the policy file
   - **Update** the existing policy: append to `## Rule` section, bump `version`, update `updated` date
   - If new learning contradicts existing policy, flag for user review instead of auto-merging
   - Set `dedup_action: "merged-into-policy"` in event log

4. **If no matching policy found:**
   - Proceed to Step 5 (create new rule)
   - For company/repo/global scoped rules, prefer creating a **policy file** (per `knowledge/public/hq-core/policies-spec.md`) over injecting into worker.yaml or CLAUDE.md. Policy files are the canonical format for persistent rules

## Step 5: Create or Update Policy File

### Primary: Policy File (company/repo/global/command scopes)

If Step 4.5 found a matching policy → update was already handled. Otherwise, create a new policy file:

**Target directory:**
- Company scope → `companies/{co}/policies/{slug}.md`
- Repo scope → `repos/{pub|priv}/{repo}/.claude/policies/{slug}.md`
- Command scope → `.claude/policies/{slug}.md`
- Global scope → `.claude/policies/{slug}.md`

**Policy file format** (per `knowledge/public/hq-core/policies-spec.md`):

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
source: {back-pressure-failure|user-correction|success-pattern|task-completion|hook-observation}
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

For worker-specific learnings, still inject into `workers/*/{id}/worker.yaml` instructions block:

```yaml
instructions: |
  ...existing instructions...

  ## Learnings
  - NEVER: {new rule}
```

### Legacy: CLAUDE.md Learned Rules (global promotion only)

Only used for **global promotion** of critical/user-correction rules (Step 6). Not the primary target.

```markdown
- **{NEVER|ALWAYS}**: {rule} <!-- {source} | {date} -->
```

## Step 6: Evaluate Global Promotion

If the rule was injected into a scoped file (worker/command/knowledge), also add to `.claude/CLAUDE.md` `## Learned Rules` if ANY:
- `severity == critical`
- `source == user-correction` (explicit /remember invocation)
- Rule triggered 3+ times (check event log)

### Cap Enforcement

`## Learned Rules` is capped at 20 rules.

1. Count existing rules in section
2. If >= 20: find the oldest rule (by date in comment), remove it from CLAUDE.md
   - The rule still lives in its source file — only the CLAUDE.md copy is removed
3. Append new rule

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
- **Dedup is mandatory** — always check before injecting
- **Global cap is hard** — never exceed 20 rules in CLAUDE.md `## Learned Rules`
- **Reindex after every injection** — keeps qmd search current
- **Preserve existing rules** — append only, never overwrite existing rules
- **User corrections always promote** — /remember delegations go to both target file AND CLAUDE.md
- **Match existing style** — use the same rule format as existing rules in the target file
