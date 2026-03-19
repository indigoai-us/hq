---
title: "Multi-Agent Orchestration Patterns"
category: multi-agent-systems
tags: ["multi-agent", "orchestration", "delegation", "agent-communication", "coordination"]
source: blueprint
confidence: 0.5
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

A single agent hits limits — context window, specialization, parallelism. Multi-agent systems distribute work across specialized agents coordinated by an orchestrator. This is the path to "ultimate" agent capability.

## Core Patterns

**Hub-and-spoke (Orchestrator)**: A central agent delegates sub-tasks to specialized workers and aggregates results. LangGraph's supervisor pattern and GHQ's `ask-claude.sh` subprocess model follow this approach. Simple, debuggable, but the orchestrator is a bottleneck.

**Pipeline (Sequential handoff)**: Agents pass work through a chain — Planner → Implementer → Tester → Reviewer. Each agent has a focused role. CrewAI's "sequential process" implements this. Good for well-defined workflows, brittle when steps need to backtrack.

**Swarm (Peer-to-peer)**: Agents communicate directly without a central coordinator. OpenAI's Swarm and AutoGen's group chat use variants of this. More resilient but harder to debug and reason about.

**Hierarchical**: Nested orchestrators — a top-level planner delegates to mid-level coordinators who manage worker agents. Scales to complex tasks but adds latency and coordination overhead.

## Communication Mechanisms

- **Shared state**: Agents read/write to a common store (file system, database). Simple but prone to conflicts.
- **Message passing**: Agents send structured messages. A2A protocol standardizes this for cross-organization communication.
- **Artifact passing**: Agents produce artifacts (code, documents) that downstream agents consume. Natural for pipeline patterns.

## Key Challenge: Coordination Overhead

Multi-agent systems can spend more tokens coordinating than doing actual work. The "ultimate" agent architecture needs to minimize coordination cost — delegate only when the benefit of specialization or parallelism outweighs the overhead.
