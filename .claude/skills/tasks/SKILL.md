---
name: Tasks
description: Display open bd tasks for a company as a sorted, filtered table
---

# Tasks

Display all open top-level bd tasks for a company in a clean markdown table.

## Process

1. Determine the target company from the user's message or skill arguments. If not specified, ask.
2. Run `bd list` from `companies/{slug}/` with these flags:
   ```
   bd list --sort priority --no-pager
   ```
3. From the full output, identify which task IDs appear in `(parent: <id>)` references — those IDs have subtasks.
4. Filter to top-level tasks only and render a markdown table:

   | ID | Pri | Type | Status | Subs | Title |
   |---|---|---|---|---|---|

5. Rules for the table:
   - **ID**: Full task ID (e.g. `indigo-53t.22`), not truncated
   - **Pri**: Priority label (P0–P4)
   - **Type**: bug, task, epic, etc.
   - **Status**: Map symbols to words — `○` = open, `◐` = in_progress, `●` = closed, `◑` = blocked, `◇` = deferred, `?` = in_review
   - **Subs**: Count of subtasks if any (e.g. `5`), otherwise blank
   - **Title**: Task title as-is
   - **Sort**: By priority (P0 first), then by ID within same priority
   - **Filter**: Top-level only (no subtasks like `.1.2`). Include only IDs matching `{slug}-*.N` (single dot-number suffix)
   - **Exclude**: Epics (type = epic) and placeholders (tasks with "placeholder" in the title)

5. After the table, show a one-line summary: total count and status breakdown.

## Output

A single markdown table followed by a summary line — nothing else.
