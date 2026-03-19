---
description: Process curiosity queue — research pending questions and write knowledge entries
allowed-tools: WebSearch, Read, Write, Edit, Bash, Glob, Grep
---

# /research — Curiosity Queue Processor

Research a single pending item from the curiosity queue via web search and write a knowledge entry.

**Usage**: `/research [queue-item-id]`

- If an ID is provided, research that specific item.
- If no ID is provided, pick the highest-priority pending item.

## Procedure

### 1. Select the Item

Read `knowledge/.queue.jsonl`. Parse each line as JSON. Filter to items where `status` equals `"pending"`.

**If `$ARGUMENTS` is non-empty**: Find the item whose `id` matches `$ARGUMENTS`. If not found, report **"Item {id} not found in queue"** and stop.

**If `$ARGUMENTS` is empty**: Sort by `priority` descending and pick the first item.

If no pending items exist, report **"Queue empty — nothing to research"** and stop.

### 2. Process the Item

Execute steps (a) through (h). If any step fails, set the item's status to `"failed"` with an `error` field containing the error message, write it back to `.queue.jsonl`, and stop.

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
- **category**: Check existing categories with `ls -d knowledge/*/`. Prefer an existing category. Only create a new one when the topic genuinely doesn't fit — and note the justification in the report summary
- **tags**: Generate 3-6 relevant tags following these guidelines:
  - **Orthogonal**: Each tag is an independent dimension. Don't duplicate the category (e.g., no `architecture` tag for entries in `knowledge/architecture/`).
  - **Controlled vocabulary**: Before assigning tags, retrieve the current inventory:
    ```bash
    ./scripts/tag-inventory.sh
    ```
    Pick from existing tags first. Only introduce a new tag when no existing one covers the concept, and verify it isn't a synonym of an existing tag.
  - **Stable naming**: Lowercase, hyphenated terms (`knowledge-management` not `KM`)
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

**Tag merging**: When updating an existing entry, union the new tags with the existing tags — don't discard existing tags. Remove duplicates.

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

After the item is processed, append a single JSON line to `knowledge/.research-log.jsonl`:

```json
{"id":"r-{unix_timestamp}","items_processed":1,"entries_created":N,"entries_updated":N,"items_queued":N,"errors":N,"completed_at":"ISO8601"}
```

### 4. Report Summary

Print a structured summary of everything that changed:

```
Research complete:
  Question: {original question}
  Status: {completed|failed}
  Entry: {created|updated} knowledge/{category}/{slug}.md
  Follow-ups queued: {items_queued}
  Errors: {errors}

Files changed:
  - knowledge/{category}/{slug}.md ({created|updated})
  - knowledge/{category}/INDEX.md (reindexed)
  - knowledge/.queue.jsonl (item removed)
  - knowledge/.queue-done.jsonl (item appended)
  - knowledge/.research-log.jsonl (log appended)
```

If follow-up questions were queued, list them:
```
  Follow-ups:
    - {follow-up question 1}
    - {follow-up question 2}
```

## Rules

- **One item per run** — research a single queue item, then stop.
- **Use the WebSearch tool** for all research — Claude IS the LLM doing synthesis; do not call external APIs.
- **Valid frontmatter** is mandatory — match the schema in `knowledge/meta/format-spec.md`.
- **Create category directories** as needed (`mkdir -p`).
- **Always run `npx tsx scripts/reindex.ts`** after writing entries.
- **Never skip deduplication** — always run `qmd vsearch` before writing.
