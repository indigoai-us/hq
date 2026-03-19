---
title: "Agent Reasoning Patterns: ReAct, Plan-and-Execute, Reflexion, and Beyond"
category: agent-architectures
tags: ["reasoning-patterns", "react", "plan-and-execute", "reflexion", "tree-of-thought", "cognitive-architecture"]
source: blueprint
confidence: 0.5
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

The "inner loop" of an autonomous agent — how it reasons about what to do next — is the most consequential architectural decision. Several patterns have emerged, each with different tradeoffs.

## ReAct (Reason + Act)

The dominant pattern as of 2025-2026. The agent interleaves reasoning traces with tool actions in a loop: Think → Act → Observe → Think → ... This grounds reasoning in real observations rather than pure chain-of-thought. Most production coding agents (Claude Code, Cursor, Copilot) use variants of ReAct, though they may not call it that.

## Plan-and-Execute

The agent first generates a complete plan, then executes steps sequentially. Better for tasks where the full scope is knowable upfront (migrations, refactors). Weaker when the environment is dynamic or discoveries change the plan. LangGraph's "plan-and-execute" template is the canonical implementation.

## Reflexion

After completing a task (or failing), the agent reflects on what went wrong and retries with that self-feedback. This is essentially a meta-loop around ReAct. Ralph loops use a version of this — the evaluator's feedback drives the next iteration.

## Tree-of-Thought

The agent explores multiple reasoning paths in parallel, evaluating and pruning branches. Expensive in token cost but powerful for tasks with ambiguous solutions. Rarely used in production coding agents due to cost, but promising for planning phases.

## Emerging: Hybrid Architectures

The trend is toward composing these patterns rather than choosing one. A planner agent might use tree-of-thought to generate a plan, hand off to ReAct workers for execution, and use reflexion for retry logic. The "ultimate" agent likely isn't one pattern — it's an orchestration of patterns matched to sub-task characteristics.
