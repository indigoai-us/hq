---
id: qmd-collection-masks
title: qmd collection masks must include all searchable file types
scope: global
trigger: qmd collection add, search-reindex
enforcement: soft
---

## Rule

When creating or updating qmd collections, include all file types that should be searchable — not just `.md`. HQ uses 4 focused sub-collections instead of a monolithic `hq` collection:

| Collection | Path | Mask |
|---|---|---|
| `hq-infra` | `.claude/` | `**/*.{md,yaml,yml,json,sh}` |
| `hq-workers` | `workers/` | `**/*.{md,yaml,yml,json}` |
| `hq-knowledge` | `knowledge/` | `**/*.{md,yaml,yml}` |
| `hq-projects` | `projects/` | `**/*.{md,json}` |

Do NOT create a monolithic `hq` collection at HQ root — it double-indexes company/repo content and misses `.claude/` (qmd skips dotdirs during traversal). If a `qmd search` returns no results for content you know exists, check the collection mask with `qmd collection list`.

## Rationale

The monolithic `hq` collection indexed 16,000+ files including repos and workspace ephemera, while missing `.claude/` entirely (265 files: commands, skills, policies). The 4 sub-collections reduce indexed files to ~1,000 while actually increasing coverage.

## Rule: qmd cleanup before qmd update

Run `qmd cleanup` before `qmd update` whenever tombstones accumulate. Quick check:

```bash
sqlite3 ~/.cache/qmd/index.sqlite "SELECT COUNT(*) FROM documents WHERE active=0"
```

If the count is non-zero, run `qmd cleanup` first.

