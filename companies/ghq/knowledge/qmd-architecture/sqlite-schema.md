---
title: "QMD SQLite Schema and Storage Architecture"
category: qmd-architecture
tags: ["qmd", "schema", "vector-search", "retrieval", "sqlite"]
source: "https://deepwiki.com/tobi/qmd/6.3-data-storage-and-schema, https://deepwiki.com/tobi/qmd/3.1-collections-and-indexing, https://github.com/tobi/qmd, https://github.com/openclaw/openclaw/issues/16844"
confidence: 0.88
created_at: 2026-03-20T22:00:00Z
updated_at: 2026-03-20T22:00:00Z
---

QMD stores all search data in a single SQLite database (`~/.cache/qmd/index.sqlite`) using WAL mode, with content-addressable deduplication across collections.

## Core Tables

### Content Layer

**`content`** — Deduplicated document bodies, keyed by SHA-256 hash. Multiple documents referencing the same content share one row. Cascade-deleted when no document references it.

**`documents`** — Maps filesystem paths to content hashes:

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT | 6-char short hash (display ID) |
| `collection` | TEXT | Collection name from config |
| `path` | TEXT | Relative path within collection |
| `title` | TEXT | Extracted document title |
| `hash` | TEXT | FK → `content(hash)` |
| `created_at` | INTEGER | Unix timestamp |
| `modified_at` | INTEGER | Unix timestamp |
| `active` | INTEGER | Soft-delete flag (0 = inactive) |

Unique constraint on `(collection, path)` prevents duplicates.

### Search Indexes

**`documents_fts`** (FTS5 virtual table) — Full-text index for BM25 keyword search:
- Tokenizer: `porter unicode61` (Porter stemming + Unicode normalization)
- Columns: `filepath`, `title`, `body`
- Mirrors only **active** documents
- Automatically synchronized via three database triggers on `documents` insert/update/delete

**`content_vectors`** — Chunk-level embedding metadata:

| Column | Notes |
|--------|-------|
| `hash` | Document content hash |
| `seq` | Chunk sequence number (0-indexed) |
| `pos` | Character offset in original document |
| `model` | Embedding model identifier |

PK: `(hash, seq)`. Chunks are ~900 tokens with 15% overlap.

**`vectors_vec`** (sqlite-vec virtual table) — Cosine similarity vector index:
- Stores 768-dimensional float embeddings
- Keyed by `hash_seq` string (e.g., `"abc123_0"`)
- Extension loading is non-fatal: if sqlite-vec is unavailable, FTS5-only mode continues silently

### Configuration and Cache Tables

**`store_collections`** — Cached collection metadata from `~/.config/qmd/index.yml` (name, root path, glob patterns). Synced via `syncConfigToDb()` on startup.

**`path_contexts`** — Context descriptions keyed by `qmd://` virtual path. Powers the context hierarchy for scoped search.

**`llm_cache`** — Cached LLM inference results (query expansion sub-queries, rerank scores):
- Key: SHA-256 hash of operation type + parameters
- Value: JSON response
- Capped at 1,000 most-recent entries

## WAL Mode and Concurrency

QMD enables SQLite's **Write-Ahead Logging (WAL)** journal mode by default. WAL allows concurrent reads during writes, which is important for the MCP HTTP server serving multiple simultaneous search requests.

**Known WAL gotcha**: Tools that open a persistent read-only `DatabaseSync` connection at startup (e.g., OpenClaw's QmdMemoryManager) get pinned to the WAL snapshot at connection open time. After `qmd update` writes new document hashes, those stale connections return outdated results until reconnected. Fix: re-open the connection after each update, or use read-committed isolation by calling `PRAGMA wal_checkpoint` before querying.

## Content-Addressable Design Benefits

- **Deduplication**: Identical files in different collections or paths share one `content` row and one set of `content_vectors` rows.
- **Cheap renames/moves**: Only the `documents` row changes; content and vectors are unchanged.
- **Clean deletes**: The `active` flag enables soft-delete without immediately invalidating FTS5 or vector indexes; hard GC can run separately.

## Database Location

Default path: `~/.cache/qmd/index.sqlite` (respects `XDG_CACHE_HOME`). The `CLAUDE.md` in the qmd repo explicitly warns: **never modify the SQLite database directly**.
