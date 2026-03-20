---
title: "Context Window Management for Long-Running Agents"
category: agent-architectures
tags: ["context-management", "token-optimization", "compression", "long-running-agents", "agent-loop", "checkpointing", "multi-session"]
source: "https://bytebridge.medium.com/ai-agents-context-management-breakthroughs-and-long-running-task-execution-d5cee32aeaa4, https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents, https://platform.claude.com/docs/en/build-with-claude/compaction, https://fast.io/resources/ai-agent-state-checkpointing/, https://learn.microsoft.com/en-us/agent-framework/tutorials/workflows/checkpointing-and-resuming, https://aws.amazon.com/blogs/database/build-durable-ai-agents-with-langgraph-and-amazon-dynamodb/"
confidence: 0.85
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T18:00:00Z
---

The context window is the fundamental constraint on autonomous agents. A coding agent running for minutes or hours will exceed any context limit. How the agent manages this determines whether it can sustain coherent long-running work.

## The Problem

An agent that reads files, runs commands, and iterates accumulates context fast. A 200K token window sounds large but fills quickly when each tool call returns kilobytes of output. Once full, the agent either fails or must compress — and lossy compression means lost state.

Context window limits arise from transformer architecture: self-attention scales quadratically with sequence length, KV cache grows linearly with tokens. Even with expanding windows (Gemini 2.5 Pro at 1M tokens), the constraint remains real for multi-hour tasks.

## Core Strategies

### 1. Summarization / Compaction

Periodically compress earlier conversation turns into summaries. Two forms:

- **Rolling summary**: Summarize oldest N turns as context fills. Risk: important details lost.
- **Full compaction**: Replace entire history with a single high-fidelity summary. Reinitiate a new context window with the summary — agent continues with minimal performance degradation.

**Claude Code specifics**: Auto-compaction triggers at ~98% token usage (preventing `prompt_too_long` errors). Manual `/compact` works at any level. CLAUDE.md can specify what to preserve: `"When compacting, always preserve the full list of modified files and test commands"`.

### 2. External State / Filesystem Checkpointing

Write plans, progress, and intermediate results to files rather than holding them in context. The agent reads back what it needs.

Key pattern: **Write to temp file, then rename** — ensures atomic writes. Flag actions with booleans (`email_sent: true`) to prevent replay on resume.

Frameworks:
- **LangGraph**: `PostgresSaver` / `DynamoDBSaver` — checkpoints graph state at each super-step, allows resume from last successful node (not full replay)
- **Microsoft Agent Framework**: Durable task extension — checkpoints workflow state in configured durable store
- **Filesystem pattern**: Agent persists intermediate results to files, creating durable checkpoints. GHQ's PRD + todo-file approach exemplifies this.

Benefit: Checkpointing can cut wasted processing by 60%+ on multi-step workflows by resuming from the last successful step.

### 3. Hierarchical Delegation / Subagents

Break work into sub-tasks and delegate to fresh agent instances (subprocesses) with clean context. The orchestrator maintains only high-level state.

Each subagent runs with its own context window and execution loop. The orchestrator passes minimal handoff context. Claude Code explicitly documents this as a context management strategy alongside scratchpads and compaction.

**Git-Context-Controller**: Formalizes agent memory as a versioned hierarchy analogous to Git — memory manipulated through `COMMIT`, `BRANCH`, `MERGE`, and `CONTEXT` operations. Explicit hand-off across sessions. State-of-the-art results on SWE-bench.

### 4. Selective Retrieval (RAG)

Instead of keeping all context, use search to pull in relevant context on demand. Only inject the most relevant snippets for the current step.

Context editing + external memory can reduce token consumption by 84% while maintaining coherence over 100+ turns. GHQ's `qmd query` is an example — knowledge is searchable, not pre-loaded.

### 5. Hierarchical Memory Architecture

Maintain multiple context stores with different characteristics:
- **Short-term**: Recent conversation turns verbatim (highest budget allocation)
- **Medium-term**: Compressed summaries of recent sessions
- **Long-term**: Key facts and relationships extracted from historical interactions

**CAIM framework**: Memory Controller selects between short/long-term; semantically and temporally filtered retrieval; Post-Thinking module for inductive memory consolidation.

## Multi-Session Coherence

The hard problem: maintaining coherence *across* separate process invocations, not just within one.

Key techniques:
- **Handoff documents**: Structured state written at session end, read at session start. PRD + progress file is the simplest form.
- **Durable execution**: Log every action; on restart, replay log to restore state without re-executing side-effected steps.
- **Session summaries**: Before context fills, agent writes a structured summary of work done, decisions made, open questions, next steps.

Current frontier: 30-hour autonomous sessions are demo-able; 4-hour tasks are at the edge of reliable production use (2025).

## What to Keep vs. Discard

When compressing, agents must prioritize:
1. Task goals and constraints (never discard)
2. Decisions already made and their rationale
3. Current working state (open files, pending steps)
4. Error history (what was tried and failed)
5. Raw tool output from old steps (lowest priority — discard first)

CLAUDE.md-style instructions can guide compaction: explicitly name what must survive summarization.

## Failure Modes

- **Silent context loss**: Compaction drops a decision; agent re-decides differently, causing inconsistency
- **Replay side effects**: Resuming re-executes actions that already had side effects (emails sent twice, files committed twice) — mitigate with action flags
- **Handoff document staleness**: Handoff file is outdated; agent acts on stale state — mitigate with timestamps and explicit "last verified" markers
