---
title: "Chunk Size vs. Retrieval Precision: Empirical Findings"
category: ghq-core
tags: ["chunking", "retrieval", "knowledge-management", "vector-search", "benchmarks"]
source: "https://arxiv.org/html/2505.21700v2, https://towardsdatascience.com/chunk-size-as-an-experimental-variable-in-rag-systems/, https://pmc.ncbi.nlm.nih.gov/articles/PMC12649634/, https://research.trychroma.com/evaluating-chunking, https://weaviate.io/blog/late-chunking, https://arxiv.org/html/2601.16934v1"
confidence: 0.85
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

Longer chunks degrade retrieval precision; 256–512 tokens (~200–400 words) is the empirically supported sweet spot for most RAG use cases.

## Core Finding

Empirical studies consistently show that larger chunk sizes reduce retrieval precision while improving recall for broad/analytical queries. The relationship is non-linear:

| Chunk size | ~Words | Best for | Precision impact |
|---|---|---|---|
| 64–128 tokens | 50–100 | Factoid / single-fact retrieval | Highest precision |
| 256–512 tokens | 200–400 | General-purpose RAG | Good balance |
| 512–1024 tokens | 400–800 | Analytical / contextual queries | Lower precision, higher recall |
| 1024+ tokens | 800+ | Broad summarization tasks | Significant precision loss |

## Quantified Degradation

- **Recursive splitting at 400 tokens** → 85–90% recall; semantic chunking at same size → **91–92%** (Chroma Research)
- **Beyond 500 words**: introduces redundancy and repetition that degrades embedding signal (clinical decision support study, PMC 2025)
- **Below 300 words**: loses directive and context qualifiers essential for safety-critical retrieval
- **Adaptive chunking (cosine ≥0.8, 500-word cap)** achieved 87% accuracy vs 50% baseline (p=0.001) in a controlled benchmark
- **Model-specific sensitivity**: Stella embedding model improves recall@1 by **5–8%** at 512–1024 tokens vs 64–128; Snowflake does not show the same improvement — optimal chunk size is model-dependent

## Why Long Entries Hurt Precision

Vector embeddings compress an entire chunk into a single dense vector. As length increases:

1. **Semantic dilution**: multiple topics compete for representation in one vector
2. **Positional bias**: early segments in multi-segment documents are over-represented; later content is marginalized (arxiv 2601.16934)
3. **Context rot**: performance degrades monotonically with input length even in controlled settings
4. **Noise amplification**: every extra sentence adds noise that may not be present in the query

## What the 800+ Word Threshold Means in Practice

For GHQ-style knowledge entries:
- An 800-word entry (~1,000 tokens) sits in the range where precision starts meaningfully degrading
- Expected precision loss vs a 300-word entry: **qualitative degradation** but not catastrophic — retrieval still works, but you may miss hits when a query targets only a subsection
- The entry-level mitigation: ensure each entry covers exactly one coherent topic (atomicity matters more than word count)

## Practical Implication for GHQ

The `optimal-knowledge-entry-length.md` heuristics (200–600 words) are empirically supported:
- Below 256 tokens (~200 words): context may be too thin for meaningful embedding
- 256–512 tokens (~200–400 words): highest retrieval precision for single-topic queries
- 512–800 words: acceptable but monitor for topic drift
- 800+ words: split unless the extra length is pure supporting detail (tables, examples) rather than new sub-topics

## Sources

- [Rethinking Chunk Size for Long-Document Retrieval: Multi-Dataset Analysis](https://arxiv.org/html/2505.21700v2)
- [Chunk Size as Experimental Variable in RAG Systems](https://towardsdatascience.com/chunk-size-as-an-experimental-variable-in-rag-systems/)
- [Comparative Evaluation of Advanced Chunking for Clinical Decision Support (PMC 2025)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12649634/)
- [Evaluating Chunking Strategies (Chroma Research)](https://research.trychroma.com/evaluating-chunking)
- [Late Chunking: Balancing Precision and Cost (Weaviate)](https://weaviate.io/blog/late-chunking)
- [Information Representation Fairness in Long-Document Embeddings](https://arxiv.org/html/2601.16934v1)
- [A Systematic Investigation of Document Chunking Strategies](https://arxiv.org/html/2603.06976)
