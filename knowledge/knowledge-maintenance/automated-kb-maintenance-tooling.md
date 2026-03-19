---
title: "Automated Tooling for Markdown Knowledge Base Maintenance at Scale"
category: knowledge-maintenance
tags: ["cli", "knowledge-management", "maintenance", "open-source", "staleness", "automation"]
source: https://github.com/tcort/markdown-link-check, https://github.com/remarkjs/remark-lint, https://github.com/Canna71/obsidian-janitor, https://github.com/rjzxui/obsidian-vault-cli, https://blog.nelhage.com/post/fuzzy-dedup/, https://github.com/allenai/duplodocus, https://ragaboutit.com/the-knowledge-decay-problem-how-to-build-rag-systems-that-stay-fresh-at-scale/
confidence: 0.82
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

Concrete CLI tools and scripts for link checking, orphan detection, tag normalization, staleness scoring, and dedup in flat-file markdown KBs.

## Link Checking

**[markdown-link-check](https://github.com/tcort/markdown-link-check)** (Node.js) — the standard tool:
```bash
find knowledge/ -name "*.md" | xargs npx markdown-link-check
```
- Checks both internal (`[[wikilinks]]` require a wrapper script) and external URLs
- `ignorePatterns` array for `qmd://` or custom schemes
- Exits non-zero on broken links — CI-friendly
- Can be run per-file or directory-wide; external checks hit network

**[remark-lint](https://github.com/remarkjs/remark-lint)** — AST-level linting with composable rule sets:
- `remark-lint-double-link`: flags duplicate URLs within a file
- `remark-validate-links`: checks that internal markdown links resolve
- Config-driven (`.remarkrc`), integrates with remark pipeline for transforms + lint in one pass

## Orphan Detection

An **orphan** is a file with no inbound links from any other file. Detection is a two-step index build:

1. Extract all links from every file (grep for `[...](path)` or `[[wikilink]]` patterns)
2. Diff against the full file list — files not in the link target set are orphans

**Obsidian Janitor** plugin does this for Obsidian vaults, surfacing unreferenced notes and media. The same logic works as a shell script:

```bash
# Build link target index
grep -roh '\[\[.*\]\]' knowledge/ | sed 's/\[\[//;s/\]\]//' | sort -u > /tmp/linked.txt
# Compare to all files
find knowledge/ -name "*.md" -printf "%f\n" | sed 's/\.md$//' | sort > /tmp/all.txt
comm -23 /tmp/all.txt /tmp/linked.txt  # orphans
```

**[obsidian-vault-cli](https://github.com/rjzxui/obsidian-vault-cli)** (`obs`) provides 100+ commands including orphan detection without opening Obsidian.

## Tag Normalization

No mature dedicated CLI exists — typically implemented as a script:

1. **Inventory**: extract all tags via `grep -rh '^tags:' knowledge/**/*.md | sort | uniq -c | sort -rn`
2. **Synonym map**: maintain a YAML file mapping `old-tag → canonical-tag`
3. **Bulk replace**: `sed -i` or a frontmatter-aware script to rewrite tags in place

Tag governance patterns:
- Controlled vocabulary: new tags require a synonym check before introduction
- Threshold-based curation: tags used < 3 times reviewed quarterly
- Hierarchical namespacing (`agent-*`, `ghq-*`) prevents collisions without requiring a tag ontology

## Staleness Detection

**Heuristic approach** (no external tools required):

```bash
# Files not modified in 90+ days
find knowledge/ -name "*.md" -mtime +90 -not -name "INDEX.md"
```

**Frontmatter-based scoring** — add `expires_at` or `review_by` fields at write time:
```yaml
expires_at: "2026-06-01"   # temporal facts that will go stale
```
A cron script scans frontmatter and queues items approaching expiry.

**Confidence decay** — the approach used in GHQ: lower `confidence` scores on old entries as a staleness proxy. Entries below a threshold get queued for re-research. See `production-confidence-decay-models.md`.

Enterprise platforms (Bloomfire, TTMS AI4Knowledge) implement freshness scores with automated alerts at configurable thresholds (e.g., alert at < 85%, degraded mode at < 70%).

## Deduplication Beyond Vector Similarity

Vector similarity (cosine distance on embeddings) catches semantic near-duplicates but has two failure modes:
- **False positives** on short/generic titles with high overlap
- **Misses structural duplicates** with different phrasing but identical content

**Complementary approaches:**

| Method | Tool | Best For |
|--------|------|----------|
| Exact hash | `sha256sum` | Exact copies, templates applied twice |
| Shingling + Jaccard | [datasketch](https://github.com/ekzhu/datasketch) (Python) | Near-identical text, reordered paragraphs |
| MinHash LSH | `text-dedup`, `fastdedup` | Large corpora (1k+ files), batch detection |
| Title/slug fuzzy match | `fzf`, Levenshtein scripts | Same concept, different slug |

For a 500-file KB, a **two-pass pipeline** works well:
1. MinHash pass for bulk near-duplicates (O(n) with LSH)
2. Vector similarity pass on MinHash candidates (more expensive, targeted)

**[fastdedup](https://github.com/wapplewhite4/fastdedup)** CLI example:
```bash
# Requires converting .md to .jsonl first
fastdedup fuzzy-dedup -i kb.jsonl -o deduped.jsonl --threshold 0.85 --field text
```

## Combining into a Maintenance Pipeline

A practical weekly maintenance script for a 500-file KB:

```bash
#!/bin/bash
# 1. Link check (fast, internal only)
find knowledge/ -name "*.md" | xargs npx markdown-link-check --config .mlc.json

# 2. Orphan detection
./scripts/find-orphans.sh > reports/orphans.txt

# 3. Staleness scan (frontmatter + mtime)
./scripts/staleness-scan.sh | head -20  # top 20 stale candidates

# 4. Tag inventory drift
./scripts/tag-inventory.sh | awk '$1 < 2 {print "low-use tag:", $2}'

# 5. Dedup check on recently added entries
npx tsx scripts/reindex.ts && qmd query "..." --json  # spot-check via qmd
```

Run in CI or as a weekly cron; results feed into `.queue.jsonl` as re-research items rather than automated deletion.

## Key Insight

At 500+ files, **automation should triage, not act**. Auto-flagging orphans, stale entries, and low-confidence tags for human review is both safer and more accurate than auto-deletion or auto-merge. The exception is exact duplicates (same slug or hash) which can be auto-removed safely.
