# qmd-architecture

| File | Title | Summary | Confidence | Updated |
|------|-------|---------|------------|---------|
| [chunking-and-embedding.md](chunking-and-embedding.md) | QMD Chunking and Embedding Strategy | QMD chunks documents into ~900 token segments with 15% overlap for vector embedding (`qmd embed`)... | 0.5 | 2026-03-20 |
| [hybrid-search-pipeline.md](hybrid-search-pipeline.md) | QMD Hybrid Search Pipeline | QMD's `query` command implements a three-stage hybrid search pipeline: BM25 keyword search, vecto... | 0.5 | 2026-03-20 |
| [query-expansion-llm-pipeline.md](query-expansion-llm-pipeline.md) | QMD Query Expansion LLM Pipeline | QMD's `query` command expands a raw user query into typed `lex`/`vec`/`hyde` sub-queries via a fi... | 0.9 | 2026-03-20 |
