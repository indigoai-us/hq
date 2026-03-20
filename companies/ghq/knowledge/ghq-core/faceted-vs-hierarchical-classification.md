---
title: "Faceted vs Hierarchical Classification for Personal Knowledge Bases"
category: ghq-core
tags: ["faceted-classification", "taxonomy", "hierarchy", "knowledge-management", "personal-knowledge", "information-architecture"]
source: web research
confidence: 0.8
created_at: 2026-03-19T12:00:00Z
updated_at: 2026-03-19T12:00:00Z
---

Faceted classification assigns multiple independent dimensions to items; hierarchical taxonomy uses a single tree. For personal KBs, the hybrid approach wins.

## Core Difference

| Aspect | Hierarchical Taxonomy | Faceted Classification |
|--------|----------------------|----------------------|
| Structure | Single tree, fixed path | Multiple independent dimensions |
| Item placement | One location per item | Multiple facets per item |
| Navigation | Top-down browse | Filter/refine from any angle |
| Depth | Can get deep and complex | Each facet is shallow and simple |
| Rigidity | Changing structure is disruptive | New facets added without reorganization |

**Hierarchical**: An item lives in one place. To find it, you navigate the tree. Example: `knowledge/architecture/pipelines.md` — the item is "about architecture" and that's its primary identity.

**Faceted**: An item is tagged along multiple independent dimensions. Example: an entry might be `category: architecture`, `domain: data-engineering`, `type: how-to`, `status: validated`. You can find it by filtering on any combination.

## Why Faceted Works Better at Scale

- **No forced choice**: A note about "Claude Code hooks for knowledge indexing" could be architecture, tooling, or workflow. Hierarchical forces one; faceted allows all three via tags.
- **Shallow facets**: Each facet only covers one dimension, so it stays small and navigable. A hierarchy covering the same space would need deep nesting or awkward cross-references.
- **Additive evolution**: Adding a new facet (e.g., "confidence level") doesn't restructure anything. Adding a new branch to a hierarchy may require reclassifying existing items.
- **Better search integration**: Faceted metadata maps naturally to search filters and programmatic queries.

## Why Hierarchical Still Matters

- **Browsability**: Humans navigate trees intuitively. A flat list of 500 tagged items is overwhelming without a primary grouping.
- **Implicit context**: Directory structure provides context — seeing a file in `knowledge/architecture/` immediately tells you its domain without reading metadata.
- **Tooling simplicity**: File systems are hierarchical. Faceted systems need custom tooling or databases to work well.
- **Small collections**: Below ~100 items, a simple folder structure is faster than configuring and maintaining facets.

## The Hybrid Approach (Recommended for Personal KBs)

The consensus is to combine both:

1. **One primary hierarchy** for folder structure / browsing (the `category` field in GHQ)
2. **Multiple facets via tags** for cross-cutting concerns (the `tags` array)
3. **Search as the primary access method** — the hierarchy is a fallback for browsing, not the main discovery mechanism

This is exactly what GHQ already does: files live in `knowledge/{category}/` (hierarchy) and carry `tags: [...]` (facets), with `qmd` providing full-text and vector search across all dimensions.

## When to Invest More in Facets

- When the same entry keeps wanting to live in multiple categories
- When tag-based filtering would answer questions faster than browsing folders
- When you need computed views (e.g., "all high-confidence entries about architecture updated this month")
- When collaborators organize information differently than you do

## Practical Implementation Tips

- Keep facets **orthogonal** — each dimension should be independent (don't have both `language: python` and `topic: python-programming`)
- Limit facets to 4-6 dimensions to avoid over-classification overhead
- Use controlled vocabularies for facet values (don't let tags drift into synonyms)
- The primary category should be the **most stable** dimension — the one least likely to change as understanding evolves

## Sources

- [Faceted Classification and Faceted Taxonomies - Hedden Information Management](https://www.hedden-information.com/faceted-classification-and-faceted-taxonomies/)
- [Faceted v hierarchical taxonomies - ConsultMU](https://www.consultmu.co.uk/faceted-v-hierarchical-taxonomies-why-all-the-fuss/)
- [Knowledge Base Taxonomy: 10 Principles That Work - MatrixFlows](https://www.matrixflows.com/blog/knowledge-base-taxonomy-best-practices)
- [How Faceted Navigation Works - Enterprise Knowledge](https://enterprise-knowledge.com/how-faceted-navigation-works/)
- [Faceted Classification - Wikipedia](https://en.wikipedia.org/wiki/Faceted_classification)
