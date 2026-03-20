---
title: "QMD Context Hierarchy: Pipeline Role vs Output Enrichment"
category: qmd-architecture
tags: ["qmd", "retrieval", "reranking", "search-pipeline", "knowledge-management"]
source: https://deepwiki.com/tobi/qmd/3.2-search-modes-explained, https://github.com/tobi/qmd/blob/main/README.md, https://github.com/tobi/qmd/blob/main/example-index.yml
confidence: 0.8
created_at: 2026-03-20T08:00:00Z
updated_at: 2026-03-20T08:00:00Z
---

QMD context hierarchy is primarily an **output enrichment mechanism**, not a scoring signal — BM25 and vector stages are context-blind; context is attached post-retrieval.

## How Context Is Defined

Context is hierarchical metadata defined in `index.yaml` at three levels:

```yaml
global_context: "All collections in this index"

collections:
  MyNotes:
    path: ~/notes
    context:
      "/": "Personal notes vault"
      "/journal/2024": "Daily notes from 2024"
      "/journal/2025": "Daily notes from 2025"
      "/work": "Work-related notes"
```

At query time, `getContextForPath()` resolves the **most specific matching prefix** for each result document, returning the accumulated context string.

## Role in Each Pipeline Stage

| Stage | Context Used? | How |
|-------|--------------|-----|
| Query expansion (LLM) | No | Expansion only sees the query + intent |
| BM25 (FTS5) | No | Operates on document content only |
| Vector search | No | Embedding similarity is content-only |
| RRF fusion | No | Rank-based fusion, no metadata |
| Strong-signal bypass | No | Based on BM25 score gap only |
| LLM reranker | Indirectly | Context is passed alongside candidate text |
| Snippet extraction | Indirectly | `intent` steers extraction; context provides ambient scope |
| **Output** | **Yes** | Context string is returned with every result |

## Context vs Intent: Complementary Roles

Context and `intent` are complementary but distinct:

- **Context** — describes *what documents are about* (document-side metadata). Static, defined at index time.
- **Intent** — describes *what the user is looking for* (query-side metadata). Dynamic, provided per query.

When `intent` is provided, it steers all five pipeline stages including expansion, bypass, chunk selection, reranking, and snippet extraction. Context is *not* equivalent to intent — passing context to the reranker is implicit (the reranker sees the document text plus attached context), not an active steering signal.

## Practical Implication for Agentic Use

The README describes context as "the key feature of QMD" specifically for agentic workflows: when an LLM receives search results, it sees not just the matching text but also the *purpose* of the collection or path containing the match. This lets the LLM make better downstream decisions (e.g., preferring "Work documentation" results over "Personal notes" results when the query is ambiguous).

Context does **not** boost or penalize retrieval scores — it is metadata for the consumer, not the ranker.

## Example Output Structure

```json
{
  "file": "qmd://notes/work/meeting-2025-03-01.md",
  "score": 0.87,
  "context": "Work-related notes",
  "snippet": "...discussed Q2 planning..."
}
```

The `context` field is purely informational for the receiving LLM. To actively steer scoring and snippet extraction, use `--intent` instead.
