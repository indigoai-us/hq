---
description: Aggregate internal state across all companies into an actionable briefing
allowed-tools: Read, Bash, Glob, Grep
---

# /briefing — Morning Briefing

Aggregate internal state across all companies into a concise, actionable summary.

**Usage**: `/briefing`

## Procedure

### 1. Read the Manifest

```bash
cat companies/manifest.yaml
```

Parse the YAML to extract all company slugs (keys under `companies:`).

### 2. Collect State for Each Company

For each company slug, gather the following. Run commands from the repo root. If a command returns no results, note "none" — do not error.

#### a. bd Tasks

```bash
cd companies/{slug} && bd list --json 2>/dev/null
```

Extract: total open tasks, any blocked tasks, any with `priority: 1` (urgent). If bd has no database or returns empty, report "no tasks".

#### b. bd Epics

```bash
cd companies/{slug} && bd epic status 2>/dev/null
```

Extract: epic names and completion percentages. If none, report "no epics".

#### c. Knowledge Queue

Read `companies/{slug}/knowledge/.queue.jsonl`. Count lines where `status` is `"pending"`. If the file doesn't exist or is empty, report "queue empty".

For each pending item, note the `question` and `priority` — these become action items.

#### d. Recent Knowledge Entries

```bash
git log --oneline --since="24 hours ago" -- "companies/{slug}/knowledge/"
```

Count commits that touched knowledge files in the last 24 hours. If none, report "no recent activity".

#### e. Git Activity

```bash
git log --oneline --since="24 hours ago" -- "companies/{slug}/"
```

Count total commits touching this company's directory in the last 24 hours.

### 3. Synthesize the Briefing

Print a structured briefing. Format:

```
## Briefing — {today's date}

### {Company Name} ({slug})
- **Tasks**: {N} open ({M} blocked, {K} urgent) | no tasks
- **Epics**: "{epic name}" {X}% complete | no epics
- **Knowledge**: {N} pending queue items, {M} entries added in last 24h | queue empty
- **Git**: {N} commits in last 24h | no recent activity

### {Next Company} ({slug})
...
```

### 4. Derive Action Items

After all company sections, print an action items list derived from:

1. **Urgent bd tasks** (priority 1) — "Complete {task title} ({id})"
2. **Blocked bd tasks** — "Unblock {task title} ({id})"
3. **Pending curiosity queue items** (highest priority first, max 3) — "Research: {question}"
4. **Stale companies** (no git activity in 24h with open tasks) — "Resume work on {company name}"

If no action items, print "No action items."

```
### Action Items
- [ ] {action} — {company slug}
- [ ] {action} — {company slug}
```

### 5. Done

Do not take any further action. The briefing is informational only.

## Rules

- **Read-only.** This command collects and displays state. It does not modify any files.
- **Graceful degradation.** If a company has no bd database, no queue, or no git activity, report that cleanly — never error.
- **Concise.** Each company section should be 3-5 lines max. The whole briefing should be scannable in under 30 seconds.
- **No arguments required.** `/briefing` processes all companies from the manifest automatically.
