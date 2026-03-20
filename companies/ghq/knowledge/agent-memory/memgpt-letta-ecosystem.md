---
title: "Agent Memory Implementations: MemGPT, Letta, Mem0, Zep, Cognee"
category: agent-memory
tags: ["memory-systems", "open-source", "production-patterns", "episodic-memory", "long-term-memory", "comparison"]
source: "https://www.letta.com/blog/agent-memory, https://arxiv.org/abs/2502.12110, https://dev.to/varun_pratapbhardwaj_b13/5-ai-agent-memory-systems-compared-mem0-zep-letta-supermemory-superlocalmemory-2026-benchmark-59p3, https://www.cognee.ai/blog/deep-dives/ai-memory-tools-evaluation"
confidence: 0.85
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

The agent memory tool ecosystem has matured into distinct frameworks, each with a different architectural bet on how to solve persistent memory beyond the context window.

## MemGPT / Letta (OS Paging Metaphor)

**MemGPT** (2023, arXiv:2310.08560) introduced the core idea: treat LLM memory like OS virtual memory. The agent has:
- **Core memory** (in-context, "RAM") — small, fast, always visible
- **Archival memory** (external, "disk") — large, searchable via function calls
- **Recall memory** — indexed conversation history

The agent uses function calls to page data between tiers, creating the illusion of unlimited memory within a fixed context window.

**Letta** is the production framework that grew from MemGPT (rebranded September 2024). It adds:
- Stateful agent persistence across sessions
- **Agent File (.af)** — open format for serializing agents with memory + behavior
- **Letta Filesystem** — structured ingestion from PDFs, transcripts, docs
- Native support for Claude 4.x's advanced memory tool capabilities

Letta is best for: agents that need deep personalization and learn about specific users over time.

## Mem0 (Memory Layer as Service)

Mem0 sits between the application and the LLM — it intercepts interactions, extracts "memories" (user preferences, facts, decisions), stores them in a vector store, and retrieves relevant ones at query time.

- Short-term: conversation context in chat history
- Long-term: extracted facts in local or remote vector store
- API-first design, easy to retrofit onto existing agents
- Batch operations for high-throughput ingestion; 91% lower p95 latency vs full-context

Best for: personalization across many users, low-integration-friction production deployments.

## Zep (Episodic + Temporal Graph)

Zep structures interactions as episodic sequences with temporal ordering — closer to how humans remember conversations than flat log approaches. It uses **Graphiti** (its underlying temporal knowledge graph) to maintain:
- Session-based episodic memory
- Automatic history summarization to fit context windows
- Temporal relationships between facts (when things changed)

Benchmarks: 75.14% on standard evals, ~10% relative improvement over Mem0's best config.

Best for: low-latency production deployments, conversation-heavy applications.

## Cognee (Knowledge Graph + Semantic Reasoning)

Cognee combines vector search with graph databases to build a unified memory layer:
- Ingests raw data → builds knowledge graph with entity relationships
- Enables semantic search AND relationship-based retrieval
- Strong on multi-hop reasoning and complex entity relationships

Benchmarks: 0.93 correctness on HotPotQA (vs Mem0's lower score in the same eval).

Best for: enterprise knowledge systems, legal research, scientific analysis requiring complex reasoning.

## Research Frontiers (2025-2026)

| System | Key idea | Paper |
|---|---|---|
| **A-MEM** | Zettelkasten-style interconnected notes with dynamic linking | arXiv:2502.12110 |
| **E-mem** | Episodic context reconstruction with heterogeneous agent hierarchy | arXiv:2601.21714 |
| **CraniMem** | Cranial-inspired dual-store with bounded growth + active forgetting | arXiv:2603.15642 |
| **ACT-R** | Human cognitive model (activation decay, spreading activation) applied to agents | ACM HAI 2025 |

### Episodic-to-Semantic Consolidation

The most theoretically interesting pattern: episodic traces (what happened) are background-consolidated into semantic knowledge (how things work). An agent solves a novel problem → interaction trace stored in episodic memory → background process abstracts the successful pattern → writes generalized skill/rule to semantic memory. Avoids unbounded growth while building expertise.

## Choosing a Framework

| Need | Recommendation |
|---|---|
| Deep per-user personalization, stateful agent | Letta |
| Quick retrofit onto existing LLM app | Mem0 |
| Conversation memory with temporal reasoning | Zep |
| Complex knowledge graph, multi-hop queries | Cognee |
| Research / custom architecture | A-MEM, E-mem, CraniMem papers |
