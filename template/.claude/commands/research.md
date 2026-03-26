---
description: Process curiosity queue — research pending questions and write knowledge entries
allowed-tools: WebSearch, Read, Write, Edit, Bash, Glob, Grep
---

# /research — Curiosity Queue Processor

Research a single pending item from the curiosity queue via web search and write a knowledge entry.

**Usage**: `/research [queue-item-id] [-c <company-slug>]`

- If an ID is provided, research that specific item.
- If no ID is provided, pick the highest-priority pending item.

## Company Context

All knowledge is scoped to a company. Determine the target company:

1. If `$ARGUMENTS` contains `-c <slug>`, use that slug.
2. Otherwise default to `personal`.

Set `COMPANY` to the resolved slug. All paths below use `companies/{COMPANY}/knowledge/`.

## Procedure

### 1. Select the Item

Read `companies/{COMPANY}/knowledge/.queue.jsonl`. Parse each line as JSON. Filter to items where `status` equals `"pending"`.

**If `$ARGUMENTS` is non-empty**: Find the item whose `id` matches `$ARGUMENTS`. If not found, report **"Item {id} not found in queue"** and stop.

**If `$ARGUMENTS` is empty**: Sort by `priority` descending and pick the first item.

If no pending items exist, report **"Queue empty — nothing to research"** and stop.

### 2. Process the Item

Execute steps (a) through (h). If any step fails, set the item's status to `"failed"` with an `error` field containing the error message, write it back to `.queue.jsonl`, and stop.

Track counters: `entries_created`, `entries_updated`, `duplicates`, `items_queued`, `errors`.

#### a. Report Progress

Print: `Researching: {question} (priority {priority})`

#### b. Research via Available Sources

First, check the company's available sources by reading `companies/manifest.yaml` and looking at the `sources` list for `{COMPANY}`.

**Source priority** (use all available, in this order):

1. **Company-specific MCP tools** — If the company has MCP sources (e.g. `indigo-mcp`, `slack`, `gmail`, `linear`), query those first. These provide authoritative internal data.
2. **GitHub** — If `github` is listed, check repos for relevant code, issues, or docs via `gh` CLI.
3. **WebSearch** — Always available as a fallback. Perform 1-3 searches depending on complexity.

Collect all source references (URLs, MCP tool names, etc.) for the `source` field.

#### c. Synthesize into a Knowledge Entry

From the question and search results, produce a knowledge entry:

- **title**: Derive a clear, specific title from the question and findings
- **category**: Check existing categories with `ls -d companies/{COMPANY}/knowledge/*/`. Prefer an existing category.
- **tags**: Generate 3-6 relevant tags following these guidelines:
  - **Orthogonal**: Each tag is an independent dimension. Don't duplicate the category.
  - **Controlled vocabulary**: Before assigning tags, retrieve the current inventory:
    ```bash
    ./tools/tag-inventory.sh -c {COMPANY}
    ```
    Pick from existing tags first.
  - **Stable naming**: Lowercase, hyphenated terms
- **source**: Comma-separated list of search URLs used
- **confidence**: Float from 0.0 to 1.0 based on source quality
- **created_at** / **updated_at**: Current ISO 8601 timestamp
- **body**: Clear, concise markdown. First non-heading line serves as the summary (keep under 100 chars).

#### d. Check for Duplicates

Run **two** searches:

```bash
qmd query "{title}" -n 3 --json -c {COMPANY}
qmd query "{original question from queue item}" -n 3 --json -c {COMPANY}
```

| Score | Action |
|-------|--------|
| **> 0.9** | **Duplicate.** Mark as `status: "duplicate"`. Append to `.queue-done.jsonl`. Skip to step (g). |
| **0.7–0.9** | **Overlap.** Update the existing entry — merge new findings. |
| **< 0.7** | **Novel.** Create a new entry. |

#### e. Write the Entry

**If novel (< 0.7):** Create the category directory if needed and write the new entry.

**If overlap (0.7–0.9):** Edit the existing file in place. Update `updated_at`, merge tags.

#### f. Reindex

```bash
npx tsx tools/reindex.ts -c {COMPANY}
```

#### g. Complete the Queue Item

1. Read `companies/{COMPANY}/knowledge/.queue.jsonl`
2. Update the item status
3. Append to `companies/{COMPANY}/knowledge/.queue-done.jsonl`
4. Rewrite `.queue.jsonl` without the finished item

#### h. Queue Follow-up Questions

```bash
npx tsx tools/queue-curiosity.ts -c {COMPANY} --question "{follow-up question}" --source research_followup --priority 5 --context "Discovered while researching: {original question}"
```

### 3. Write Research Log

Append a JSON line to `companies/{COMPANY}/knowledge/.research-log.jsonl`:

```json
{"id":"r-{unix_timestamp}","items_processed":1,"entries_created":N,"entries_updated":N,"duplicates":N,"items_queued":N,"errors":N,"completed_at":"ISO8601"}
```

### 4. Report Summary

```
Research complete:
  Question: {original question}
  Company: {COMPANY}
  Status: {completed|duplicate|failed}
  Entry: {created|updated|duplicate of {path}} companies/{COMPANY}/knowledge/{category}/{slug}.md
  Follow-ups queued: {items_queued}
  Errors: {errors}
```

## Rules

- **One item per run** — research a single queue item, then stop.
- **Use the WebSearch tool** for all research.
- **Valid frontmatter** is mandatory.
- **Create category directories** as needed (`mkdir -p`).
- **Always run `npx tsx tools/reindex.ts -c {COMPANY}`** after writing entries.
- **Never skip deduplication** — always run `qmd query` before writing.
