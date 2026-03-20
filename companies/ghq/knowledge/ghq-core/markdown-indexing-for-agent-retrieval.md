---
title: "Markdown Indexing Strategies for Agent Retrieval"
category: ghq-core
tags: ["knowledge-management", "retrieval", "chunking", "information-architecture", "agent-loop"]
source: "https://www.firecrawl.dev/blog/best-chunking-strategies-rag, https://weaviate.io/blog/chunking-strategies-for-rag, https://lethain.com/library-mcp/, https://www.ibm.com/docs/en/waasfgm?topic=generation-optimizing-your-rag-knowledge-base, https://developer.webex.com/blog/boosting-ai-performance-the-power-of-llm-friendly-content-in-markdown"
confidence: 0.82
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

# Markdown Indexing Strategies for Agent Retrieval

How to structure markdown knowledge entries to maximize retrieval accuracy for LLM agents using BM25, vector, or hybrid search.

## Core Principle: Structure Mirrors Retrieval

Agents retrieve by semantic similarity or keyword overlap — entry structure directly determines what gets matched. An entry that opens with its core claim (not a vague title) scores higher across both retrieval modes.

## Entry Structure That Works

### First Non-Heading Line Is the Summary
The first line after the main `#` heading acts as the document summary in most indexers. Make it a complete, specific sentence that captures the entry's core finding. Vague openers like "This document covers..." destroy retrieval precision.

**Good**: `How to structure markdown knowledge entries to maximize retrieval accuracy for LLM agents.`
**Bad**: `This entry is about knowledge management.`

### Headings as Retrieval Anchors
Heading-aware chunkers (e.g., `MarkdownHeaderTextSplitter`) split at header boundaries and propagate parent context into child chunks. This means:
- Use headings to label conceptually distinct sub-topics, not just for visual organization
- Avoid single-sentence heading sections — the heading overhead outweighs the content
- `##` sections are retrieval units; design them to be self-contained and answerable

### Frontmatter Density
Frontmatter is indexed as structured metadata. Key recommendations:
- **title**: Specific noun phrase, not a category label. `"Markdown Indexing for Agent Retrieval"` > `"Knowledge Management"`
- **tags**: Use for cross-cutting concepts not captured in the title. 3–6 tags; prefer existing vocabulary
- **category**: Coarse grouping only — retrieval systems use it for filter, not ranking
- Keep frontmatter lean; noise fields (non-queryable metadata) increase irrelevant matches

## Chunking Strategies for Markdown

| Strategy | When to Use | Chunk Size |
|---|---|---|
| Structure-aware (header-split) | Documents with clear `##` sections | Varies by section |
| Fixed-size | Uniform dense content, no headers | 256–512 tokens |
| Hierarchical | Nested information (docs, specs) | Summary + detail layers |

**Key finding**: For well-structured markdown with clear `##` sections, header-split chunking outperforms fixed-size chunking. Fixed 200-word chunks can match semantic chunking on simple queries but degrade on multi-hop questions.

## Metadata Preservation
When chunking, preserve parent-header context in each chunk's metadata:
```
chunk.metadata = {
  "H1": "Markdown Indexing Strategies",
  "H2": "Chunking Strategies for Markdown",
  "source": "ghq-core/markdown-indexing-for-agent-retrieval.md"
}
```
This allows the retriever to reconstruct document hierarchy and re-rank chunks by position.

## Hybrid Retrieval (BM25 + Vector)
Hybrid search combining lexical and semantic retrieval consistently outperforms either alone:
- **BM25** excels on exact terms, tag matches, titles
- **Vector search** excels on paraphrased queries, conceptual similarity
- Re-ranking via cross-encoder adds ~15–20% precision gain over first-pass retrieval

GHQ's `qmd query` uses this hybrid approach — entries should be authored to work in both modes: exact keywords in the title/first-line summary, conceptual language in the body.

## Anti-Patterns

- **Omnibus entries**: One entry covering 5 related topics. Split into focused entries; each becomes a sharper retrieval target.
- **Generic titles**: `"Best Practices"` or `"Notes"` match nothing specifically.
- **Buried lede**: Key claim in the 4th paragraph. Retrieval shows only the first chunk; the best content must come first.
- **Noise frontmatter**: Extra fields like `author`, `version`, `draft` that aren't queried just add tokens.

## Optimal Entry Length for Retrieval

From empirical testing (see `chunk-size-retrieval-precision-empirical.md`): 300–600 words per entry maximizes both recall (enough content for embedding) and precision (focused enough to avoid irrelevant matches). Entries over 1,000 words should be split at natural `##` boundaries.
