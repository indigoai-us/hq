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

## Rule: qmd cleanup before qmd update

Run `qmd cleanup` before `qmd update` whenever tombstones accumulate. Quick check:

```bash
sqlite3 ~/.cache/qmd/index.sqlite "SELECT COUNT(*) FROM documents WHERE active=0"
```

If the count is non-zero, run `qmd cleanup` first.

## Rationale

qmd's `deactivateDocument` (`~/.bun/install/global/node_modules/qmd/src/qmd.ts:1458`) soft-deletes missing files by flipping `active=1→0` rather than issuing a `DELETE`. The `documents` table's `UNIQUE(collection, path)` index covers BOTH active and inactive rows, and `findActiveDocument` (`qmd.ts:1415`) filters by `active=1`, so it's blind to tombstones during the subsequent INSERT path. When a freshly-scanned path's handelized form collides with a tombstone from a prior scan, `qmd update` crashes with `SQLiteError: UNIQUE constraint failed: documents.collection, documents.path` and aborts the whole transaction. `qmd cleanup` → `deleteInactiveDocuments` (`store.ts:959`) runs a plain `DELETE FROM documents WHERE active = 0` and clears the hazard.

Diagnosed Apr 2026 after 21,077 tombstones (hq=18,479, personal=960, {company}=730, {company}=608, {company}=50) accumulated from a prior collections-path drift where `/search-reindex.md` pointed at `companies/{co}/knowledge` while the live `~/.config/qmd/index.yml` used bare `companies/{co}`.
