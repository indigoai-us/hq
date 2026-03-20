---
title: "Multi-Agent Orchestration Patterns"
category: multi-agent-systems
tags: ["multi-agent", "orchestration", "delegation", "agent-communication", "coordination", "benchmarks", "comparison"]
source: "blueprint, https://arxiv.org/abs/2503.01935, https://arxiv.org/html/2505.22467, https://arxiv.org/html/2502.02533v1"
confidence: 0.85
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T20:00:00Z
---

A single agent hits limits — context window, specialization, parallelism. Multi-agent systems distribute work across specialized agents coordinated by an orchestrator. This is the path to "ultimate" agent capability.

## Core Patterns

**Hub-and-spoke / Star (Orchestrator)**: A central agent delegates sub-tasks to specialized workers and aggregates results. LangGraph's supervisor pattern and GHQ's `ask-claude.sh` subprocess model follow this approach. Simple, debuggable, but the orchestrator is a bottleneck. Best for centralized tool routing and control.

**Pipeline / Chain (Sequential handoff)**: Agents pass work through a chain — Planner → Implementer → Tester → Reviewer. Each agent has a focused role. CrewAI's "sequential process" implements this. Good for sequential workflows (software dev, document processing). Brittle: early errors propagate unchecked downstream.

**Tree (Hierarchical)**: Nested orchestrators — a top-level planner delegates to mid-level coordinators who manage worker agents. Suits hierarchical planning and exploration (Minecraft, ALFWorld). More resilient than chains via cross-verification. Adds latency and coordination overhead. MultiAgentBench finds it performs **worst** overall — high token consumption and the lowest coordination scores.

**Graph / Mesh (Swarm/Peer-to-peer)**: Agents communicate directly without a central coordinator. OpenAI Swarm and AutoGen group chat use variants. Maximizes information sharing for high-bandwidth ideation and research. Severe drawback: redundant communication can consume "tens of times more" tokens than chains. MultiAgentBench finds graph topology performs **best** in research scenarios.

## Topology Performance by Task Type

From **MultiAgentBench** (arXiv 2503.01935, ACL 2025) and topology structure research (arXiv 2505.22467):

| Topology | Best For | Avoid When | MultiAgentBench Rank |
|----------|----------|------------|----------------------|
| **Graph** | Research, ideation, consensus tasks | Token budget is tight | 1st (best) |
| **Star** | Centralized tool routing, orchestration | High parallelism needed | 2nd |
| **Chain** | Sequential workflows, dependency chains | Steps need to backtrack | 3rd |
| **Tree** | Hierarchical planning, exploration | Speed matters | 4th (worst) |

Performance varies by up to **10%** across topologies for the same task. Topology is secondary to model capability — strong base models outperform weak models in all topologies.

### MultiAgentBench Domain Scores (task score range across models)

| Domain | Score Range | Notes |
|--------|-------------|-------|
| Research | 70.2–84.1% | Graph topology excels |
| Coding | 55.5–65.1% | Executor + parallel aggregate best |
| Database | 28.5–53.0% | Model-dependent |
| Minecraft | 0.2–33.6% | Hardest; tree topology suited but all struggle |

**Cognitive planning** (structured pre-task reasoning before agent dispatch) improves milestone achievement rates by **3%** across topology types.

### Task-Topology Matching Heuristics

- Sequential workflows → **Chain** (MetaGPT, step-by-step refinement)
- Hierarchical exploration → **Tree** (planning + subtask delegation)
- Centralized tool routing → **Star** (single orchestrator dispatches tools)
- High-bandwidth ideation / research → **Graph** (consensus, peer review)
- Reasoning/math → Parallel aggregate (multiple independent agents, not debate)
- Multi-hop QA → Debate topologies (marginal ~3% gain on HotpotQA)

## Communication Mechanisms

- **Shared state**: Agents read/write to a common store (file system, database). Simple but prone to conflicts.
- **Message passing**: Agents send structured messages. A2A protocol standardizes this for cross-organization communication.
- **Artifact passing**: Agents produce artifacts (code, documents) that downstream agents consume. Natural for pipeline patterns.

## Key Challenge: Coordination Overhead

Multi-agent systems can spend more tokens coordinating than doing actual work. Graph/mesh topologies risk quadratic message explosion. The optimal architecture minimizes coordination cost — delegate only when the benefit of specialization or parallelism outweighs the overhead.

A useful design sequence: **optimize individual agent prompts first**, then select topology. Prompt quality determines which topologies subsequently perform well (arXiv 2502.02533).
