---
title: "Category Rebalancing Heuristics: Split and Merge Thresholds"
category: knowledge-maintenance
tags: ["knowledge-management", "information-architecture", "taxonomy", "maintenance", "personal-knowledge"]
source: https://en.wikipedia.org/wiki/B-tree, https://www.cockroachlabs.com/docs/stable/load-based-splitting, https://smazumder05.gitbooks.io/design-and-architecture-of-cockroachdb/content/architecture/splitting__merging_ranges.html, https://lawsofux.com/millers-law/, https://betternotetaking.com/what-is-pkm/how-to-organize-pkm-system/, https://2020-us.semantics.cc/taxonomy-and-ontology-design-best-practices
confidence: 0.75
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

Practical thresholds and algorithms for deciding when to split or merge knowledge categories, drawing from database internals, UX research, and PKM practice.

## The Core Problem

The "20-30 items → split" rule of thumb (common in PKM and taxonomy circles) has intuitive appeal but lacks empirical backing. Real guidance comes from three independent fields that have all solved analogous problems: database index structures, information architecture UX research, and distributed systems engineering.

## Split Thresholds

### Cognitive Load (UX Research)

Miller's Law (1956) established ~7±2 as the limit of working memory chunks. Modern research narrows this to 3–4 items for unrelated information. Applied to navigation:

- **Primary categories: 5–7 max** before cognitive overhead becomes a burden
- **Items within a category: 15–20** is the practical scan limit before users lose orientation
- Signal: if locating an item requires >20 seconds of scanning, the category is too large

### Structural Signal (PKM Practice)

Split when a category shows **internal cluster structure** — that is, when you can naturally name 2+ sub-groups. The item count is secondary to semantic coherence. A category of 8 items spanning 4 unrelated subtopics needs splitting; a category of 40 tightly related items might not.

### B-Tree Analogy (Database Internals)

B-trees split a node when it exceeds capacity `2d` (where `d` is the minimum fill). The split is clean: the median key promotes to the parent, and two half-full children replace the old node. Applied loosely to knowledge categories:

- **Split threshold: ~20–30 items** (broadly validated by both UX and PKM practice)
- **After split: each child should have >5 items** — otherwise the split is premature
- Cascading splits (splitting a parent that is now too broad) are normal and expected

### Load-Based vs. Size-Based (Distributed Systems)

CockroachDB distinguishes two independent split triggers:
1. **Size-based**: range > configurable max byte limit
2. **Load-based**: range > 2500 QPS regardless of size

The insight for knowledge bases: split on **access frequency** (items you constantly can't find) independently of raw count. A small, heavily-used category with poor internal organization warrants splitting even if it has only 10 items.

## Merge Thresholds

### When to Merge

| Condition | Merge? |
|-----------|--------|
| Category < 3–5 items and not growing | Yes |
| Two categories share >60% semantic overlap | Yes |
| A category hasn't received a new entry in 6+ months | Consider archiving |
| Category is a subset of an adjacent sibling | Absorb into sibling |

### The Anti-Thrash Rule (Critical)

B-tree implementations solve the oscillation problem with **hysteresis**: the merge threshold is set lower than the split threshold. CockroachDB only merges ranges that fall below the minimum size threshold (8 MB) — well below the 64 MB split threshold.

Applied to knowledge categories:
- **Never immediately merge after splitting.** Wait until a new category has had time to accumulate.
- **Merge threshold should be ~1/4 of split threshold**: if you split at 25 items, only merge when a category falls below ~6 items.
- **Check the split queue before merging**: if a hypothetical merged category would immediately trigger a split, don't merge (CockroachDB's merge queue does exactly this check).

## Decision Algorithm

```
function should_rebalance(category):
  count = len(category.items)

  # Split triggers
  if count > 25 AND has_internal_clusters(category):
    return SPLIT
  if count > 40:  # hard cap
    return SPLIT
  if navigation_time(category) > 20s:
    return SPLIT

  # Merge triggers
  if count < 6 AND NOT growing(category, window=90d):
    if would_split_after_merge(category, sibling):
      return NO_CHANGE  # anti-thrash check
    return MERGE

  return NO_CHANGE
```

## Practical Recommendations for GHQ

| Metric | Split | Merge | No Change |
|--------|-------|-------|-----------|
| Item count | > 25–30 | < 5–6 | 6–25 |
| Internal clusters | ≥ 2 nameable groups | 1 group (same as sibling) | — |
| Navigation time | > 20s | — | ≤ 20s |
| Growth trend | — | Flat for 90+ days | Any growth |

**When splitting**: prefer bisecting around semantic themes, not alphabetically. Let the median concept promote to become the new category name (mirrors B-tree median promotion).

**When merging**: union the tags from both categories. Never discard tags.

**Minimum viable category size**: 3 items. A category of 1–2 items is almost always better served as a sub-section of a related category.

## Sources

- [B-tree — Wikipedia](https://en.wikipedia.org/wiki/B-tree)
- [Load-Based Splitting — CockroachDB](https://www.cockroachlabs.com/docs/stable/load-based-splitting)
- [Splitting / Merging Ranges — CockroachDB Architecture](https://smazumder05.gitbooks.io/design-and-architecture-of-cockroachdb/content/architecture/splitting__merging_ranges.html)
- [Miller's Law — Laws of UX](https://lawsofux.com/millers-law/)
- [Taxonomy and Ontology Design Best Practices — SEMANTiCS 2020](https://2020-us.semantics.cc/taxonomy-and-ontology-design-best-practices)
- [How to Organize Your PKM System](https://betternotetaking.com/what-is-pkm/how-to-organize-pkm-system/)
