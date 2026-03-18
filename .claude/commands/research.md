---
description: Process curiosity queue — research pending questions and write knowledge entries
allowed-tools: WebSearch, Read, Write, Edit, Bash, Glob, Grep
---

# /research — Curiosity Queue Processor

Process pending items from the curiosity queue, research them via web search, and write knowledge entries.

## Procedure

### 1. Load the Queue

Read `knowledge/.queue.jsonl`. Parse each line as JSON. Filter to items where `status` equals `"pending"`. Sort by `priority` descending. Take the top 3 items (max 5 per run to stay within context budget).

If no pending items exist, report **"Queue empty — nothing to research"** and stop.

### 2. Process Each Item

For each pending item, execute steps (a) through (h). If any step fails, set the item's status to `"failed"` with an `error` field containing the error message, write it back to `.queue.jsonl`, and continue to the next item.

Track counters: `entries_created`, `entries_updated`, `items_queued`, `errors`.

#### a. Report Progress

Print: `Researching: {question} (priority {priority})`

#### b. Research via WebSearch

Use the **WebSearch** tool to research the question. Perform 1-3 searches depending on complexity:
- Simple factual questions: 1 search
- Multi-faceted topics: 2-3 searches with different angles

Collect the search result URLs for the `source` field.

#### c. Synthesize into a Knowledge Entry

From the question and search results, produce a knowledge entry:

- **title**: Derive a clear, specific title from the question and findings
- **category**: Choose an existing category directory under `knowledge/`, or create a new one if nothing fits
- **tags**: Generate 3-6 relevant tags
- **source**: Comma-separated list of search URLs used
- **confidence**: Float from 0.0 to 1.0 based on source quality:
  - 0.9-1.0: Multiple authoritative sources agree
  - 0.7-0.8: One strong source or several decent ones
  - 0.5-0.6: Limited or conflicting sources
  - Below 0.5: Speculative, mark clearly in body
- **created_at** / **updated_at**: Current ISO 8601 timestamp
- **body**: Clear, concise markdown. Focus on a single topic. Use headings, tables, and code blocks as needed. First non-heading line serves as the summary (keep under 100 chars).

The slug is derived from the title: lowercase, replace spaces and non-alphanumeric chars with hyphens, collapse consecutive hyphens, max 80 chars. Drop category-name prefixes for brevity.

Frontmatter must conform to the schema in `knowledge/meta/format-spec.md`.

#### d. Check for Duplicates

Before writing, run:

```
qmd vsearch "{title}" -n 3
```

If any result has similarity > 0.9, **update** the existing entry instead of creating a new one. Increment `entries_updated` instead of `entries_created`.

#### e. Write the Entry

Create the category directory if needed:

```bash
mkdir -p knowledge/{category}
```

Write the entry to `knowledge/{category}/{slug}.md` with the frontmatter and body.

#### f. Reindex

Run:

```bash
npx tsx scripts/reindex.ts
```

This regenerates INDEX.md files for all knowledge categories.

#### g. Complete the Queue Item

1. Read `knowledge/.queue.jsonl` (get current state)
2. Find the processed item, change its `status` to `"completed"` and set `updated_at` to the current ISO 8601 timestamp
3. Append the completed item as a JSON line to `knowledge/.queue-done.jsonl`
4. Rewrite `knowledge/.queue.jsonl` without the completed item

#### h. Queue Follow-up Questions

While researching, you may discover new questions that weren't part of the original item. For each follow-up:

```bash
npx tsx scripts/queue-curiosity.ts --question "{follow-up question}" --source research_followup --priority 5 --context "Discovered while researching: {original question}"
```

Only queue genuinely new questions — not rephrased versions of what was just answered. Increment `items_queued` counter.

#### i. Track Counts

Increment `entries_created` (or `entries_updated` if a duplicate was found and merged).

### 3. Write Research Log

After all items are processed, append a single JSON line to `knowledge/.research-log.jsonl`:

```json
{"id":"r-{unix_timestamp}","items_processed":N,"entries_created":N,"entries_updated":N,"items_queued":N,"errors":N,"completed_at":"ISO8601"}
```

### 4. Report Summary

Print: `Research complete: {items_processed} processed, {entries_created} created, {entries_updated} updated, {items_queued} follow-ups queued, {errors} errors`

## Rules

- **Max 5 items per run** to stay within context budget.
- **Use the WebSearch tool** for all research — Claude IS the LLM doing synthesis; do not call external APIs.
- **Valid frontmatter** is mandatory — match the schema in `knowledge/meta/format-spec.md`.
- **Create category directories** as needed (`mkdir -p`).
- **Always run `npx tsx scripts/reindex.ts`** after writing entries.
- **Never skip deduplication** — always run `qmd vsearch` before writing.
- **Error resilience** — if one item fails, log the error and continue to the next.
