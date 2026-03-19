---
title: "Agent Confidence Calibration: Act-or-Ask Patterns"
category: agent-autonomy
tags: ["decision-making", "uncertainty", "production-patterns", "autonomy", "human-in-the-loop"]
source: "https://arxiv.org/html/2601.15778, https://arxiv.org/html/2601.15703, https://arxiv.org/html/2602.05073v2, https://uala-agent.github.io/, https://openreview.net/forum?id=dc8ebScygC"
confidence: 0.85
created_at: 2026-03-20T12:00:00Z
updated_at: 2026-03-20T12:00:00Z
---

Confidence calibration determines when an agent should act autonomously vs. pause to ask — the core lever for balancing speed and reliability.

## The Core Problem

Agents must make a binary decision at each step: **execute** (commit to the next action) or **clarify** (ask a human or gather more information). Getting this wrong in either direction is costly:
- Too aggressive: early wrong actions "poison" subsequent steps — an agent can arrive at high confidence in a completely incorrect trajectory.
- Too conservative: every action becomes a chatbot exchange, eliminating the value of autonomy.

## Uncertainty Taxonomy

Two distinct uncertainty types require different responses:

| Type | Definition | Resolution |
|------|-----------|------------|
| **Specification uncertainty** | What the user actually wants is ambiguous | Ask the user for clarification |
| **Model uncertainty** | The LLM is unsure about its own prediction | Gather more data (tool calls, search) |

Conflating these types leads to asking users questions they can't answer ("which tool should I call?") or calling tools when the real problem is an underspecified goal.

## Key Frameworks

### UALA — Uncertainty-Aware Language Agent

Uses uncertainty quantification (UQ) to orchestrate tool interactions in a ReAct-style loop. Instead of calling tools unconditionally, the agent computes a confidence score before each tool call and only invokes the tool if it falls below the confidence threshold.

**Result**: Significantly better performance than ReAct with substantially fewer tool calls and tokens — uncertainty acts as a natural efficiency filter.

### AUQ — Agentic Uncertainty Quantification

Two-component architecture:

- **System 1 — Uncertainty-Aware Memory (UAM)**: Implicitly propagates verbalized confidence and semantic explanations through the agent's memory. Prevents downstream steps from acting blindly on uncertain earlier outputs.
- **System 2 — Uncertainty-Aware Reflection (UAR)**: Monitors accumulated uncertainty and triggers deliberate inference-time resolution only when a threshold is exceeded. Balances efficient execution with deep deliberation.

The key insight: propagate uncertainty signals forward through the trajectory, don't just check confidence at the final output.

### SAGE-Agent — Structured Uncertainty for Clarification

Applies EVPI (Expected Value of Perfect Information) to select which clarification question yields the most disambiguation per exchange:

```
EVPI(question) = E[reward | answer received] - E[reward | current uncertainty]
```

**Results**: 7–39% higher task coverage on ambiguous tasks with 1.5–2.7× fewer clarification questions than prompting-based baselines.

## Decision Threshold Calibration

Calibration sets (held-out examples with known correct actions) can empirically set thresholds:

1. Run agent on calibration set at varying confidence thresholds
2. Measure precision/recall tradeoff for act-vs-ask decisions
3. Select threshold that maximizes task success rate subject to a human-interrupt budget

Uncertainty-guided reward modeling has boosted **When2Call accuracy** from ~36% to ~65% on 3–7B models, showing that calibration signals are learnable.

## Cascade Uncertainty

A critical failure mode: an early low-confidence tool call that happens to succeed numerically can lock the agent into a wrong trajectory. The agent then accumulates high confidence in an incorrect result.

Mitigation patterns:
- **Checkpoint uncertainty**: Log confidence at each major decision point, not just the final answer.
- **Uncertainty watermarking**: If any step in the chain fell below a threshold, mark the final output as low-confidence regardless of terminal confidence.
- **Branch-and-compare**: For ambiguous early choices, fork the trajectory and compare outcomes before committing.

## Practical Heuristics for Production

1. **Ask early, not late**: Ambiguity resolved before execution is 10–100× cheaper than mid-execution clarification.
2. **Batch clarifications**: If multiple parameters are uncertain, ask about all of them in one message, ranked by EVPI.
3. **Verbalize uncertainty explicitly**: Prompt agents to output a `[confidence: high/medium/low]` tag before actions — this makes uncertainty inspectable and loggable.
4. **Separate irreversible actions**: Apply a higher confidence threshold to irreversible actions (git push, send email) than reversible ones (read file, draft text).
5. **Interaction beats reasoning for accuracy**: Empirically, trajectories that clarify with users achieve higher task success than those that reason internally — when in doubt, ask.

## Open Questions

- How do you calibrate confidence thresholds across different task types without a labeled calibration set?
- Can agents learn to distinguish when asking the user vs. calling a tool is the better resolution path?
