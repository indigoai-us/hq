---
title: "Content Pruning and Archival"
category: knowledge-maintenance
tags: ["knowledge-management", "maintenance", "pruning", "archival", "information-architecture"]
source: blueprint
confidence: 0.5
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

When and how to remove, merge, or archive knowledge entries to keep a knowledge base lean and accurate.

## Decision Framework

| Signal | Action |
|--------|--------|
| Factually wrong, no salvageable content | Delete |
| Outdated but historically interesting | Archive (move to `_archive/` or add `archived: true` frontmatter) |
| Overlaps significantly with another entry | Merge into the higher-quality entry |
| Too granular, doesn't stand alone | Absorb into a parent/related entry |
| Stub never upgraded (confidence 0.5, old `updated_at`) | Either research and upgrade, or delete |

## Merge Protocol

1. Identify the "survivor" entry (higher confidence, more complete, better written)
2. Copy unique content from the duplicate into the survivor
3. Update the survivor's `updated_at` and adjust confidence if new information was added
4. Delete the duplicate
5. Reindex to remove the duplicate from search

## Archive vs Delete

**Archive when**: The entry has historical value (decisions made, context for past work), someone might want to understand "what we used to think."

**Delete when**: The entry is simply wrong, trivially duplicated elsewhere, or so incomplete it provides no value. In a git-tracked knowledge base, deletion is soft — `git log` preserves history.

## Pruning Cadence

- **Weekly**: Quick scan of new entries for obvious duplicates or miscategorizations
- **Monthly**: Review low-confidence entries and unresearched stubs
- **Quarterly**: Full audit — staleness check, tag audit, category rebalancing
- **On-demand**: After major knowledge influxes (research sprints, domain bootstraps)
