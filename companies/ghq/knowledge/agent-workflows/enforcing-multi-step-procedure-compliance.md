---
title: "Enforcing Multi-Step Procedure Compliance in Agent Prompts"
category: agent-workflows
tags: ["agent-loop", "production-patterns", "prompt-optimization", "planning", "agent-architecture"]
source: "https://arxiv.org/html/2512.14754v1, https://openreview.net/forum?id=R6q67CDBCH, https://cposkitt.github.io/files/publications/agentspec_llm_enforcement_icse26.pdf, https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/chain-prompts, https://www.unpromptedmind.com/system-prompts-claude-agents-best-practices/"
confidence: 0.8
created_at: "2026-03-24T00:00:00Z"
updated_at: "2026-03-24T00:00:00Z"
---

LLM agents reliably skip later steps in long multi-step prompts due to positional bias and attention decay.

## The Problem

When an agent prompt contains a numbered procedure (e.g., 10 steps), steps near the end are executed far less reliably than early steps. This is especially true for steps that are:

- **Non-blocking**: The task appears "done" without them (e.g., knowledge checks after the main work)
- **Verification-only**: They don't produce visible artifacts (e.g., duplicate searches)
- **Positioned late**: Positional bias means instructions near the top receive stronger influence

Research shows LLM performance on multi-instruction tasks can drop by up to 61.8% with nuanced prompt modifications, and models struggle to follow multiple simultaneous constraints consistently.

## Why Steps Get Skipped

1. **Positional bias**: Content near the top of a prompt has stronger influence on behavior. Steps buried deep in a procedure are honored less consistently.
2. **Completion illusion**: Once the "main" work is done (e.g., issue filed, code written), the model perceives the task as complete and skips remaining verification steps.
3. **Token budget pressure**: In long contexts, later steps compete with accumulated context for attention.
4. **Difficulty avoidance**: Models tend to silently skip harder parts of complex tasks while completing easier parts.

## Mitigation Strategies

### 1. Prompt Chaining (Most Effective)

Break the procedure into separate prompts, each handling 2-3 steps. Each prompt's output gates the next. This prevents dropping steps because each chain link must complete before the next begins.

- Use for procedures with >5 steps
- Each chain link should produce a verifiable artifact
- Error rate decreases multiplicatively with each isolated step

### 2. Structural Enforcement

- **Put critical steps at both the top AND bottom** of the prompt (primacy + recency bias)
- **Make verification steps produce artifacts**: Instead of "check for duplicates," say "output the duplicate search results and your assessment"
- **Use explicit gating**: "Do NOT proceed to step N+1 until you have shown evidence of completing step N"

### 3. Runtime Enforcement (AgentSpec Pattern)

AgentSpec (ICSE '26) introduces a DSL for runtime constraints on LLM agents: triggers, predicates, and enforcement mechanisms that validate actions before execution. In benchmarks, it prevents unsafe executions in >90% of cases.

Applied to step compliance:
- Define a post-condition for each step that must be satisfied
- A lightweight validator checks the agent's output before allowing progression
- Non-compliant outputs trigger a re-prompt with the missed step highlighted

### 4. Checklist Echoing

Require the agent to echo back its checklist at the start of execution and check off each item as it completes. This forces the model to "load" all steps into active context.

```
Before starting, list all steps you must complete:
1. [ ] ...
2. [ ] ...
After completing each step, mark it done and proceed to the next.
```

### 5. Negative Framing for Critical Steps

Instead of "Run a duplicate search," use: "NEVER skip the duplicate search. Failing to check for duplicates will create inconsistent data." Hard constraints (what not to do) placed early in prompts are more reliably followed.

## Practical Recommendation for GHQ Reviewer Agents

The observed pattern — reviewers skipping knowledge checks (Step 6) and duplicate searches (Step 7a) — is a textbook case of late-positioned, non-blocking verification steps being dropped. Recommended fixes:

1. **Move knowledge check and duplicate search to the TOP of the procedure** (before the main review work)
2. **Require artifact output**: "Paste the qmd search results below before proceeding"
3. **Add negative framing early**: "You MUST NOT file an issue without first completing the knowledge check and duplicate search"
4. **Consider prompt chaining**: Split the reviewer into two phases — research phase (knowledge + duplicate check) and review phase (analysis + issue filing)
