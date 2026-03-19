---
title: "Cross-Encoder Re-ranking for Markdown Knowledge Base Retrieval"
category: ghq-core
tags: ["retrieval", "reranking", "benchmarks", "comparison", "vector-search", "embeddings"]
source: "https://markaicode.com/bge-reranker-cross-encoder-reranking-rag/, https://www.pinecone.io/learn/series/rag/rerankers/, https://sbert.net/docs/cross_encoder/pretrained_models.html, https://agentset.ai/rerankers, https://weaviate.io/blog/cross-encoders-as-reranker, https://ragaboutit.com/adaptive-retrieval-reranking-how-to-implement-cross-encoder-models-to-fix-enterprise-rag-ranking-failures/"
confidence: 0.87
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

Cross-encoders improve RAG retrieval accuracy 20–40% over bi-encoder-only pipelines at the cost of 100–500ms added latency on a small candidate set.

## How Re-ranking Works

Two-stage retrieval separates *recall* (fast, coarse) from *precision* (slow, fine):

1. **Stage 1 — first-stage retriever** (BM25, bi-encoder, or SPLADE): retrieve top-K candidates quickly from the full corpus (K = 50–100).
2. **Stage 2 — cross-encoder reranker**: score each `(query, passage)` pair jointly through a full transformer, re-order candidates, and return the top-N (N = 5–20).

**Why cross-encoders are more accurate than bi-encoders**: Bi-encoders compress documents to a fixed-size vector *independently* of the query, losing query-document interactions. Cross-encoders process both together, enabling attention across tokens, capturing nuanced relevance signals.

## Latency Tradeoffs

| Setup | Candidates scored | Latency added | Accuracy gain |
|---|---|---|---|
| MiniLM-L6 on CPU | 20–30 | ~50–100ms | +20–30% |
| MiniLM-L12 on CPU | 20–30 | ~150–250ms | +25–35% |
| BGE-reranker-v2-m3 on GPU | 50 | ~50–80ms | +33–40% |
| Cohere Rerank 3.5 (API) | 50–100 | ~595ms (API RTT) | high |

Latency scales *linearly* with candidate count — scoring 50 documents at ~8ms/pair on CPU = 400ms overhead. Stay under 30 candidates on CPU for interactive use.

## Popular Libraries and Models

### sentence-transformers (local, open-source)

```python
from sentence_transformers import CrossEncoder

model = CrossEncoder("cross-encoder/ms-marco-MiniLM-L6-v2")
pairs = [(query, passage) for passage in candidates]
scores = model.predict(pairs)
ranked = sorted(zip(scores, candidates), reverse=True)
```

**Model options:**

| Model | Size | Speed (CPU, 20 docs) | Notes |
|---|---|---|---|
| `ms-marco-TinyBERT-L-2-v2` | 4M params | ~20ms | fastest, lowest accuracy |
| `ms-marco-MiniLM-L6-v2` | 22M params | ~50ms | best speed/accuracy balance |
| `ms-marco-MiniLM-L12-v2` | 33M params | ~100ms | production default |
| `ms-marco-electra-base` | 110M params | ~300ms | highest accuracy, slow |

### FlashRank (lightweight alternative)

```python
from flashrank import Ranker, RerankRequest

ranker = Ranker(model_name="ms-marco-MiniLM-L-12-v2")
request = RerankRequest(query=query, passages=[{"text": p} for p in candidates])
results = ranker.rerank(request)
```

FlashRank wraps sentence-transformers with minimal overhead — no extra deps, good for CLI/scripting contexts.

### BGE Reranker (BAAI, multilingual)

`BAAI/bge-reranker-v2-m3` supports 100+ languages, Apache 2.0 license. On GPU: ~50–80ms for 50 candidates. Self-hostable alternative to Cohere.

### Cohere Rerank (managed API)

```python
import cohere
co = cohere.Client(api_key)
results = co.rerank(model="rerank-v3.5", query=query, documents=candidates, top_n=5)
```

ELO leaderboard: Cohere Rerank 3.5 (1451 ELO, 41%) vs BGE-v2-m3 (1327 ELO, 29%). Cohere wins on accuracy but adds ~600ms API latency and ongoing cost.

## Accuracy Gains (Empirical)

- **+20–35%** relevance improvement over embedding-only retrieval across most studies
- **+33–40%** with BGE reranker in controlled benchmarks, for only +120ms added latency
- Jina Reranker v3: 81.33% Hit@1 at 188ms — sub-200ms tier on GPU

## Practical Architecture for Markdown KBs

```
Query
  │
  ▼
BM25 or bi-encoder retrieval (top 30–50 docs)   ← fast, ~10ms
  │
  ▼
Cross-encoder reranker (MiniLM-L12 or BGE)       ← precise, +100–250ms
  │
  ▼
Return top 5–10 passages to LLM context
```

For GHQ's `qmd` pipeline: BM25 + vector hybrid search already covers stage 1. Adding a reranker step on top of the 10–20 candidates `qmd query` returns would cost ~50–100ms and substantially improve precision for ambiguous queries.

## When Re-ranking Pays Off

- Query is ambiguous or multi-faceted (keyword search may surface irrelevant docs)
- Corpus is large (>500 entries) and initial retrieval returns noisy candidates
- LLM context window is limited — reranking ensures the best docs fill it

## When to Skip It

- Corpus is small (<100 entries) — initial retrieval is already high-precision
- Latency budget is strict (<50ms total) — skip unless GPU is available
- Query is very specific / keyword-exact — BM25 alone may be sufficient

## Sources

- [Build BGE Reranker: Cross-Encoder Reranking for Better RAG](https://markaicode.com/bge-reranker-cross-encoder-reranking-rag/)
- [Rerankers and Two-Stage Retrieval (Pinecone)](https://www.pinecone.io/learn/series/rag/rerankers/)
- [CrossEncoder — Sentence Transformers documentation](https://sbert.net/docs/cross_encoder/pretrained_models.html)
- [Reranker Leaderboard (Agentset)](https://agentset.ai/rerankers)
- [Cross-Encoders as Reranker (Weaviate)](https://weaviate.io/blog/cross-encoders-as-reranker)
- [Adaptive Retrieval Reranking (RAG About It)](https://ragaboutit.com/adaptive-retrieval-reranking-how-to-implement-cross-encoder-models-to-fix-enterprise-rag-ranking-failures/)
