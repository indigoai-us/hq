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

## Core Principle

No separate learnings files. Rules go into the files they pertain to:

| Scope | Target file | Section |
|-------|------------|---------|
| `skill:{id}` | `.claude/skills/{id}/skill.yaml` | `instructions:` → `## Learnings` subsection |
| `command:{name}` | `.claude/commands/{name}.md` | `## Rules` section |
| `knowledge:{path}` | The relevant knowledge file | Append as rule/note |
| `project:{slug}` | Related knowledge or prd.json metadata | Context-dependent |
| `global` | `.claude/CLAUDE.md` | `## Learned Rules` section |

## Step 1: Parse Input

**If structured JSON** (from /execute-task):
```json
{
  "task_id": "TASK-001",
  "project": "my-project",
  "source": "back-pressure-failure|user-correction|success-pattern|task-completion|build-activity",
  "severity": "critical|high|medium|low",
  "scope": "global|skill:{id}|command:{name}|knowledge:{path}|project:{slug}",
  "skills_used": ["full-stack"],
  "back_pressure_failures": [{"skill": "code-reviewer", "check": "lint", "error": "..."}],
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

- `back_pressure_failures` → `NEVER: {anti-pattern that caused failure}` (scope: skill:{id})
- `retries > 0` → Rule about what caused retry and how to avoid it
- `key_decisions` → `ALWAYS: {pattern}` if broadly applicable
- `issues_encountered` → Scoped rule to prevent recurrence
- `patterns_discovered` → `ALWAYS: {pattern}` for success patterns

From free text:
- Extract the core rule in NEVER/ALWAYS/condition→action format

If no meaningful rules can be extracted (task completed cleanly, no failures, no notable patterns), skip injection — log to event log only.

## Step 3: Classify Scope & Resolve Target File

For each extracted rule, determine scope (most specific wins):

| Signal | Scope | Target |
|--------|-------|--------|
| Failure in specific skill | `skill:{id}` | `.claude/skills/{id}/skill.yaml` |
| Error in specific command | `command:{name}` | `.claude/commands/{name}.md` |
| Relevant to specific knowledge | `knowledge:{path}` | The knowledge file |
| Universal pattern | `global` | `.claude/CLAUDE.md` |
| User correction via /remember | From context, default global | Detected target or CLAUDE.md |

**Resolve the target file path:**
- For skills: `.claude/skills/{id}/skill.yaml`
- For commands: `.claude/commands/{name}.md`
- For knowledge: the specific knowledge file mentioned in context
- For global: `.claude/CLAUDE.md`

If the target file doesn't exist, fall back to `.claude/CLAUDE.md`.

## Step 4: Dedup Check

```bash
qmd vsearch "{rule text}" --json -n 5
```

Check results for similarity to the new rule:
- Similarity > 0.85 → **Skip** (already captured somewhere)
- Similarity 0.6–0.85 → **Merge** (update existing rule to be more precise)
- Similarity < 0.6 → **Add new**

Report dedup action taken.

## Step 5: Inject Rule into Target File

### For skill.yaml (`instructions:` block)

Read the file, find `instructions: |` block. Look for `## Learnings` subsection:
- If exists: append rule under it
- If not: create `## Learnings` subsection at end of instructions block

```yaml
instructions: |
  ...existing instructions...

  ## Learnings
  - NEVER: {new rule}
```

### For command .md (`## Rules` section)

Find `## Rules` section, append rule:
```markdown
## Rules

...existing rules...
- **{NEVER|ALWAYS}**: {rule}
```

If no `## Rules` section exists, create it at end of file.

### For knowledge files

Append rule as a note at end of file, or under most relevant section.

### For CLAUDE.md (`## Learned Rules`)

Append rule:
```markdown
- **{NEVER|ALWAYS}**: {rule} <!-- {source} | {date} -->
```

## Step 6: Write Policy File (optional)

For rules that warrant a standalone policy (hard enforcement, complex rationale, or company-scoped), write a policy file in addition to injecting into the target file:

**Scope → Directory mapping:**
- Global / command-scoped → `.claude/policies/{slug}.md`
- Company-scoped → `companies/{co}/policies/{slug}.md`
- Repo-scoped → `repos/{repo}/.claude/policies/{slug}.md`

**Policy file format:**
```markdown
---
id: {slug}
title: {Title}
scope: global|company:{co}|repo:{repo}|command:{name}
trigger: always|{condition}
enforcement: hard|soft
---

## Rule

{Clear statement of the rule}

## Rationale

{Why this rule exists and what harm it prevents}
```

Only write a policy file when:
- `enforcement: hard` (blocks task on violation)
- Rule is complex enough to need rationale prose
- Rule should be loadable independently (not just a bullet point)

## Step 7: Evaluate Global Promotion

If the rule was injected into a scoped file (skill/command/knowledge), also add to `.claude/CLAUDE.md` `## Learned Rules` if ANY:
- `severity == critical`
- `source == user-correction` (explicit /remember invocation)
- Rule triggered 3+ times (check event log)

### Cap Enforcement

`## Learned Rules` is capped at **10 rules**.

1. Count existing rules in section
2. If >= 10: find the oldest rule (by date in comment), remove it from CLAUDE.md
   - The rule still lives in its source file — only the CLAUDE.md copy is removed
3. Append new rule

## Step 8: Log Event

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
      "scope": "skill:full-stack",
      "target_file": ".claude/skills/full-stack/skill.yaml",
      "severity": "high",
      "policy_file": ".claude/policies/{slug}.md"
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

## Step 9: Reindex

```bash
qmd update 2>/dev/null || true
```

## Step 10: Report

```
Learning captured:
  Rule: {rule}
  Injected: {target file path} → {section}
  Policy: {policy file path or "none"}
  Global: {promoted|not promoted}
  Dedup: {new|merged|skipped}
  Event: workspace/learnings/learn-{timestamp}.json
```

If multiple rules extracted, report each.

## Rules

- **Never inject empty/trivial rules** — "task completed successfully" is not a learning
- **Dedup is mandatory** — always check before injecting
- **Global cap is hard** — never exceed 10 rules in CLAUDE.md `## Learned Rules`
- **Reindex after every injection** — keeps qmd search current
- **Preserve existing rules** — append only, never overwrite existing rules
- **User corrections always promote** — /remember delegations go to both target file AND CLAUDE.md
- **Match existing style** — use the same rule format as existing rules in the target file
- **Policy files are optional** — only write them for hard-enforcement or complex rationale cases
