---
title: "QMD SDK / Library API Overview"
category: qmd-sdk
tags: ["qmd", "cli", "retrieval", "agent-loop", "production-patterns"]
source: blueprint
confidence: 0.5
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

Since v1.1.6, QMD exposes a programmatic SDK via `import { createStore } from '@tobilu/qmd'`. The v2.0.0 release declared this a stable API, making the SDK the primary interface with the MCP server and CLI as consumers.

`createStore()` accepts three modes: (1) inline config with `dbPath` and `config` object defining collections, (2) YAML config file via `configPath`, or (3) DB-only mode to reopen a previously configured store. It returns a `QMDStore` instance.

Key methods on `QMDStore`:
- `search({ query })` — auto-expanded hybrid search (BM25 + vector + reranking)
- `search({ queries })` — pre-expanded structured queries, skipping auto-expansion
- `search({ query, rerank: false })` — skip reranking for faster results
- `searchLex(query)` — direct BM25 keyword search
- `searchVector(query)` — direct vector similarity search
- `expandQuery(query, { intent })` — manual query expansion for full control
- `getDocumentBody()`, `get()`, `multiGet()` — document retrieval
- Collection and context management methods
- `close()` — lifecycle cleanup

The `search()` method accepts `intent`, `collection`, `limit`, `minScore`, and `explain` options. The `explain` flag returns scoring details for debugging retrieval quality.
