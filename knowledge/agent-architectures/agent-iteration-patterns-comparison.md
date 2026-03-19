---
title: "Agent Iteration Patterns: Ralph vs ReAct vs Plan-and-Execute vs Tree-of-Thought vs Reflexion"
category: agent-architectures
tags: ["agent-loop", "comparison", "planning", "autonomous-coding", "reasoning-patterns"]
source: "https://www.alibabacloud.com/blog/from-react-to-ralph-loop-a-continuous-iteration-paradigm-for-ai-agents_602799, https://dev.to/jamesli/react-vs-plan-and-execute-a-practical-comparison-of-llm-agent-patterns-4gh9, https://arxiv.org/abs/2303.11366, https://www.wollenlabs.com/blog-posts/navigating-modern-llm-agent-architectures-multi-agents-plan-and-execute-rewoo-tree-of-thoughts-and-react, https://arxiv.org/pdf/2310.04406, https://blog.langchain.com/reflection-agents/"
confidence: 0.85
created_at: "2026-03-20T00:00:00Z"
updated_at: "2026-03-20T00:00:00Z"
---

Taxonomy of agent iteration patterns and how they compare for long-horizon coding tasks.

## The Five Patterns

### ReAct (Reasoning + Acting)
The baseline interleaved pattern: **Thought → Action → Observation** repeated until done.

- Each step reasons from scratch about what to do next
- Adaptive — next action depends entirely on the previous observation
- Single linear thread of execution
- Best for: dynamic tool-use tasks where the path isn't known upfront
- Weakness: no global planning; can get stuck in local optima; O(n) LLM calls

### Plan-and-Execute
**Plan once, then execute each step** with a smaller executor model.

- Planner generates a full step list before any action is taken
- Each step is handed to an executor (often cheaper model)
- Replanning triggered by failure, not by default
- Best for: structured, multi-module coding tasks where a reasonable plan exists upfront
- Weakness: brittle if early assumptions are wrong; replanning adds latency and complexity

### Tree-of-Thought (ToT)
**Branch, evaluate, backtrack** — search over the space of reasoning steps.

- Maintains multiple partial solutions simultaneously (BFS or DFS)
- Evaluator scores branches; agent prunes or expands
- Can recover from dead ends; more thorough than linear search
- Best for: algorithmic problems, complex debugging where exploration pays off
- Weakness: computationally expensive; multiplies LLM calls; overkill for most coding tasks

### Reflexion
**Act, reflect verbally on outcome, store reflection, retry** — verbal reinforcement learning.

- Three components: Actor (generates actions), Evaluator (scores output), Self-Reflection (verbal critique stored in episodic memory)
- Reflections are prepended on the next trial — the agent learns from its own failures without weight updates
- Achieves SOTA on coding benchmarks (LeetcodeHardGym) with iterative retries
- Best for: coding problems with test feedback, where errors are diagnosable
- Weakness: requires multiple trial rounds; reflections can compound errors if evaluator is weak

### Ralph Loop
**Run agent to completion, check for "Completion Promise" in output, restart with fresh context if not found.**

- External harness (not an in-context pattern) — a shell script or orchestrator wraps the agent
- Each round is a **fresh context window**: agent reads project state from disk, not from conversation history
- State lives on the file system, not in the LLM's memory — prevents context rot
- Stop hooks intercept agent exit signals; the loop continues until the task is verified complete
- Best for: long-horizon autonomous coding tasks (PRD → working code); multi-hour runs
- Weakness: relies on well-structured disk state; harder to debug mid-loop; session isolation means no cross-round learning without explicit logging

---

## Comparison Table

| Pattern | Planning | Adaptation | Context strategy | Cost | Best coding fit |
|---------|----------|------------|-----------------|------|-----------------|
| **ReAct** | Implicit (per-step CoT) | High — reacts each step | Single growing context | Medium | Dynamic debugging, tool-heavy tasks |
| **Plan-and-Execute** | Explicit upfront | Low (replanning needed) | Split: planner + executor | Lower executor cost | Multi-module feature build |
| **Tree-of-Thought** | Exploratory search | High (backtracking) | Multiple parallel branches | High | Hard algorithmic problems |
| **Reflexion** | None (trial-based) | Via stored reflections | Multi-trial episodic memory | High (multi-trial) | Test-driven iteration, LeetCode-style |
| **Ralph Loop** | External (per-round) | High (fresh state each round) | Reset per iteration — reads disk | Varies | Long-horizon PRD execution |

---

## Relationship to Ralph Loop

Ralph is **orthogonal** to the other four patterns, not a replacement:

- ReAct, Plan-and-Execute, ToT, and Reflexion describe **intra-session reasoning** — what happens inside a single agent context window
- Ralph Loop describes **inter-session orchestration** — how to keep an agent working across multiple sessions until a goal is achieved

In practice, a Ralph loop **wraps** a ReAct or Plan-and-Execute agent. The inner agent uses one of these patterns for each session; the outer Ralph harness handles persistence, completion detection, and context refresh between sessions.

```
Ralph harness (outer loop)
  └─ Each round: ReAct or Plan-and-Execute agent
       ├─ Reads project state from disk
       ├─ Acts until natural stopping point
       └─ Writes results to disk
  └─ Check: did output contain "Completion Promise"?
       ├─ Yes → done
       └─ No → restart with fresh context
```

---

## Choosing a Pattern for Coding Tasks

| Situation | Recommended pattern |
|-----------|---------------------|
| Short task, clear goal, < 1 context window | **ReAct** |
| Multi-step task with known structure | **Plan-and-Execute** |
| Algorithmic/math problem, need to explore | **Tree-of-Thought** |
| Test-driven problem with runnable tests | **Reflexion** |
| Long PRD, hours of autonomous work needed | **Ralph Loop** (wrapping ReAct or P&E) |
| All of the above in production | **Ralph + Reflexion** (fresh context + verbal learning across rounds) |
