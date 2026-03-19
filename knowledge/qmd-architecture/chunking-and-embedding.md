---
title: "QMD Chunking and Embedding Strategy"
category: qmd-architecture
tags: ["qmd", "chunking", "vector-search", "retrieval", "token-optimization"]
source: blueprint
confidence: 0.5
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

QMD chunks documents into ~900 token segments with 15% overlap for vector embedding (`qmd embed`). This chunking strategy balances retrieval granularity against semantic coherence — chunks need to be small enough to match specific concepts but large enough to preserve context.

Embeddings are generated locally using a GGUF model via node-llama-cpp (the specific embedding model appears to be Qwen3-Embedding based on changelog references). All data — FTS5 index, embeddings, collection metadata — lives in a single SQLite database at `~/.cache/qmd/index.sqlite`.

During search, the best chunk per document is selected for reranking. Chunk selection scores query terms at 1.0x weight and intent terms at 0.5x weight. Snippet extraction then scores intent terms at 0.3x to nudge displayed snippets toward intent-relevant lines without overriding query anchoring. The exact chunking algorithm and boundary detection strategy (sentence-aware vs. fixed-window) are not fully documented and would benefit from source inspection.
