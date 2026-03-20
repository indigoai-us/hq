---
title: "Knowledge Base Scaling Patterns"
category: ghq-core
tags: ["knowledge-management", "scaling", "maintenance", "taxonomy", "personal-knowledge", "information-architecture"]
source: blueprint
confidence: 0.5
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

How markdown-based knowledge bases behave at different scales, and what structural changes become necessary as they grow.

## Scale Thresholds

| Entries | What works | What breaks | Action needed |
|---------|-----------|-------------|---------------|
| <50 | Flat folders, manual browsing | Nothing yet | Just write |
| 50-200 | Categories + tags, keyword search | Manual browsing slows | Invest in search tooling |
| 200-500 | Hybrid search (BM25 + vector) | Tag vocabulary drifts, duplicates creep in | Tag audits, dedup checks |
| 500-2000 | Faceted search, automated maintenance | Category boundaries blur, stale entries accumulate | Automated staleness detection, consider subcategories |
| 2000+ | Knowledge graph layer, computed views | Simple file browsing is impractical | Programmatic access becomes primary interface |

## Common Scaling Problems

**Tag drift**: Without governance, tags multiply into synonyms ("js", "javascript", "JavaScript"). Regular tag audits (like GHQ's `/tag-audit`) catch this early.

**Category bloat**: Categories that started focused accumulate loosely-related entries. The rebalancing heuristic from knowledge-tree-best-practices (split at ~20-30 items) helps.

**Stale entries**: At 200+ entries, some inevitably become outdated. Confidence scores and `updated_at` timestamps enable automated staleness alerts.

**Search degradation**: As the corpus grows, BM25 alone returns too many results. Vector search and hybrid ranking become essential for precision.

## Structural Evolution Path

1. **Start flat**: `knowledge/{category}/{slug}.md` with tags
2. **Add search**: BM25 full-text, then vector search for conceptual queries
3. **Add automation**: Dedup checks, tag audits, staleness detection
4. **Add relationships**: Cross-references, backlinks, computed indexes
5. **Consider graph**: Only when dense interconnections make tree browsing inadequate (typically 500+ entries)

The key insight: invest in search and automation before restructuring the hierarchy. Good tooling extends the useful life of a simple structure.
