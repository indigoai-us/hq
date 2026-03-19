---
title: "Context Window Management for Long-Running Agents"
category: agent-architectures
tags: ["context-management", "token-optimization", "compression", "long-running-agents", "agent-loop"]
source: blueprint
confidence: 0.5
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

The context window is the fundamental constraint on autonomous agents. A coding agent running for minutes or hours will exceed any context limit. How the agent manages this determines whether it can sustain coherent long-running work.

## The Problem

An agent that reads files, runs commands, and iterates accumulates context fast. A 200K token window sounds large but fills quickly when each tool call returns kilobytes of output. Once full, the agent either fails or must compress — and lossy compression means lost state.

## Common Strategies

**Summarization**: Periodically compress earlier conversation turns into summaries. Claude Code does this automatically as context fills. Risk: important details lost in summarization.

**Externalized state**: Write plans, progress, and intermediate results to files rather than holding them in context. The agent reads back what it needs. This is why PRDs and todo files matter for Ralph loops.

**Hierarchical delegation**: Break work into sub-tasks and delegate to fresh agent instances (subprocesses) with clean context. The orchestrator maintains only high-level state.

**Selective retrieval**: Instead of keeping all context, use RAG or search to pull in relevant context on demand. GHQ's `qmd query` is an example of this pattern.

## Open Questions

How much context compression is acceptable before agent quality degrades? Is there a principled way to decide what to keep vs. discard? These questions don't have clear answers yet — likely varies by task type and model capability.
