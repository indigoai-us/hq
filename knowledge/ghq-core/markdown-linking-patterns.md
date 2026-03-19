---
title: "Markdown Linking Patterns for Knowledge Bases"
category: ghq-core
tags: ["knowledge-management", "markdown", "linking", "backlinks", "cross-referencing", "personal-knowledge"]
source: blueprint
confidence: 0.5
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

Strategies for creating and maintaining links between markdown knowledge entries to enable discovery without introducing fragility.

## Link Types

| Type | Syntax | Pros | Cons |
|------|--------|------|------|
| Relative file links | `[Title](../category/slug.md)` | Works in git, GitHub, most renderers | Breaks on file moves |
| Wikilinks | `[[slug]]` | Concise, tool-friendly | Requires tool support (Obsidian, etc.) |
| Tag-based implicit links | Shared `tags: [...]` in frontmatter | No link rot, search-mediated | Indirect — requires query to discover |
| Inline references | Mention title/concept in prose | Human-readable, zero maintenance | Not machine-navigable |

## Linking Strategies for Flat-File Knowledge Bases

For systems like GHQ where entries are standalone markdown files searched by `qmd`:

1. **Prefer search over explicit links**: When entries share tags or related concepts, the search engine creates implicit connections. This avoids link rot entirely.

2. **Use explicit links sparingly**: Reserve hard links for strong, stable relationships — "X is the specification for Y" rather than "X is somewhat related to Y."

3. **Relative paths over absolute**: If linking between entries, use `../category/slug.md` so links survive repo moves.

4. **Backlink generation**: Rather than manually maintaining bidirectional links, generate backlink indexes programmatically by scanning for `](*.md)` references.

## Link Rot Prevention

- Tag-based connections are immune to file renames
- Explicit links break on rename/move — mitigate with scripted link checking
- Wikilinks (if used) need a resolver that maps slugs to current file paths
- Periodic link audits catch drift before it compounds

## When to Link vs. When to Tag

- **Link**: Direct dependency ("see the format spec"), sequential reading ("part 2 of...")
- **Tag**: Thematic overlap, cross-cutting concerns, "related but independent"

For most personal knowledge bases, tags plus good search make explicit links a nice-to-have rather than essential.
