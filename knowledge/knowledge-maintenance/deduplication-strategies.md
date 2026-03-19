---
title: "Deduplication Strategies for Knowledge Bases"
category: knowledge-maintenance
tags: ["knowledge-management", "deduplication", "maintenance", "information-architecture", "retrieval", "semantic-similarity"]
source: blueprint
confidence: 0.5
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

Techniques for detecting and resolving duplicate or near-duplicate entries in a knowledge base, preventing knowledge drift and index bloat.

## Detection Methods

**Exact title/slug matching**: Cheapest check. Catches copy-paste duplicates but misses reformulations. Run before every write.

**Semantic similarity (vector search)**: Embed the candidate title/summary, compare against existing entries. A cosine similarity threshold of ~0.9 flags near-duplicates. This catches entries that cover the same concept with different wording.

**BM25 keyword overlap**: Fast full-text search for key terms. Useful as a first-pass filter before the more expensive vector comparison.

**Tag intersection**: Entries sharing 80%+ of their tags with similar titles are likely duplicates. Cheap heuristic but high false-positive rate.

## Resolution Strategies

| Situation | Action |
|-----------|--------|
| True duplicate (same content) | Delete the newer/lower-confidence entry |
| Overlapping coverage | Merge into one entry, combining unique content |
| Different angles on same topic | Keep both, add cross-references |
| Outdated version + updated version | Archive the outdated one, keep the current |

## Prevention

- **Pre-write check**: Run `qmd vsearch "<title>" -n 5` before creating any entry. Skip if similarity > 0.9.
- **Slug conventions**: Consistent slug generation reduces the chance of `auth-middleware.md` and `authentication-middleware.md` coexisting.
- **Category discipline**: When entries are categorized consistently, browsing the category index naturally reveals duplicates.

## Automation Considerations

Periodic dedup sweeps can be automated by computing pairwise similarity across all entries and flagging pairs above a threshold. For bases under 500 entries, this is computationally feasible on every reindex. Beyond that, approximate nearest neighbor indexes (HNSW, IVF) make it practical at scale.
