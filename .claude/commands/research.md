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
2. Otherwise default to `ghq` (cross-cutting / meta knowledge).

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

1. **Company-specific MCP tools** — If the company has MCP sources (e.g. `indigo-mcp`, `slack`, `gmail`, `linear`), query those first. These provide authoritative internal data. Use the corresponding MCP tool calls (e.g. `mcp__indigo__query_collection`, `mcp__be1aeb4c__slack_search_public`, etc.).
2. **GitHub** — If `github` is listed, check repos for relevant code, issues, or docs via `gh` CLI.
3. **WebSearch** — Always available as a fallback. Perform 1-3 searches depending on complexity:
   - Simple factual questions: 2-3 searches with different angles
   - Multi-faceted topics: 4-6 searches with different angles

Collect all source references (URLs, MCP tool names, Slack channels, etc.) for the `source` field.

#### c. Synthesize into a Knowledge Entry

From the question and search results, produce a knowledge entry:

- **title**: Derive a clear, specific title from the question and findings
- **category**: Check existing categories with `ls -d companies/{COMPANY}/knowledge/*/`. Prefer an existing category. Only create a new one when the topic genuinely doesn't fit — and note the justification in the report summary
- **tags**: Generate 3-6 relevant tags following these guidelines:
  - **Orthogonal**: Each tag is an independent dimension. Don't duplicate the category (e.g., no `architecture` tag for entries in `knowledge/architecture/`).
  - **Controlled vocabulary**: Before assigning tags, retrieve the current inventory:
    ```bash
    ./companies/ghq/tools/tag-inventory.sh -c {COMPANY}
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

Frontmatter must conform to the schema in `companies/ghq/knowledge/meta/format-spec.md`.

#### d. Check for Duplicates

Run **two** searches — one by title, one by the original question — to catch duplicates regardless of phrasing:

```bash
qmd query "{title}" -n 3 --json -c {COMPANY}
qmd query "{original question from queue item}" -n 3 --json -c {COMPANY}
```

Use the **highest similarity score** across both result sets for the same file. Then apply tiered thresholds:

| Score | Action |
|-------|--------|
| **> 0.9** | **Duplicate.** The knowledge already exists. Do NOT write or update. Mark the queue item with `status: "duplicate"` and set `duplicate_of` to the matching file's `qmd://` path. Append to `.queue-done.jsonl` and remove from `.queue.jsonl`. Increment `duplicates` counter. Skip to step (g). |
| **0.7–0.9** | **Overlap.** Update the existing entry — merge new findings into its body and union tags (never discard existing tags). Increment `entries_updated`. |
| **< 0.7** | **Novel.** Create a new entry. Increment `entries_created`. |

When evaluating matches, read the top-scoring existing entry to confirm the overlap is real — don't rely solely on the similarity score. A high score on a short or generic title can be a false positive.

#### e. Write the Entry

**If novel (< 0.7):** Create the category directory if needed and write the new entry:

```bash
mkdir -p companies/{COMPANY}/knowledge/{category}
```

Write the entry to `companies/{COMPANY}/knowledge/{category}/{slug}.md` with the frontmatter and body.

**If overlap (0.7–0.9):** Edit the existing file in place. Update `updated_at`, merge tags, and append or revise body sections with new findings. Do not change `created_at` or `source` unless the new source is strictly better.

#### f. Reindex

Run:

```bash
npx tsx companies/ghq/tools/reindex.ts -c {COMPANY}
```

This regenerates INDEX.md files for all knowledge categories.

#### g. Complete the Queue Item

1. Read `companies/{COMPANY}/knowledge/.queue.jsonl` (get current state)
2. Find the processed item and update it:
   - **If completed (novel or overlap):** Set `status` to `"completed"` and `updated_at` to the current ISO 8601 timestamp
   - **If duplicate:** Set `status` to `"duplicate"`, `updated_at` to the current ISO 8601 timestamp, and `duplicate_of` to the matching file's `qmd://` path
3. Append the finished item as a JSON line to `companies/{COMPANY}/knowledge/.queue-done.jsonl`
4. Rewrite `companies/{COMPANY}/knowledge/.queue.jsonl` without the finished item

#### h. Queue Follow-up Questions

While researching, you may discover new questions that weren't part of the original item. For each follow-up:

```bash
npx tsx companies/ghq/tools/queue-curiosity.ts -c {COMPANY} --question "{follow-up question}" --source research_followup --priority 5 --context "Discovered while researching: {original question}"
```

Only queue genuinely new questions — not rephrased versions of what was just answered. Increment `items_queued` counter.

#### i. Track Counts

Increment `entries_created` (or `entries_updated` if a duplicate was found and merged).

### 3. Write Research Log

After the item is processed, append a single JSON line to `companies/{COMPANY}/knowledge/.research-log.jsonl`:

```json
{"id":"r-{unix_timestamp}","items_processed":1,"entries_created":N,"entries_updated":N,"duplicates":N,"items_queued":N,"errors":N,"completed_at":"ISO8601"}
```

### 4. Report Summary

Print a structured summary of everything that changed:

```
Research complete:
  Question: {original question}
  Company: {COMPANY}
  Status: {completed|duplicate|failed}
  Entry: {created|updated|duplicate of {qmd://path}} companies/{COMPANY}/knowledge/{category}/{slug}.md
  Follow-ups queued: {items_queued}
  Errors: {errors}

Files changed:
  - companies/{COMPANY}/knowledge/{category}/{slug}.md ({created|updated})  # omit if duplicate
  - companies/{COMPANY}/knowledge/{category}/INDEX.md (reindexed)            # omit if duplicate
  - companies/{COMPANY}/knowledge/.queue.jsonl (item removed)
  - companies/{COMPANY}/knowledge/.queue-done.jsonl (item appended)
  - companies/{COMPANY}/knowledge/.research-log.jsonl (log appended)
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
- **Valid frontmatter** is mandatory — match the schema in `companies/ghq/knowledge/meta/format-spec.md`.
- **Create category directories** as needed (`mkdir -p`).
- **Always run `npx tsx companies/ghq/tools/reindex.ts -c {COMPANY}`** after writing entries.
- **Never skip deduplication** — always run `qmd vsearch` before writing.
