---
title: "Knowledge Format Specification"
category: ghq-core
tags: ["format", "spec", "knowledge", "schema"]
source: system
confidence: 1.0
created_at: 2026-03-19T00:00:00Z
updated_at: 2026-03-19T00:00:00Z
---

# Knowledge Format Specification

Every knowledge entry is a standalone Markdown file with YAML frontmatter. This document defines the schema that all entries must follow.

## Frontmatter Schema

| Field        | Type            | Required | Description                                      |
|--------------|-----------------|----------|--------------------------------------------------|
| title        | string          | yes      | Human-readable title of the entry                |
| category     | string          | yes      | Top-level category (maps to directory)           |
| tags         | string array    | yes      | Searchable labels for cross-referencing          |
| source       | string          | no       | Origin of the knowledge (URL, person, system)    |
| confidence   | float 0.0--1.0  | yes      | How reliable or verified the entry is            |
| created_at   | ISO 8601        | yes      | When the entry was first created                 |
| updated_at   | ISO 8601        | yes      | When the entry was last modified                 |

### Write vs Update Rules

When **creating** an entry, `created_at` and `updated_at` are set to the current time. When **updating** an existing entry, only `updated_at` changes — `created_at` is always preserved.

## Frontmatter Parsing

Frontmatter is delimited by `---` on its own line at the start of the file:

```
---
title: "Entry Title"
category: mycategory
tags: ["tag-a", "tag-b"]
created_at: 2026-03-19T00:00:00Z
updated_at: 2026-03-19T00:00:00Z
---
```

- Inline YAML arrays use bracket syntax: `["a", "b"]`.
- String values may be quoted (`"value"` or `'value'`) or bare.
- Tooling parses frontmatter with the regex `^---\r?\n([\s\S]*?)\r?\n---\r?\n`.

## Slug Convention

File names use a slug derived from the title:

- Lowercase letters, digits, and hyphens only.
- Maximum 80 characters.
- Auto-generated from the title by lowercasing, replacing spaces and non-alphanumeric characters with hyphens, collapsing consecutive hyphens, and stripping leading/trailing hyphens.

Example: "Knowledge Format Specification" becomes `format-spec.md` (common prefixes like the category name may be dropped for brevity).

## Category Rules

Categories are dynamic and emerge from use rather than being predefined.

- Each category corresponds to a directory under `knowledge/`.
- One level of subcategory is allowed (e.g., `knowledge/meta/`).
- A file's `category` frontmatter field must match the directory it lives in.
- New categories are created by adding a new directory and placing the first entry there.

## Search Indexing

Entries are indexed by `qmd` for full-text search (BM25) and vector search. The following fields are searchable:

| Field      | Indexed for FTS | Indexed for vector | Notes                        |
|------------|-----------------|--------------------|-----------------------------|
| title      | yes             | yes                | Weighted highest in BM25     |
| content    | yes             | yes                | Main body text               |
| tags       | yes             | no                 | Stored as JSON array         |
| category   | yes             | no                 | Filterable                   |
| slug       | yes             | no                 | Exact match lookups          |
| file_path  | no              | no                 | Stored, not searched         |
| updated_at | no              | no                 | Stored, used for staleness   |

FTS uses porter stemming and unicode61 tokenization — partial words won't match but stemmed variants will (e.g., "running" matches "run").

## Deduplication Strategy

Before writing a new entry, run a semantic similarity search:

```
qmd vsearch "<title or key phrases>" --json -n 5
```

If any existing entry exceeds a 0.9 similarity threshold, update that entry instead of creating a new one. This prevents knowledge drift and keeps the index compact.

## Body Format

- Standard Markdown.
- Each entry should focus on a single topic.
- Use headings, tables, and code blocks as needed for clarity.
- The first non-empty, non-heading line after the frontmatter serves as the summary in generated indexes (truncated to 100 characters).

### Sources Section

When an entry draws from multiple sources, add a `## Sources` section as the **last section** of the body:

```markdown
## Sources

- [Article Title](https://example.com/article)
- [Another Source](https://example.com/other)
- Internal conversation with @alice, 2026-03-15
```

- Use markdown links for URLs; plain text for non-URL sources.
- The frontmatter `source` field remains a short label for the primary origin (e.g., `"web research"`, `"team discussion"`). The `## Sources` section carries the full list.

## Related Systems

- **Curiosity queue** (`knowledge/.queue.jsonl`): Questions logged for later research. Each item has a question, context, source type, and priority (1-10). Completed items move to `.queue-done.jsonl`.
- **Research log** (`knowledge/.research-log.jsonl`): Summaries of research sessions with timestamps and outcomes.
- **Search index**: Rebuilt by `qmd reindex` after manual edits. Auto-reindex runs via hooks on entry writes.
