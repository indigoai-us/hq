---
title: "Backlink Implementation Patterns for Flat-File Markdown Knowledge Bases"
category: ghq-core
tags: ["backlinks", "knowledge-management", "markdown", "personal-knowledge", "cross-referencing", "cli"]
source: "https://deepwiki.com/obsidianmd/obsidian-help/4.2-internal-links-and-graph-view, https://photogabble.co.uk/noteworthy/adding-wiki-links-to-11ty/, https://github.com/foambubble/foam, https://jackiexiao.github.io/foam/backlinking/, https://github.com/manunamz/jekyll-wikilinks, https://discourse.gohugo.io/t/a-method-to-generate-backlinks/39779"
confidence: 0.82
created_at: 2026-03-20T12:00:00Z
updated_at: 2026-03-20T12:00:00Z
---

How Obsidian, Dendron, Foam, and static-site tools resolve backlinks — and what patterns adapt to CLI-first flat-file systems.

## Core Concepts

A **backlink** is a reverse reference: note B links to note A, so note A has a backlink from B. Maintaining these bidirectionally in a flat-file system requires either:
- **Runtime scanning** — compute backlinks on demand by grepping for references
- **Build-time indexing** — precompute a backlink map at write/index time, stored as a sidecar file or injected into frontmatter

## How Major Tools Implement Backlinks

### Obsidian

Obsidian maintains an in-memory **metadata cache** that maps every file to its outbound wikilinks (`[[note-name]]`). Backlinks are derived by inverting this map at query time. Key behaviors:
- Tracks both **linked mentions** (explicit `[[...]]`) and **unlinked mentions** (text matching a note's title or aliases)
- Aliases defined in YAML frontmatter (`aliases: [alt name]`) are also indexed
- Cache rebuilds incrementally on file-system events — not a full rescan
- Markdown links (`[text](file.md)`) are tracked separately from wikilinks and do not contribute to the backlink graph in all contexts

### Foam (VS Code)

Foam resolves wikilinks using a workspace-wide **link map** populated at activation. Algorithm:
1. Scan all markdown files to build `slug → filepath` map
2. Parse each file's wikilinks with a regex (`\[\[([^\]]+)\]\]`), split on `|` for aliases
3. Normalize slugs: lowercase, strip `.md`, ignore path separators
4. Backlinks for file X = all files whose parsed wikilink set contains X's slug

Foam's backlinks panel in VS Code is a live view backed by this map, updated on file save.

### Dendron

Dendron uses a **hierarchical namespace** (`root.parent.child.md`) rather than free-form wikilinks. Backlinks resolve within the hierarchy, and the schema enforces relationships structurally. This is more rigid but eliminates ambiguity — no "which note named `api`?" problem.

### Jekyll (jekyll-wikilinks plugin)

Stores computed backlinks as **frontmatter variables** on each page:
- Plugin scans all pages during build, builds outbound link graph
- Injects `page.backlinks` array into each page's frontmatter
- Accessible in Liquid templates: `{% for link in page.backlinks %}`
- Wikilinks match by filename (case-insensitive, whitespace-tolerant)

### 11ty

Two-pass approach:
1. **First pass**: Build a `Map<slug, {url, title, aliases}>` across all pages
2. **Second pass**: Parse each page's wikilinks via a remark plugin; replace with `<a>` tags using the slug map; collect which pages point to which
3. Backlinks injected as computed data, available in templates

## CLI-First Implementation Patterns

For systems without a GUI (like GHQ), three practical approaches:

### Pattern 1: Grep-Based Runtime Scan

```bash
# Find all files that link to a given slug
backlinks() {
  local target="$1"
  rg -l "\[\[${target}\]\]|\(.*${target}\.md\)" knowledge/
}
```

**Pros**: Zero maintenance, always current
**Cons**: O(n) on every lookup — slow for large knowledge bases

### Pattern 2: Build-Time Backlink Index

Generate a sidecar `backlinks.json` (or per-category `INDEX.md`) during reindex:

```typescript
// Pseudo-code: build inverted link map
const links: Record<string, string[]> = {};
for (const file of allMarkdownFiles) {
  const outbound = extractWikilinks(file.content); // regex
  for (const target of outbound) {
    links[target] = links[target] ?? [];
    links[target].push(file.slug);
  }
}
// Write backlinks.json or inject into INDEX.md
```

**Pros**: O(1) lookup after build
**Cons**: Index goes stale if not run after every write

### Pattern 3: Frontmatter Injection (Dendron-style)

Inject `backlinks: [slug1, slug2]` into each entry's frontmatter at reindex time. The entry itself becomes self-describing.

**Pros**: Portable — any reader sees backlinks without tooling
**Cons**: File churn on every link change; frontmatter bloat

## Slug Resolution Strategies

All tools face the **disambiguation problem**: two notes with the same slug. Approaches:

| Strategy | Example | Trade-off |
|----------|---------|-----------|
| Shortest unique path | `api` → `project/api.md` | Fragile to new files |
| Full path required | `project/api` | Verbose wikilinks |
| Alias registry | `aliases: [api]` in frontmatter | Explicit, no collision |
| Category-qualified | `category:slug` | Verbose but unambiguous |

GHQ uses `category/slug` paths for qmd, which provides natural namespacing.

## Recommendations for CLI-First Systems

1. **Prefer grep-on-demand** until the knowledge base exceeds ~200 entries — build-time indexing adds complexity before it adds speed
2. **Use relative `](../cat/slug.md)` links** rather than wikilinks for portability; they survive without tooling
3. **Tags as implicit backlinks** — shared tags create traversable connections without link maintenance
4. **Unlinked mentions** (Obsidian's feature) are expensive to compute in CLI but can be approximated: `rg -l "Note Title" knowledge/`
5. **Never store backlinks in frontmatter** for a search-engine-backed system — the search index is the backlink graph
