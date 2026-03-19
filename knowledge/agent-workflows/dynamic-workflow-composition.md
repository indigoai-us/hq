---
title: "Dynamic Workflow Composition in Autonomous Agents"
category: agent-workflows
tags: ["planning", "tool-use", "agent-architecture", "reasoning-patterns", "coordination"]
source: "https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-patterns/routing-dynamic-dispatch-patterns.html, https://arxiv.org/html/2511.10037v1, https://arxiv.org/html/2503.09572v3, https://atoms.dev/insights/tool-router-agents-a-comprehensive-review-of-architecture-applications-challenges-and-future-trends/793ce8e0a75d486da55520aa2a5fdf30, https://arxiv.org/pdf/2410.10762"
confidence: 0.85
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

Patterns for agents that select and chain tools/skills at runtime based on the goal, rather than following predefined sequences.

## Core Tension: Static vs Dynamic

| Approach | Static Workflows | Dynamic Composition |
|----------|-----------------|---------------------|
| Definition | Predefined sequence of steps | Agent selects/chains tools at runtime |
| Flexibility | Low — fails on unexpected inputs | High — adapts to novel goals |
| Predictability | High — easy to test/debug | Low — harder to reason about |
| Best for | Narrow, repetitive tasks | Open-ended, complex goals |

## Primary Patterns

### 1. Planner-Executor (Two-Model Split)

A **Planner** model generates a high-level structured plan; one or more **Executor** models carry it out.

- Planner sees the full goal, produces a DAG or ordered task list
- Executors receive isolated subtasks and choose tools locally
- Plan can be revised mid-execution if an executor reports failure
- Research shows sophisticated planning > raw model capability for long-horizon tasks

**Variants:**
- **Global DAG planning**: Planner emits a Directed Acyclic Graph — nodes are subtasks, edges are dependencies. Enables parallel execution of independent branches.
- **Plan-and-Act**: Explicit Planner + Executor models with structured handoff. Achieves 57.58% on WebArena-Lite (SOTA as of early 2025).

### 2. ReAct (Reason + Act)

Agent interleaves reasoning steps with tool calls in a single loop:
```
Thought → Action (tool call) → Observation → Thought → ...
```

- Simple and widely supported
- Prone to **local optimization traps** — each step greedy, no global view
- Better suited to shallow tasks; struggles with long-horizon goals

### 3. Tool Router / Dynamic Dispatch

A routing layer translates user intent → tool selection without predefined schemas:

- LLM interprets natural language input semantically
- Selects from a registry of available tools/agents
- Dispatches to the right specialist based on capability descriptors
- AWS calls this "intent-based dispatching" — more flexible than event-driven routing

**Skill Registry Pattern:**
- Agents register with descriptors: capabilities, tags, embeddings
- Orchestrator resolves the right agent at runtime via similarity search
- Enables plug-and-play extensibility — add new skills without rewiring

### 4. Hierarchical Coordinator

Manager agent decomposes goal → subgoals → assigns to specialist agents:

```
Goal
├── Subgoal A → Specialist Agent 1
├── Subgoal B → Specialist Agent 2
└── Subgoal C → Specialist Agent 3 (which further decomposes...)
```

- Each level independently selects its own tools
- Coordinator tracks a **task ledger** with goals, subgoals, dependencies
- Workers dynamically created and assigned appropriate tool subsets

### 5. Graph-Based Workflow Synthesis (Programmatic)

Agent generates an executable workflow graph from natural language intent:

- Output: DAG of operators (nodes) with typed edges (data flow)
- Runtime executes the graph, passing outputs between nodes
- Frameworks: LangGraph, AFlow, EvoFlow, DataFlow-Agent
- LangGraph passes only state deltas between nodes — minimal token overhead

**LLM-to-DAG flow:**
```
User goal → LLM planner → DAG spec → code generation → execution engine
```

### 6. MIRROR (Multi-Level Reflection)

Four-agent pipeline with intra- and inter-agent reflection:

1. **Planner Agent** — decomposes task into subtasks
2. **Tool Agent** — selects tools + parameters per subtask
3. **Executor** — runs the tools
4. **Answer Agent** — synthesizes final output

Each agent reflects on its own output before passing downstream. Dual-memory architecture (short-term + long-term) facilitates inter-agent learning.

## Key Design Decisions

### When to Replan?

| Trigger | Action |
|---------|--------|
| Executor returns error | Retry with alternate tool, or escalate to Planner |
| Unexpected observation changes goal | Full replan |
| Missing prerequisite discovered | Insert new subtask, reorder DAG |
| Time/token budget exceeded | Compress remaining plan |

### Tool Selection Strategies

1. **Semantic routing**: Embed tool descriptions + query; match by cosine similarity
2. **LLM dispatch**: Give the LLM a tool manifest; let it choose via reasoning
3. **Rule-based gating**: Restrict tool access based on context/permissions
4. **Learned routing**: Train a classifier on successful tool selection traces

### Avoiding Local Optima

ReAct-style agents get trapped because each step optimizes locally. Mitigations:

- Emit a **global plan first**, then execute (Plan-and-Execute)
- Use **backtracking**: allow rollback to an earlier decision point
- **Beam search over plans**: evaluate multiple plan candidates before committing

## Practical Tradeoffs

| Pattern | Latency | Token Cost | Reliability | Flexibility |
|---------|---------|------------|-------------|-------------|
| Static workflow | Very low | Low | High | None |
| ReAct | Low | Medium | Medium | Medium |
| Planner-Executor | Medium | High | High | High |
| Hierarchical | High | Very high | Medium | Very high |
| Graph synthesis | Medium | High | Medium | Very high |

## Relevance to GHQ

GHQ's `/research-loop` and `/research` skills are static sequences. Dynamic composition would let GHQ:
- Receive an open-ended goal ("prepare for this meeting") and decompose it autonomously
- Route to whichever skills are relevant (qmd search, calendar MCP, Slack MCP, GitHub)
- Replan if a skill fails or returns unexpected results

The **Planner-Executor** pattern with a skill registry is the most practical upgrade path — add a planner layer above existing skills without rewriting them.
