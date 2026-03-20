# qmd-architecture

| File | Title | Summary | Confidence | Updated |
|------|-------|---------|------------|---------|
| [gguf-model-catalog.md](gguf-model-catalog.md) | QMD GGUF Model Catalog | QMD ships three default GGUF models that auto-download on first use to `~/.cache/qmd/models/`. | 0.9 | 2026-03-20 |
| [sqlite-schema.md](sqlite-schema.md) | QMD SQLite Schema and Storage Architecture | QMD stores all search data in a single SQLite database (`~/.cache/qmd/index.sqlite`) using WAL mo... | 0.9 | 2026-03-20 |
| [chunking-and-embedding.md](chunking-and-embedding.md) | QMD Chunking and Embedding Strategy | QMD uses markdown-aware smart chunking: ~900-token segments with 15% overlap, boundaries scored b... | 0.9 | 2026-03-20 |
| [context-hierarchy-pipeline-role.md](context-hierarchy-pipeline-role.md) | QMD Context Hierarchy: Pipeline Role vs Output Enrichment | QMD context hierarchy is primarily an **output enrichment mechanism**, not a scoring signal — BM2... | 0.8 | 2026-03-20 |
| [hybrid-search-pipeline.md](hybrid-search-pipeline.md) | QMD Hybrid Search Pipeline | QMD's `query` command implements a three-stage hybrid search pipeline: BM25 keyword search, vecto... | 0.9 | 2026-03-20 |
| [embedded-skills-system.md](embedded-skills-system.md) | QMD Embedded-Skills System and skill install Command | QMD ships skills as base64-encoded blobs inside the binary, installable via `qmd skill install` i... | 0.8 | 2026-03-20 |
| [query-expansion-llm-pipeline.md](query-expansion-llm-pipeline.md) | QMD Query Expansion LLM Pipeline | QMD's `query` command expands a raw user query into typed `lex`/`vec`/`hyde` sub-queries via a fi... | 0.9 | 2026-03-20 |
