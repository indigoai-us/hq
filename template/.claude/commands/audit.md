---
description: Query and display audit log
allowed-tools: Bash, Read
argument-hint: [--project name] [--company slug] [--failures] [--since YYYY-MM-DD]
visibility: public
---

# /audit - Audit Log

Query and display HQ orchestrator audit log events.

**Arguments:** $ARGUMENTS

## Parse Arguments

Extract from $ARGUMENTS:
- `--project <name>` — filter by project slug
- `--company <slug>` — filter by company slug
- `--failures` — show only task_failed events with error details
- `--since <YYYY-MM-DD>` — override the default 7-day window
- No args → summary mode (last 7 days)

## Step 1: Determine Mode

Based on flags parsed above, choose one of three modes:

**Failures mode** (`--failures` present):
→ Go to Step 3

**Project mode** (`--project` present, no `--failures`):
→ Go to Step 4

**Default summary mode** (no flags, or only `--since` / `--company`):
→ Go to Step 2

## Step 2: Summary Mode (default — no args)

**If no `--since` and no `--company` flags**, call the script's built-in summary:
```bash
cd ~/Documents/HQ && bash scripts/audit-log.sh summary 2>/dev/null
```
Display the output directly — it already includes by-project and by-worker tables.

**If `--since` or `--company` is provided**, fall back to `query` with manual aggregation (since `summary` has no filter flags):

Compute `SINCE_DATE`: if `--since` was provided use that value, otherwise use 7 days ago in `YYYY-MM-DD` format.
```bash
cd ~/Documents/HQ && \
  SINCE="$(date -v-7d +%Y-%m-%d 2>/dev/null || date -d '7 days ago' +%Y-%m-%d)" && \
  bash scripts/audit-log.sh query --since "$SINCE" 2>/dev/null
```
If `--since` was provided, replace the computed date with the user-supplied value.
If `--company` was provided, append `--company <slug>` to the query command.

Parse the JSON array returned. Then display the following sections:

### KPI Header

```
## Audit Summary — last 7 days (since {SINCE_DATE})

| Metric            | Value |
|-------------------|-------|
| Total events      | N     |
| Tasks completed   | N     |
| Tasks failed      | N     |
| Stories completed | N     |
| Projects active   | N     |
```

Count from the JSON array:
- Total events: length of array
- Tasks completed: count where `event == "task_completed"`
- Tasks failed: count where `event == "task_failed"`
- Stories completed: count where `event == "story_completed"`
- Projects active: count of unique `.project` values

### By Project Table

```
## By Project

| Project | Completed | Failed | Skipped | Last Activity |
|---------|-----------|--------|---------|---------------|
| foo     | 3         | 0      | 1       | 2026-03-09T... |
```

Group events by `.project`. For each group:
- Completed: count where `event == "task_completed"`
- Failed: count where `event == "task_failed"` or `result == "fail"`
- Skipped: count where `result == "skipped"`
- Last Activity: max `.timestamp` in group

Sort by last activity descending.

### Top Workers Table

```
## Top Workers

| Worker     | Tasks | Failures | Success Rate |
|------------|-------|----------|--------------|
| backend-dev| 5     | 0        | 100%         |
```

Group events where `.worker` is non-null, by worker name. For each group:
- Tasks: count where `event == "task_completed"` or `event == "task_failed"`
- Failures: count where `event == "task_failed"` or `result == "fail"`
- Success Rate: `(tasks - failures) / tasks * 100`% rounded, or `n/a` if 0 tasks

Sort by tasks descending.

## Step 3: Failures Mode (`--failures`)

Run:
```bash
cd ~/Documents/HQ && \
  bash scripts/audit-log.sh query --event task_failed 2>/dev/null
```

If `--project` was also provided, append `--project <name>` to the command.
If `--company` was also provided, append `--company <slug>` to the command.
If `--since` was also provided, append `--since <date>` to the command.

Note: without `--since`, failures mode returns ALL failures (no default 7-day window).

Display all matching events, newest first, as a markdown table:

```
## Failed Tasks

| Timestamp | Project | Story | Worker | Error |
|-----------|---------|-------|--------|-------|
| 2026-03-09T12:00:00Z | hq-observability | US-003 | backend-dev | Timeout after 120s |
```

Columns:
- Timestamp: `.timestamp`
- Project: `.project`
- Story: `.story_id` (or `—` if null)
- Worker: `.worker` (or `—` if null)
- Error: `.error` (or `—` if null) — truncate to 80 chars, append `…` if longer

If zero results: print `No task failures found.`

## Step 4: Project Mode (`--project <name>`)

Build query:
```bash
cd ~/Documents/HQ && \
  bash scripts/audit-log.sh query --project <name> 2>/dev/null
```

Append `--company <slug>` if provided. Append `--since <date>` if provided.

Display all events newest first:

```
## Project: {name}

{N} events

| Timestamp | Event | Story | Worker | Result |
|-----------|-------|-------|--------|--------|
| 2026-03-09T12:00:00Z | task_completed | US-001 | backend-dev | success |
```

Columns:
- Timestamp: `.timestamp`
- Event: `.event`
- Story: `.story_id` (or `—`)
- Worker: `.worker` (or `—`)
- Result: `.result` (or `—`)

Sort: newest first (reverse by `.timestamp`).

If zero results: print `No events found for project "{name}".`

## Step 5: Empty / Error Handling

- If audit log doesn't exist yet: print `Audit log is empty — no events recorded yet.`
  - Hint: `Log location: workspace/metrics/audit-log.jsonl`
- If jq is missing: print error from script and stop
- If JSON parse fails: show raw output with a warning

## Examples

```bash
/audit                              # Summary: last 7 days
/audit --since 2026-03-01           # Summary since March 1
/audit --project hq-observability   # All events for that project
/audit --company {company}             # Summary filtered to {company}
/audit --failures                   # All failures across all projects
/audit --failures --project {repo}  # Failures for a specific project
/audit --project assistant-standalone --since 2026-03-05
```

## Notes

- Log file: `workspace/metrics/audit-log.jsonl`
- Populated by `/run-project` and `/execute-task` via `scripts/audit-log.sh append`
- Timestamps are ISO8601 UTC — sort and filter are lexicographic (works correctly for ISO dates)
- For raw JSON output, run `scripts/audit-log.sh query` directly in Bash
