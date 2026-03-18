---
title: "Knowledge Format Specification"
category: meta
tags: ["format", "spec", "knowledge"]
source: "ghq v0.2 design"
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

## Slug Convention

File names use a slug derived from the title:

- Lowercase letters, digits, and hyphens only.
- Maximum 80 characters.
- Auto-generated from the title by lowercasing, replacing spaces and non-alphanumeric characters with hyphens, and collapsing consecutive hyphens.

Example: "Knowledge Format Specification" becomes `format-spec.md` (common prefixes like the category name may be dropped for brevity).

## Category Rules

Categories are dynamic and emerge from use rather than being predefined.

- Each category corresponds to a directory under `knowledge/`.
- One level of subcategory is allowed (e.g., `knowledge/meta/`).
- A file's `category` frontmatter field must match the directory it lives in.
- New categories are created by adding a new directory and placing the first entry there.

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
