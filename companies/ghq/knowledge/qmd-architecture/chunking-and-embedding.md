---
title: "QMD Chunking and Embedding Strategy"
category: qmd-architecture
tags: ["qmd", "chunking", "vector-search", "retrieval", "token-optimization"]
source: "https://deepwiki.com/tobi/qmd, https://deepwiki.com/tobi/qmd/2-getting-started, https://github.com/tobi/qmd"
confidence: 0.88
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T08:00:00Z
---

QMD uses markdown-aware smart chunking: ~900-token segments with 15% overlap, boundaries scored by structural element type.

## Parameters

| Parameter | Value |
|-----------|-------|
| Target chunk size | 900 tokens (~3,600 chars) |
| Overlap | 135 tokens (~540 chars, 15%) |
| Boundary search window | 200 tokens (~800 chars) |

## Boundary Scoring

The algorithm scans candidates within the search window and scores each potential break point by markdown element type:

| Break Type | Score |
|------------|-------|
| H1 heading (`#`) | 100 |
| H2 heading (`##`) | 90 |
| H3 heading / code fence | 80 |
| H4 heading | 70 |
| H5 heading / horizontal rule | 60 |
| H6 heading | 50 |
| Blank line | 20 |
| List item | 5 |
| Newline | 1 |

## Selection Algorithm

`findBestCutoff()` selects the optimal split within the search window using **squared-distance decay**: a high-scoring boundary farther from the target can still outrank an inferior boundary closer to it. Example: an H2 heading 200 tokens back (score ~30 after decay) beats a bare newline at the target (score 1).

Code fences are pre-scanned via `findCodeFences()` — no split is ever placed inside a fenced code block. If a code block exceeds the chunk size, it is kept whole.

## Overlap Mechanics

After placing a chunk boundary, the next chunk begins 135 tokens before the end of the previous one. This 15% overlap ensures that concepts straddling a boundary are fully represented in at least one chunk.

## Embeddings and Storage

Embeddings are generated locally via `node-llama-cpp` using a GGUF model (Qwen3-Embedding, per changelog references). All data — FTS5 index, embeddings, chunk metadata, collection info — lives in a single SQLite database at `~/.cache/qmd/index.sqlite`.

## Search-Time Chunk Selection

During retrieval, the best-matching chunk per document is selected for reranking using a weighted term score:
- Query terms: 1.0× weight
- Intent terms: 0.5× weight

Snippet extraction weights intent terms at 0.3× to nudge displayed text toward intent-relevant lines without overriding query anchoring.
