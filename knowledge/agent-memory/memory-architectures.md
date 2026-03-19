---
title: "Memory Architectures for Autonomous Agents"
category: agent-memory
tags: ["memory-systems", "rag", "vector-stores", "episodic-memory", "semantic-memory", "long-term-memory"]
source: blueprint
confidence: 0.5
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

An agent without memory is stateless — it cannot learn from past sessions, recall user preferences, or build expertise over time. Memory is what transforms a chat assistant into a persistent collaborator.

## Memory Types (Cognitive Science Analogy)

**Working memory**: The context window. Limited, fast, volatile. Everything the agent can "see" right now.

**Episodic memory**: Records of specific past events — "last time I deployed this service, the health check failed on port 8080." Useful for avoiding repeated mistakes.

**Semantic memory**: General knowledge — facts, concepts, relationships. A knowledge base like GHQ's `knowledge/` directory is semantic memory.

**Procedural memory**: How to do things — skills, workflows, learned procedures. Claude Code's SKILL.md files are a form of procedural memory.

## Implementation Patterns

**RAG (Retrieval-Augmented Generation)**: The most common pattern. Store knowledge in a vector database, retrieve relevant chunks at query time, inject into context. GHQ uses this via qmd.

**Structured memory files**: Markdown or JSON files that the agent reads/writes directly. Simpler than RAG, works well when the corpus is small. Claude Code's auto-memory system uses this.

**Conversation memory**: Persisting conversation history across sessions. Risk of context pollution — old conversations may not be relevant.

**Hybrid approaches**: Combine structured files for high-signal knowledge with vector search for broader recall. GHQ's architecture (structured markdown + BM25 + vector search) is an example.

## The Memory-Context Tradeoff

More memory retrieved means less context available for reasoning. The art is retrieving precisely the right memories — not too few (agent lacks context), not too many (agent drowns in irrelevant details). This is an unsolved problem in the field.
