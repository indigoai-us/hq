---
title: "Tag Hygiene and Governance"
category: knowledge-maintenance
tags: ["knowledge-management", "maintenance", "taxonomy", "tags", "information-architecture", "personal-knowledge"]
source: blueprint
confidence: 0.5
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

Practices for keeping a tag vocabulary clean, consistent, and useful as a knowledge base grows.

## Common Tag Problems

**Synonym proliferation**: "js", "javascript", "JavaScript", "JS" all referring to the same concept. Without governance, tags multiply into variants that fragment search.

**Tag inflation**: Tags that are too specific to be useful ("march-2026-bug", "temp-workaround"). These don't aid retrieval and clutter the vocabulary.

**Orphan tags**: Tags used by only one entry. May indicate a misspelling, over-specificity, or a legitimate niche topic that needs more coverage.

**Overly broad tags**: Tags like "programming" or "software" that appear on most entries and provide no filtering value.

## Governance Practices

**Canonical vocabulary**: Maintain a reference list of approved tags. New tags are fine, but check for existing synonyms first.

**Audit tooling**: Regular automated checks (like GHQ's `/tag-audit`) that flag near-duplicate tags, orphans, and overused tags.

**Naming conventions**: Lowercase, hyphenated, plural for collections ("design-patterns" not "design-pattern"). Consistent conventions reduce drift.

**Tag budgets**: Aim for 3-6 tags per entry. Fewer than 3 under-indexes the entry; more than 6 suggests the entry covers too many topics.

## Remediation

| Problem | Fix |
|---------|-----|
| Synonyms | Pick canonical form, bulk rename others |
| Orphans | Either delete the tag or write more entries using it |
| Overly broad | Remove from entries where a more specific tag exists |
| Overly specific | Generalize or remove |

## Metrics

Track tag health with:
- **Tag count**: Total unique tags. Growing faster than entries suggests drift.
- **Tags per entry**: Distribution should center around 3-6.
- **Orphan ratio**: Percentage of tags used by only one entry. Below 20% is healthy.
- **Top-N concentration**: If the top 5 tags cover >50% of entries, the vocabulary may be too coarse.
