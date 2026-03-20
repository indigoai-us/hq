---
title: "Semantic Routing vs LLM Dispatch: Production Tradeoffs"
category: agent-workflows
tags: ["production-patterns", "comparison", "decision-making", "agent-architecture", "tool-use"]
source: "https://aws.amazon.com/blogs/machine-learning/multi-llm-routing-strategies-for-generative-ai-applications-on-aws/, https://gist.github.com/mkbctrl/a35764e99fe0c8e8c00b2358f55cd7fa, https://arxiv.org/html/2511.01854v1, https://www.deepchecks.com/glossary/semantic-router/, https://github.com/aurelio-labs/semantic-router"
confidence: 0.88
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

Two primary strategies for runtime tool selection: embedding similarity (fast, cheap) vs LLM reasoning (flexible, costly).

## The Two Approaches

**Semantic Routing** — embed the user query and each tool description; pick the highest-cosine-similarity tool without calling an LLM for the routing decision.

**LLM Dispatch** — give the LLM a manifest of available tools and let it reason about which one(s) to call. The LLM chooses via its own understanding of intent.

## Head-to-Head Comparison

| Dimension | Semantic Routing | LLM Dispatch |
|-----------|-----------------|--------------|
| Latency | ~100ms (vector lookup) | ~50-100ms added per routing hop |
| Cost | Embedding model only | Full LLM inference per decision |
| Accuracy (in-distribution) | 92–96% after tuning | Higher on ambiguous/complex queries |
| Accuracy (out-of-distribution) | Degrades without coverage | Handles novel queries gracefully |
| Extensibility | Requires re-embedding on new tools | Add description; no retraining needed |
| Failure mode | Coverage gaps, false positives on short names | Over-reasoning, hallucinated tool names |
| Debuggability | High — deterministic similarity scores | Low — black-box reasoning |

Semantic router reduced P99 routing latency from ~5000ms to ~100ms in reported benchmarks.

## Failure Modes in Detail

### Semantic Routing Failures

1. **Coverage gaps**: If no reference prompt closely matches the user query, the router falls through to a default or mis-routes. Adequate coverage of all task categories in the reference set is the #1 success factor.
2. **Short/generic tool names**: High cosine similarity on short titles can produce false positives — a query about "monitoring" may match "metrics tool" and "alerting tool" equally.
3. **Cold start**: New query patterns with no close embeddings may route incorrectly until new reference prompts are added.
4. **Distribution drift**: As user behavior evolves, the embedding space may drift from the reference prompts over time without explicit maintenance.

### LLM Dispatch Failures

1. **Hallucinated tool names**: LLM may reference a tool that doesn't exist or mis-spell a valid tool name.
2. **Over-reasoning**: Simple queries may trigger verbose CoT that increases latency and cost without accuracy gains.
3. **Inconsistency**: The same query may route differently across runs — nondeterministic by design.
4. **Scalability ceiling**: As the tool catalog grows, the manifest grows, consuming context and degrading routing quality.

## When to Use Each

**Prefer semantic routing when:**
- Tool catalog is stable and well-covered by reference prompts
- Latency is critical (real-time UX, high-throughput pipelines)
- The routing decision is coarse-grained (pick a domain, not a specific function)
- Cost per request matters at scale

**Prefer LLM dispatch when:**
- Tool catalog evolves frequently — new tools added without re-embedding
- Queries are complex, ambiguous, or require multi-step reasoning to resolve intent
- You need the routing decision to consider conversation history or contextual state
- You want to route to multiple tools simultaneously (LLM can call N tools in one pass)

## Production Pattern: Two-Stage Funnel

The mature enterprise approach combines both:

```
Query
  → Semantic router (domain / coarse route, ~100ms)
      → LLM dispatch (fine-grained tool selection within domain)
          → Tool execution
```

1. **Stage 1** (semantic): Quickly filter the full tool catalog to a relevant subset (e.g., "this is a data query, not a code task").
2. **Stage 2** (LLM): Within the smaller subset, let the LLM pick the exact tool and parameters.

This funnel reduces the LLM's manifest size (improving accuracy) while preserving semantic flexibility for novel queries. Reported gains: +10.2% accuracy, −47% latency, −48% token usage vs pure LLM dispatch.

## Relevance to GHQ

GHQ's skill routing currently uses LLM dispatch (Claude reads all skill descriptions and picks). As the skill catalog grows, consider a two-stage funnel:
1. Semantic pre-filter to narrow to 3-5 candidate skills
2. LLM selects the exact skill within that subset

This would reduce token overhead and improve routing consistency as the skill registry scales.
