---
id: qmd-collection-masks
title: qmd collection masks must include all searchable file types
scope: global
trigger: qmd collection add, search-reindex
enforcement: soft
---

## Rule

When creating or updating qmd collections, include all file types that should be searchable — not just `.md`. The `hq` collection uses `**/*.{md,json,yaml,yml}` to cover PRDs, worker configs, manifests, and thread files. If a `qmd search` returns no results for content you know exists, check the collection mask with `qmd collection list`.

## Rationale

The `hq` collection was originally `**/*.md` only, making 6,600+ JSON/YAML files invisible to search. This caused `qmd search "prd.json"` to return nothing despite many prd.json files existing. Fixed Mar 2026 by expanding the mask.
