---
id: qmd-collection-masks
title: qmd collection masks must include all searchable file types
scope: global
trigger: qmd collection add, search-reindex
enforcement: soft
---

## Rule

When creating or updating qmd collections, include all file types that should be searchable — not just `.md`. The `hq` collection uses `**/*.{md,json,yaml,yml}` to cover PRDs, worker configs, manifests, and thread files. If a `qmd search` returns no results for content you know exists, check the collection mask with `qmd collection list`.

## Rule: qmd cleanup before qmd update

Run `qmd cleanup` before `qmd update` whenever tombstones accumulate. Quick check:

```bash
sqlite3 ~/.cache/qmd/index.sqlite "SELECT COUNT(*) FROM documents WHERE active=0"
```

If the count is non-zero, run `qmd cleanup` first.

