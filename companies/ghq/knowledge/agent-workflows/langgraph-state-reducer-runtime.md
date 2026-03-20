---
title: "LangGraph Runtime: State Management, Reducers, and Graph Execution"
category: agent-workflows
tags: ["langgraph", "state-management", "agent-loop", "production-patterns", "agent-orchestration", "coordination"]
source: "https://docs.langchain.com/oss/python/langgraph/graph-api, https://dev.to/sreeni5018/leveraging-langgraphs-send-api-for-dynamic-and-parallel-workflow-execution-4pgd, https://deepwiki.com/langchain-ai/langgraph/4.1-checkpointing-architecture, https://aipractitioner.substack.com/p/scaling-langgraph-agents-parallelization, https://redis.io/blog/langgraph-redis-build-smarter-ai-agents-with-memory-persistence/"
confidence: 0.9
created_at: 2026-03-20T11:30:00Z
updated_at: 2026-03-20T11:30:00Z
---

LangGraph implements dynamic graph execution via a Pregel-inspired superstep model with typed, reducer-driven state channels.

## State Model

State is a typed data structure — typically a `TypedDict`, dataclass, or Pydantic model — that flows through the entire graph. Every node reads from and writes to this shared state object.

```python
from typing import Annotated, TypedDict
from langgraph.graph.message import add_messages

class State(TypedDict):
    messages: Annotated[list, add_messages]
    count: int
```

Each key in the TypedDict is a **channel**: a named slot in the state with optional merge semantics.

## Reducer Model

Reducers are functions that define how incoming updates merge into the current state value. They are declared inline using Python's `Annotated` type:

```python
class State(TypedDict):
    # Default: last-write-wins (no Annotated = replace)
    status: str

    # Append reducer: new items are added to the list
    history: Annotated[list, operator.add]

    # Custom reducer: merge dicts
    metadata: Annotated[dict, lambda old, new: {**old, **new}]
```

| Reducer Style | Behavior | Use Case |
|---------------|----------|----------|
| No annotation (default) | Last write wins | Single-writer fields |
| `operator.add` / `add_messages` | Append | Message history, logs |
| Custom lambda | Merge logic | Dict merging, deduplication |

In parallel execution (same superstep), reducers prevent data loss when multiple nodes write to the same field simultaneously.

## Pregel Superstep Execution

LangGraph's runtime is inspired by **Google's Pregel** bulk-synchronous parallel (BSP) model:

1. Each **superstep** = one iteration over all ready nodes
2. Nodes in the same superstep run **in parallel**
3. Nodes in different supersteps run **sequentially**
4. A node completes → sends messages along edges → recipient nodes become ready for the next superstep

```
Superstep 1: [Node A]
              ↓ (edge)
Superstep 2: [Node B, Node C]  ← parallel
              ↓         ↓
Superstep 3: [Node D]
```

This model enables both parallelism and deterministic ordering within a single graph run.

## Dynamic Routing Primitives

### Conditional Edges

Fixed edges always go to a target node. Conditional edges call a function at runtime to decide the next node:

```python
graph.add_conditional_edges("router", decide_next, {
    "search": "search_node",
    "answer": "answer_node",
    "END": END,
})
```

### Send API (Map-Reduce)

`Send` enables spawning multiple parallel node instances with distinct state slices — enabling map-reduce patterns where the number of parallel tasks is determined at runtime:

```python
from langgraph.types import Send

def fan_out(state):
    return [Send("worker", {"item": item}) for item in state["items"]]

graph.add_conditional_edges("coordinator", fan_out)
```

Each `Send` creates an independent state snapshot routed to the named node.

### Command Object (Runtime Routing)

Nodes can return a `Command` instead of a plain state dict, embedding routing instructions directly in the return value:

```python
from langgraph.types import Command

def my_node(state):
    return Command(goto="next_node", update={"result": "done"})
```

`Command` can also navigate to parent graphs when used inside subgraphs, enabling hierarchical routing.

## Subgraphs

Subgraphs compose independently compiled graphs as single nodes in a parent graph. Communication happens through shared state keys:

- **Shared key**: parent and child share a state field — updates propagate automatically
- **Private key**: child has internal state not visible to parent

This allows modular graph design where subgraphs can be developed and tested independently.

## Checkpointing Architecture

LangGraph saves a checkpoint after each superstep completes. This enables:

- **Fault tolerance**: restart from the last successful superstep on failure
- **Human-in-the-loop**: pause, inspect, and resume execution at any checkpoint
- **Time-travel**: replay or branch from any historical state snapshot
- **Multi-turn threads**: persist conversation state across separate interactions

### Checkpoint Backends

| Backend | Use Case |
|---------|----------|
| `MemorySaver` | Development / testing |
| `SqliteSaver` / `AsyncSqliteSaver` | Local workflows, experimentation |
| `PostgresSaver` | Production (relational) |
| `RedisSaver` / `AsyncRedisSaver` | Production (high-throughput, in-memory) |

Checkpoints are organized into **threads** — each thread tracks a separate execution context (e.g., separate conversation sessions).

## LangGraph 1.0 (October 2025)

LangGraph 1.0 stabilized four production runtime features:
1. Persistent checkpointing (thread-level)
2. Human-in-the-loop interrupts
3. Subgraph composition
4. Streaming node outputs

The 1.0 release added no breaking changes — it codified hard-won production patterns accumulated from earlier versions.
