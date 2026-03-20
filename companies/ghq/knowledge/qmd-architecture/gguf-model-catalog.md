---
title: "QMD GGUF Model Catalog"
category: qmd-architecture
tags: ["qmd", "gguf", "retrieval", "reranking", "vector-search"]
source: "https://github.com/tobi/qmd, https://deepwiki.com/tobi/qmd/2-getting-started, https://huggingface.co/ggml-org/embeddinggemma-300M-GGUF"
confidence: 0.9
created_at: 2026-03-20T22:40:00Z
updated_at: 2026-03-20T22:40:00Z
---

QMD ships three default GGUF models that auto-download on first use to `~/.cache/qmd/models/`.

## Default Models

| Role | HuggingFace URI | Approx. Size |
|------|----------------|--------------|
| Embedding | `hf:ggml-org/embeddinggemma-300M-GGUF/embeddinggemma-300M-Q8_0.gguf` | ~329 MB |
| Reranking | `hf:ggml-org/Qwen3-Reranker-0.6B-Q8_0-GGUF/qwen3-reranker-0.6b-q8_0.gguf` | ~640 MB |
| Query expansion | `hf:tobil/qmd-query-expansion-1.7B-gguf/qmd-query-expansion-1.7B-q4_k_m.gguf` | ~1.1 GB |

**Total disk footprint:** ~2 GB for all three models.

## Model Details

- **EmbeddingGemma-300M Q8_0** — Google's embedding-focused Gemma variant (300M params), quantized to 8-bit. Generates the dense vectors used in `qmd vsearch` and the vector leg of `qmd query`. Hosted by ggml-org.
- **Qwen3-Reranker-0.6B Q8_0** — Alibaba's cross-encoder reranker (0.6B params), quantized to 8-bit. Scores candidate chunks with full attention over (query, passage) pairs after BM25+vector candidate retrieval. Hosted by ggml-org.
- **qmd-query-expansion-1.7B Q4_K_M** — A fine-tuned 1.7B model authored by `tobil` (Tobi Lütke). Generates synthetic sub-queries for query expansion before RRF fusion. Uses the lighter Q4_K_M quantization to keep latency acceptable. This is QMD-specific and not a general-purpose model.

## Runtime

All three models load via **node-llama-cpp** in-process — no separate inference server required. Models stay resident in memory across requests within a session. The `hf:` URI prefix is a node-llama-cpp convention that triggers download from HuggingFace on first use.

## Overriding Models

The embedding model can be overridden with `QMD_EMBED_MODEL` env var. Alternatives like `Qwen3-Embedding-0.6B` (better multilingual support) or external OpenAI-compatible embedding endpoints (LiteLLM, Infinity) are also supported.

## Cache Location

```
~/.cache/qmd/models/          # default cache root
$XDG_CACHE_HOME/qmd/models/   # if XDG_CACHE_HOME is set
```
