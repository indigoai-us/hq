---
title: "Automated Tooling for Markdown Knowledge Base Maintenance at Scale"
category: knowledge-maintenance
tags: ["cli", "knowledge-management", "maintenance", "open-source", "staleness", "automation", "deduplication", "embeddings", "ci-cd", "hooks"]
source: https://github.com/tcort/markdown-link-check, https://github.com/remarkjs/remark-lint, https://github.com/Canna71/obsidian-janitor, https://github.com/rjzxui/obsidian-vault-cli, https://blog.nelhage.com/post/fuzzy-dedup/, https://github.com/allenai/duplodocus, https://ragaboutit.com/the-knowledge-decay-problem-how-to-build-rag-systems-that-stay-fresh-at-scale/, https://github.com/MinishLab/semhash, https://docs.nvidia.com/nemo/curator/latest/curate-text/process-data/deduplication/semdedup.html, https://ekzhu.com/datasketch/lsh.html, https://github.com/JulianCataldo/remark-lint-frontmatter-schema, https://github.com/hashicorp/front-matter-schema, https://github.com/DavidAnson/markdownlint-cli2
confidence: 0.87
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T21:00:00Z
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

**Complementary approaches by method:**

| Method | Tool | Best For |
|--------|------|----------|
| Exact hash | `sha256sum` | Exact copies, templates applied twice |
| Shingling + Jaccard | [datasketch](https://github.com/ekzhu/datasketch) (Python) | Near-identical text, reordered paragraphs |
| MinHash LSH | `datasketch`, `text-dedup` | Large corpora (1k+ files), batch detection |
| Semantic (embeddings + ANN) | [SemHash](https://github.com/MinishLab/semhash) | Near-duplicate entries with paraphrased content |
| Clustering + cosine | [NeMo Curator SemDeDup](https://docs.nvidia.com/nemo/curator/latest/curate-text/process-data/deduplication/semdedup.html) | Large datasets, GPU-accelerated |
| Title/slug fuzzy match | `fzf`, Levenshtein scripts | Same concept, different slug |

### SemHash (Recommended for KB dedup)

**[SemHash](https://github.com/MinishLab/semhash)** by MinishLab is the best fit for flat-file markdown KBs:
- Uses **Model2Vec** (lightweight static embeddings, ~30MB) + **Vicinity** (ANN search) — very fast, no GPU needed
- Handles millions of records; sub-second on small KBs (<1k entries)
- Supports cross-dataset dedup (e.g., deduplicate incoming entries against an existing KB)

```python
from semhash import SemHash

# Load existing KB entries (list of strings or dicts)
texts = [open(f).read() for f in kb_files]
deduplicator = SemHash.fit(texts)

# Check new entries against existing KB
new_texts = [open(f).read() for f in new_files]
result = deduplicator.deduplicate(new_texts, threshold=0.9)
print(result.duplicates)    # list of (new_idx, existing_idx, score)
print(result.deduplicated)  # unique new entries
```

RAG-specific use case: deduplicate chunks after splitting — duplicate chunks inflate retrieval noise and force early diversification strategies.

### NeMo Curator SemDeDup (Large Scale)

NVIDIA's **[SemDeDup](https://docs.nvidia.com/nemo/curator/latest/curate-text/process-data/deduplication/semdedup.html)** algorithm for GPU-scale corpora:
1. **Embed** with any pretrained model (e.g., `sentence-transformers`)
2. **Cluster** with k-means (clusters localize the search space)
3. **Compute pairwise cosine similarity** within each cluster
4. **Remove** all but one representative from pairs above a threshold

Overkill for small KBs (<10k entries) but valuable for LLM training data pipelines.

### datasketch MinHash LSH (Text-Level)

**[datasketch](https://github.com/ekzhu/datasketch)** for character/token-level similarity (not semantic):

```python
from datasketch import MinHash, MinHashLSH

lsh = MinHashLSH(threshold=0.8, num_perm=128)
minhashes = {}
for doc_id, text in docs.items():
    m = MinHash(num_perm=128)
    for shingle in set(text.split()):  # word shingles
        m.update(shingle.encode('utf8'))
    lsh.insert(doc_id, m)
    minhashes[doc_id] = m

# Query for near-duplicates of a new doc
candidates = lsh.query(minhashes["new_entry"])
```

Supports Redis/Cassandra storage layers for large-scale persistent indexes. Scales to millions of documents with sub-linear query cost.

### Two-Pass Pipeline for KB Maintenance

For a 500-file KB, combine both approaches:
1. **MinHash pass** — bulk near-duplicates at text level (O(n) with LSH, fast)
2. **SemHash pass** — semantic duplicates among MinHash survivors (targets paraphrased content)

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

## CI/CD Quality Gates

### Defense-in-Depth Enforcement Model

Quality enforcement works best as three layers, each progressively slower but more authoritative:

| Layer | Trigger | Scope | Blocks |
|-------|---------|-------|--------|
| **pre-commit hook** | `git commit` | Staged `.md` files only | The commit |
| **PR quality gate** (CI) | `pull_request` event | All changed files | Merge |
| **Scheduled scan** | Cron (weekly) | Entire KB | Creates issues/queue items |

### Layer 1: Pre-Commit Hooks (Frontmatter Validation)

Use the [pre-commit](https://pre-commit.com/) framework with a custom hook:

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: validate-frontmatter
        name: Validate KB frontmatter
        entry: scripts/validate-frontmatter.sh
        language: script
        files: ^knowledge/.*\.md$
        exclude: INDEX\.md
```

**Script approach** — parse YAML frontmatter and assert required fields:

```bash
#!/usr/bin/env bash
# scripts/validate-frontmatter.sh
errors=0
for f in "$@"; do
  # Extract frontmatter between --- delimiters
  fm=$(awk '/^---/{found++; next} found==1' "$f")
  for field in title category tags created_at confidence; do
    if ! echo "$fm" | grep -q "^${field}:"; then
      echo "MISSING '$field' in $f"
      errors=$((errors + 1))
    fi
  done
done
exit $errors
```

**Schema-based approach** — [remark-lint-frontmatter-schema](https://github.com/JulianCataldo/remark-lint-frontmatter-schema) validates against a JSON schema:

```yaml
# .remarkrc.mjs
import remarkFrontmatter from 'remark-frontmatter'
import rlFrontmatterSchema from 'remark-lint-frontmatter-schema'

const remarkConfig = {
  plugins: [
    remarkFrontmatter,
    [rlFrontmatterSchema, { schemas: { './knowledge/meta/schema.json': ['./knowledge/**/*.md'] } }]
  ]
}
```

[HashiCorp's `front-matter-schema` GitHub Action](https://github.com/hashicorp/front-matter-schema) provides the same as a ready-made workflow step.

### Layer 2: PR Quality Gate (GitHub Actions)

```yaml
# .github/workflows/kb-quality.yml
name: KB Quality Gate
on:
  pull_request:
    paths: ['knowledge/**/*.md']

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Validate frontmatter
        run: |
          changed=$(git diff --name-only origin/main...HEAD -- 'knowledge/**/*.md')
          echo "$changed" | xargs scripts/validate-frontmatter.sh

      - name: Lint markdown
        run: npx markdownlint-cli2 "knowledge/**/*.md" --ignore "knowledge/**/INDEX.md"

      - name: Check for semantic duplicates
        run: |
          # Run dedup check against new/changed entries only
          changed=$(git diff --name-only origin/main...HEAD -- 'knowledge/**/*.md')
          for f in $changed; do
            title=$(grep '^title:' "$f" | head -1 | sed 's/title: //')
            score=$(qmd query "$title" -n 1 --json | jq '.[0].score // 0')
            if (( $(echo "$score > 0.9" | bc -l) )); then
              echo "Potential duplicate: $f (score $score)"
              exit 1
            fi
          done

      - name: Broken link check (internal only)
        run: find knowledge/ -name '*.md' | xargs npx markdown-link-check --config .mlc.json
```

### Layer 3: Scheduled Staleness Report (Cron)

```yaml
# .github/workflows/kb-staleness.yml
name: KB Staleness Report
on:
  schedule:
    - cron: '0 9 * * 1'  # Mondays at 9am

jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Generate staleness report
        run: |
          echo "## Stale KB Entries" > staleness-report.md
          find knowledge/ -name "*.md" -not -name "INDEX.md" -mtime +90 \
            -exec echo "- {}" \; >> staleness-report.md

      - name: Create issue if stale entries found
        if: success()
        run: |
          count=$(find knowledge/ -name "*.md" -not -name "INDEX.md" -mtime +90 | wc -l)
          if [ "$count" -gt 0 ]; then
            gh issue create --title "KB Staleness Report: $count entries need review" \
              --body "$(cat staleness-report.md)" --label "kb-maintenance"
          fi
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### What to Block vs. Flag

| Check | Action |
|-------|--------|
| Missing required frontmatter fields | **Block** commit/merge |
| Frontmatter schema violation | **Block** merge |
| Semantic duplicate score > 0.9 | **Block** merge with diff link |
| Broken internal link | **Block** merge |
| Broken external link | **Warn** (external URLs go stale independently) |
| Entry not modified in 90+ days | **Flag** via scheduled issue/queue item |
| Tag used < 2 times | **Flag** in weekly report |
| Low confidence (< 0.5) | **Flag** for re-research |

## Key Insight

At 500+ files, **automation should triage, not act**. Auto-flagging orphans, stale entries, and low-confidence tags for human review is both safer and more accurate than auto-deletion or auto-merge. The exception is exact duplicates (same slug or hash) which can be auto-removed safely.
