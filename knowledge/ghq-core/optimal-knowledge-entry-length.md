---
title: "Optimal Knowledge Entry Length"
category: ghq-core
tags: ["knowledge-management", "chunking", "retrieval", "zettelkasten", "writing"]
source: web research
confidence: 0.8
created_at: 2026-03-19T02:10:00Z
updated_at: 2026-03-19T02:10:00Z
---

Ideal knowledge entry length depends on use case: 200-800 words for human reading, 256-512 tokens for RAG retrieval.

## The Core Tension

Knowledge entries serve two audiences: humans browsing and search systems retrieving. These create competing pressures:

| Audience | Optimal size | Why |
|----------|-------------|-----|
| Human readers | 200-800 words | Long enough for context, short enough to scan |
| RAG / vector search | 256-512 tokens (~200-400 words) | Sweet spot for embedding quality and retrieval precision |
| Zettelkasten / atomic notes | 1 idea, any length | Atomicity matters more than word count |

## Guidelines by Context

### For retrieval-optimized knowledge bases (like GHQ)

- **Target: 200-600 words per entry** — this satisfies both human readability and search retrieval
- **One topic per file** — atomic notes retrieve better than multi-topic documents
- **If an entry exceeds ~800 words**, consider splitting into sub-topics with cross-links
- **If under 100 words**, consider whether it's too thin to be useful standalone — merge into a related entry or expand

### For RAG chunking

- **256-512 tokens** is the consensus sweet spot for most embedding models (2025-2026 research)
- **10-20% overlap** between chunks preserves context at boundaries
- **Semantic chunking** outperforms fixed-size by ~70% in retrieval accuracy
- Small, focused documents that already match queries often don't need chunking at all — chunking can hurt

### For Zettelkasten / personal notes

- **No strict word limit** — atomicity is about one idea, not one paragraph
- Digital practitioners commonly allow up to 500 words per note
- The constraint is conceptual (single idea) not physical (card size)

## Practical Rules of Thumb

1. **First line = summary** — keep under 100 chars; this becomes the index entry
2. **Scannable in 30 seconds** — if a reader can't grasp the entry in a quick scan, it's too long or poorly structured
3. **Self-contained** — the entry should make sense without reading other entries, though it can link to them
4. **Split trigger** — if you need more than 3 H2 sections, the entry likely covers multiple topics
5. **Merge trigger** — if two entries always get retrieved together, they probably belong as one

## Why This Matters for Search

Knowledge base articles with 300+ words perform better in search rankings. Articles over 400 words get ~1.45x more traffic and are 3x more likely to be rated helpful. But for vector search specifically, shorter focused chunks retrieve more precisely — there's diminishing returns past 512 tokens where noise dilutes the embedding.

## Sources

- [Helpjuice: Short vs Lengthy Knowledge Base Articles](https://helpjuice.com/blog/360615-4-mind-blowing-metrics-on-short-vs-lengthy-knowledge-base-articles)
- [LangCopilot: Document Chunking for RAG](https://langcopilot.com/posts/2025-10-11-document-chunking-for-rag-practical-guide)
- [Zettelkasten.de: Guide to Atomic Note-Taking](https://zettelkasten.de/atomicity/guide/)
- [PTKM: Long Notes or Short Notes – 5-Year Reflections](https://ptkm.substack.com/p/long-notes-or-short-notes-my-5-year)
- [Meda.io: Finding the Right Granularity](https://meda.io/finding-the-right-granularity-in-your-zettelkasten-notes/)
