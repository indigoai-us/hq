---
title: "Taxonomy to Knowledge Graph Migration"
category: ghq-core
tags: ["taxonomy", "knowledge-graph", "ontology", "migration", "information-architecture", "tradeoffs"]
source: web research
confidence: 0.75
created_at: 2026-03-19T12:00:00Z
updated_at: 2026-03-19T12:00:00Z
---

When and why to migrate from a taxonomy to a knowledge graph, and the practical tradeoffs involved.

## When to Stay with a Taxonomy

Taxonomies are the right tool when the primary need is **consistent tagging and retrieval** of content. They work well for:

- Hierarchical classification of discrete items (documents, files, pages)
- Simple browse-and-find navigation (websites, intranets, CMS)
- Stable domains where relationships between items are mostly parent-child
- Small-to-medium collections where cross-referencing is minimal

## When to Migrate to a Knowledge Graph

Migration makes sense when these signals appear:

- **Cross-cutting relationships**: Items connect across multiple dimensions that a tree can't represent (e.g., a note relates to a person, a project, and a concept simultaneously)
- **Query complexity**: You need to answer questions like "what connects X to Y?" rather than "where does X belong?"
- **Interoperability**: Data needs to flow between multiple systems or domains
- **AI integration**: LLM-powered retrieval, reasoning, or document understanding benefits from richer semantic structure
- **Evolving schema**: New entity types and relationships appear frequently, and rigid hierarchies become a bottleneck

## The Progression Path

The typical evolution is: **taxonomy -> thesaurus -> ontology -> knowledge graph**. Each step adds expressiveness:

| Structure       | What it adds                        | Complexity |
|----------------|-------------------------------------|------------|
| Taxonomy        | Hierarchical categories             | Low        |
| Thesaurus       | Synonyms, related terms             | Low-Medium |
| Ontology        | Properties, rules, typed relations  | Medium-High|
| Knowledge Graph | Instances, cross-domain links, data | High       |

A knowledge graph typically *includes* a taxonomy as its classification backbone — migration is more of an evolution than a replacement.

## Practical Tradeoffs

### Advantages of Knowledge Graphs
- Rich relationship modeling across domains
- Schema flexibility — add new entity types without full restructuring
- Better support for AI/LLM retrieval and reasoning
- Can represent the same item in multiple contexts without duplication

### Disadvantages / Costs
- **Tooling maturity**: Version control for graph schemas is less mature than for hierarchical systems; tracking changes and rollbacks requires custom tooling
- **Cognitive overhead**: Harder to browse and understand than a simple tree
- **Maintenance burden**: Relationships must be curated; an unmaintained graph degrades faster than an unmaintained taxonomy
- **Overkill for small collections**: Below ~500 items, a well-tagged taxonomy with search is usually sufficient
- **Governance complexity**: Coordinating schema changes across contributors is harder

## For Personal Knowledge Bases

For personal KBs specifically:

- **Start with tags + hierarchy** (flat files in category folders, like GHQ's current model)
- **Add links between entries** when cross-references become frequent (wiki-style backlinks)
- **Consider a graph** only when you have 500+ entries with dense interconnections, or when you need programmatic traversal of relationships
- **Hybrid approach**: Keep the taxonomy for navigation/browsing, layer graph relationships on top for discovery and querying

The key insight: a knowledge graph is not a replacement for taxonomy — it's a superset. The taxonomy provides structure for human browsing; the graph adds machine-queryable relationships.

## Sources

- [From Taxonomies over Ontologies to Knowledge Graphs - Semantic Web Company](https://semantic-web.com/from-taxonomies-over-ontologies-to-knowledge-graphs/)
- [Knowledge Graphs and Taxonomies - Hedden Information Management](https://www.hedden-information.com/knowledge-graphs-and-taxonomies/)
- [Why a Knowledge Graph is the Best Way to Upgrade Your Taxonomy - Enterprise Knowledge](https://enterprise-knowledge.com/why-a-knowledge-graph-is-the-best-way-to-upgrade-your-taxonomy/)
- [Understanding the Role of Taxonomies, Ontologies, Schemas and Knowledge Graphs - Innodata](https://innodata.com/understanding-the-role-of-taxonomies-ontologies-schemas-and-knowledge-graphs/)
