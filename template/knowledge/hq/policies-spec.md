---
type: reference
domain: [operations, engineering]
status: canonical
tags: [policies, spec, learned-rules, enforcement, frontmatter, governance]
relates_to: []
---

# Policies Spec

## What is a Policy?

A **policy** is a standing operational rule that defines how work is done. Policies are proactive directives — they prescribe behavior before problems occur. They also serve as the canonical location for learned rules captured during execution.

Agents check applicable policies before executing tasks and follow them throughout execution.

## Directory Convention

Policies live in three locations, checked in this precedence order:

```
companies/{co}/policies/*.md       # Company-scoped (highest precedence)
repos/{pub|priv}/{repo}/.claude/policies/*.md  # Repo-scoped
.claude/policies/*.md              # Cross-cutting + command-scoped (lowest)
```

Each directory can have zero or more policy files. Policies are plain Markdown files with YAML frontmatter.

## File Format

```markdown
---
id: {scope-prefix}-{slug}
title: Short descriptive title
scope: company | repo | command | global
trigger: when-this-policy-applies
enforcement: hard | soft
version: 1
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

## Rule

One or more clear, imperative statements defining what agents must do (or must not do).

## Rationale

Why this policy exists. What problem it prevents or what outcome it ensures.

## Examples

Optional. Concrete examples of correct and incorrect behavior under this policy.
```

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier: `{prefix}-{slug}` (e.g. `{company}-docs-update`, `hq-git-branch-verify`, `vyg-staging-first`) |
| `title` | string | Human-readable title |
| `scope` | enum | `company`, `repo`, `command`, `global`, `team`, `worker`, `project` |
| `trigger` | string | When the policy applies (e.g. "before any task execution", "when deploying", "before any git commit") |
| `enforcement` | enum | `hard` (must follow, blocks execution if violated) or `soft` (should follow, deviations noted) |
| `version` | integer | Starts at 1, incremented on material changes |
| `created` | date | ISO date of creation |
| `updated` | date | ISO date of last update |

## Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `source` | string | Origin of the policy: `manual`, `migration`, `task-completion`, `back-pressure-failure`, `user-correction`, `pattern-repetition` |
| `learned_from` | string | Task ID or session reference (for auto-generated policies) |
| `command` | string | Command name (for `scope: command` policies only, e.g. `prd`, `email`) |

## Optional Sections

- **Examples**: Concrete correct/incorrect behavior
- **Exceptions**: When the policy does not apply
- **Related**: Links to other policies, knowledge, or workers

## ID Prefix Convention

| Scope | Prefix | Example |
|-------|--------|---------|
| Company | `{company}-` | `{company}-docs-update` |
| Repo | `{repo-slug}-` | `vyg-staging-first` |
| Command | `hq-cmd-{name}-` | `hq-cmd-prd-question-batching` |
| Global | `hq-` | `hq-git-branch-verify` |

## How Agents Use Policies

1. Before executing a task, load policies from all applicable directories:
   - `companies/{co}/policies/` (determine company from context)
   - `{repo}/.claude/policies/` (if working inside a repo)
   - `.claude/policies/` (always)
2. Read each policy's `trigger` field to determine if it applies to the current task
3. Follow all applicable `hard` enforcement policies — violation blocks task completion
4. Follow all applicable `soft` enforcement policies — deviations are acceptable with justification
5. **Precedence:** company > repo > command > global. If policies conflict, higher-precedence wins

## Auto-Generated Policies

The `/learn` command creates policy files automatically from execution learnings. These use the same format with the optional `source` and `learned_from` fields populated.

**Enforcement defaults:**
- `enforcement: hard` — user corrections (`source: user-correction`), critical severity, NEVER rules with safety implications
- `enforcement: soft` — informational patterns, reference rules, success patterns

**Slug generation:** First 4-5 meaningful words from the rule, lowercased, hyphenated. Deduplicated against existing files in target directory.

## Repo-Level Policies

Repos can have their own policies at:

```
repos/{pub|priv}/{repo}/.claude/policies/*.md
```

Repo-level policies use the same format as company policies. The `id` field uses `{repo-slug}-{policy-slug}` format (e.g. `vyg-no-force-push`).

Agents check repo-level policies when working within that repo. The `/learn` command auto-creates this directory when writing a repo-scoped policy.

## Global HQ Policies

Cross-cutting rules that apply to all companies and repos live at:

```
.claude/policies/*.md
```

These are always loaded regardless of company or repo context. They have the lowest precedence — company and repo policies override them if conflicting.

## Command-Scoped Policies

Policies that apply to specific HQ commands live at `.claude/policies/` with `scope: command` and an additional `command: {name}` frontmatter field.

Example:
```yaml
---
id: hq-cmd-prd-question-batching
title: Limit PRD Discovery Question Batches
scope: command
command: prd
trigger: during /prd discovery phase
enforcement: soft
---
```

These are loaded when the specified command is invoked.

## Relationship to Other HQ Concepts

| Concept | Purpose | Location |
|---------|---------|----------|
| **Company Policies** | Company-scoped standing rules | `companies/{co}/policies/` |
| **Repo Policies** | Repo-scoped rules and learnings | `repos/{repo}/.claude/policies/` |
| **Global Policies** | Cross-cutting rules | `.claude/policies/` |
| **Worker Instructions** | Worker-specific behavioral rules | `worker.yaml instructions:` block |
| **Knowledge** | Reference material (facts, schemas, guides) | `companies/{co}/knowledge/` or `knowledge/public/` |
