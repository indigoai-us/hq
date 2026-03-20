---
title: "SWE-bench State of the Art (Early 2026)"
category: agent-evaluation
tags: ["swe-bench", "benchmarks", "autonomous-coding", "leaderboard", "planning", "agent-architecture", "retrieval", "comparison", "multi-file"]
source: https://www.swebench.com/, https://labs.scale.com/leaderboard/swe_bench_pro_public, https://arxiv.org/abs/2410.20285, https://openhands.dev/blog/openhands-codeact-21-an-open-state-of-the-art-software-development-agent, https://jxnl.co/writing/2025/09/11/why-grep-beat-embeddings-in-our-swe-bench-agent-lessons-from-augment/, https://arxiv.org/abs/2509.16941, https://epoch.ai/blog/what-skills-does-swe-bench-verified-evaluate
confidence: 0.87
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T14:00:00Z
---

By early 2026, top agents resolve ~80% of SWE-bench Verified; the gains came from stronger scaffolds, not just stronger models.

## Benchmark Variants

| Benchmark | Description | Top Score (Mar 2026) |
|---|---|---|
| **SWE-bench Verified** | Human-validated subset (~500 issues); main leaderboard | ~80–81% |
| **SWE-bench Full** | All ~2,000+ real GitHub issues | ~52% |
| **SWE-bench Lite** | 300 representative issues, faster to eval | ~75%+ |
| **SWE-bench Pro** | Enterprise-scale, long-horizon issues (Scale AI) | ~46–57% |
| **SWE-bench Live / SWE-rebench** | Continuously refreshed to prevent data contamination | ongoing |
| **Multi-SWE-bench** | Multi-language (Java, Go, Rust, TS, C, C++) | emerging |
| **SWE-EVO** | Long-horizon software evolution scenarios | emerging |

SWE-bench Verified is the canonical metric; Pro is considered harder and more realistic.

## Leaderboard Leaders (March 2026)

### SWE-bench Verified
- **Claude Opus 4.5**: ~80.9% (Anthropic)
- **Claude Opus 4.6**: ~80.8%
- **Gemini 3.1 Pro**: ~80.6%
- **MiniMax M2.5**: ~80.2%
- **Sonar Foundation Agent** (SonarSource): ~79.2% on Verified, 52.6% on Full
- **OpenHands CodeAct 2.1**: ~72% (open-source)

### SWE-bench Pro (Scale SEAL standardized scaffold)
- **GPT-5.3-Codex**: ~56.8%
- **Claude Opus 4.5**: ~45.9%

### Key trajectory
- Early 2024: ~15% on Verified
- Mid-2025: ~50% leading agents (Anthropic hit 73.2%)
- ByteDance held top at 75.2% late 2025
- March 2026: ~80–81% on Verified

## What Drives Top Scores

### 1. Scaffold > Model
Agent scaffolding is the primary differentiator, not raw model capability. A weaker model with a strong scaffold (Claude Sonnet + CCA) can outperform a stronger model (Opus) with a weaker scaffold. Key scaffold elements:
- Structured file navigation and editing loops
- Test execution and validation in the loop
- Context management across long sessions

### 2. Search Strategy: Grep Over Embeddings
Augment's analysis found that simple `grep` and `find` persistently outperformed embedding-based retrieval for SWE-bench tasks. The bottleneck isn't retrieval precision — it's the agent's ability to persist and course-correct. Embeddings add complexity without improving resolution rates on this task distribution.

### 3. MCTS / Test-Time Compute (SWE-Search)
SWE-Search (ICLR 2025) applies Monte Carlo Tree Search to agent trajectories:
- **SWE-Agent**: explores repository actions
- **Value Agent**: provides numerical + qualitative feedback on trajectories
- **Discriminator Agent**: multi-agent debate for decision-making
- Result: 23% relative improvement over baseline agents across 5 models
- Scales with inference compute — deeper search = better scores

### 4. Extended Thinking + "Think" Tool
Claude's "think" tool (dedicated structured thinking space during tool use) gives substantial improvements on agentic tasks. Distinct from extended thinking at inference time; it creates explicit reasoning steps during multi-tool workflows. Claude Opus 4.6 Thinking: ~79.2%.

### 5. Agentless Pipelines
"Agentless" (e.g., Moatless, Agentless framework) argues that structured prompting + deterministic workflows can match or beat complex scaffolds for well-scoped tasks. Weakness: struggles with multi-file edits.

### 6. Multi-Agent Debate / Voting
Top commercial submissions use ensembles or multiple agent trajectories with voting/selection. Raises cost significantly but pushes accuracy.

## Open-Source Leaders

| System | Notes |
|---|---|
| **OpenHands** | CodeAct architecture, function calling, ~72% on Verified |
| **SWE-agent** | Princeton NLP; original SWE-bench companion |
| **Moatless Tools** | Agentless-style, strong on single-file tasks |
| **DeepSWE** | Open-source, RL-trained |
| **MCTS-Refine** | MCTS-based open approach |
| **Agentless** | Prompting-first, no scaffold complexity |

## Key Limitations of the Benchmark

- **Data contamination**: Closed repos let agents see test solutions in training data. SWE-bench Live continuously refreshes to counter this.
- **Scope**: Issues are well-scoped; real production tasks are ambiguous and longer-horizon.
- **Cost/latency ignored**: 80% resolution at $50/issue is not production-viable.
- **Single-turn**: Most submissions don't iterate with user feedback.
- **Scaffolding heterogeneity**: Leaderboard conflates model quality with scaffold design — Scale's SEAL provides standardized scaffolding to isolate model capability.

## Benchmark Inflation Concern

SWE-bench Pro (Scale AI) was introduced specifically because SWE-bench Verified is becoming saturated (80%+). Pro uses longer-horizon, enterprise-scale issues where even the best agents score ~46–57%, providing headroom for continued progress measurement.

## SWE-bench Pro vs Verified: Task Design Differences

### Dataset Composition

| Dimension | SWE-bench Verified | SWE-bench Pro |
|---|---|---|
| **Size** | 500 tasks | 1,865 tasks |
| **Languages** | Python only | Multi-language (Python, JS, Go, Rust, etc.) |
| **Repos** | Public GitHub repos | 41 repos: 11 public (GPL) + 12 held-out + 18 commercial |
| **Contamination** | High — models likely trained on solutions | Low — GPL copyleft + private startup codebases |
| **Trivial tasks** | ~161/500 require only 1–2 line fixes | Explicitly excluded — every task requires ≥10 LOC |

### Complexity Profile

- **SWE-bench Verified**: Median fix is a small, single-file change. 52% of tasks take under 1 hour for a human; 39% are rated "trivial" (<15 min, avg 5 LOC changed).
- **SWE-bench Pro**: Reference solutions average **107.4 lines across 4.1 files**. Over 100 tasks demand 100+ LOC. Problems are designed to take hours to days for a skilled engineer.

### Agent Capabilities Tested by Pro (Not in Verified)

1. **Multi-file coordination**: Verified is largely a single-file benchmark; Pro requires coherent changes across an average of 4 files, testing an agent's ability to reason about cross-cutting concerns and interface boundaries.

2. **Enterprise codebase navigation**: Pro uses real startup codebases with little documentation, forcing agents to infer architecture from code structure — not from well-known open-source patterns.

3. **Commercial codebase reasoning**: The private set (18 proprietary repos) has never appeared in training data. Best models score **<20%** on this subset, exposing that current high Verified scores partly reflect memorization.

4. **Failure mode differentiation**: Larger models fail Pro tasks primarily due to *semantic/algorithmic errors* in multi-file edits; smaller models fail due to *syntax errors, tool misuse, and context loss*. Verified's simpler scope doesn't expose this distinction.

5. **Long-horizon planning**: Tasks require maintaining coherent state across many tool calls and file edits — testing genuine planning, not just pattern-matching to training data.

### Performance Gap Summary

| Model | Verified | Pro (Public) | Pro (Commercial) |
|---|---|---|---|
| Claude Opus 4.5 | ~80.9% | ~45.9% | <20% |
| Claude Sonnet 4.5 | ~75%+ | ~43.6% | <20% |
| GPT-5 | ~80%+ | ~41.8% | <20% |

The ~35-point drop from Verified to Pro public, and another ~25-point drop to Pro commercial, isolates three compounding difficulty layers: multi-file complexity, unfamiliar codebases, and contamination-free evaluation.
