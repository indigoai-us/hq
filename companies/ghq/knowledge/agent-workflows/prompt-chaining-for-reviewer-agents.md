---
title: "Prompt Chaining for Reviewer Agent Templates"
category: agent-workflows
tags: ["prompt-optimization", "agent-architecture", "production-patterns", "coordination", "planning"]
source: "web research"
confidence: 0.8
created_at: 2026-03-25T00:00:00Z
updated_at: 2026-03-25T00:00:00Z
---

Restructuring monolithic reviewer prompts into two-phase chains (research → review) improves accuracy and debuggability.

## The Problem with Monolithic Reviewer Prompts

A single large prompt that tells an agent to "gather context AND generate a review" forces the LLM to juggle two competing objectives simultaneously. This leads to:

- **Shallow context gathering** — the model rushes to reach the review phase
- **Hallucinated references** — the model cites code it never actually read
- **Debugging opacity** — when a review is wrong, you can't tell whether the research or the synthesis failed

## Prompt Chaining Pattern

Anthropic's "Building Effective Agents" guide identifies prompt chaining as a core composable pattern: decompose a task into sequential steps where each LLM call processes the output of the previous one. Programmatic **validation gates** between steps ensure intermediate outputs meet quality criteria before proceeding.

The most common chaining pattern is **self-correction**: generate a draft → review it against criteria → refine based on the review. Each step is a separate call so you can log, evaluate, or branch at any point.

### When to Use

- The task cleanly decomposes into **fixed, predictable subtasks**
- You're willing to trade latency for accuracy
- Intermediate outputs benefit from validation before continuation

## Two-Phase Reviewer Architecture

### Phase 1: Research (Context Gathering)

A dedicated subprocess prompt that only gathers facts:

```
You are a code research assistant. Given a PR diff and repo access:
1. Read every changed file in full
2. Read files that import or are imported by changed files
3. Identify relevant tests
4. Summarize: what changed, what's affected, what tests exist

Output a structured context document. Do NOT make judgments or suggestions.
```

**Gate**: Validate the context document is non-empty, references real files, and covers all changed paths.

### Phase 2: Review (Judgment)

A separate prompt that receives the context document and generates the review:

```
You are a code reviewer. Given the structured context below:
1. Identify bugs, security issues, and design problems
2. Suggest improvements with specific code references
3. Rate severity of each finding

<context>
{output from Phase 1}
</context>
```

### Implementation with Subprocesses

In GHQ, phases map to `ask-claude.sh` calls:

```bash
# Phase 1: Research
context=$(cat pr_diff.txt | ./companies/ghq/tools/ask-claude.sh \
  "Gather context for this PR. Read all changed files and their dependencies." \
  -j)

# Gate: Validate context
if [ "$(echo "$context" | jq '.files_read | length')" -lt 1 ]; then
  echo "Research phase failed: no files read" >&2
  exit 1
fi

# Phase 2: Review
echo "$context" | ./companies/ghq/tools/ask-claude.sh \
  "Review this PR using the gathered context. Focus on bugs and design issues."
```

## Benefits

| Aspect | Monolithic | Two-Phase Chain |
|--------|-----------|----------------|
| Context depth | Shallow (model rushes) | Thorough (dedicated phase) |
| Debuggability | Opaque | Inspect gate output |
| Accuracy | Model hallucinates refs | Grounded in actual reads |
| Cost | Lower (one call) | Higher (two calls) |
| Latency | Lower | Higher |

## Design Considerations

- **Gate design matters**: The validation gate between phases is where you catch failures early. Check that all changed files were actually read, that the context document has the expected structure, and that no files were hallucinated.
- **Keep phases focused**: Each phase should have a single, clear objective. Mixing objectives defeats the purpose of chaining.
- **Context passing format**: Use structured output (JSON) for Phase 1 to make it parseable by both the gate and Phase 2. Unstructured prose creates ambiguity.
- **Cost tradeoff**: Two calls cost more tokens than one. Justified when review accuracy matters more than cost — e.g., production PRs, security-sensitive code.
- **Anthropic's guidance**: Start simple. Only add chaining when a single prompt demonstrably fails. The most successful implementations use simple, composable patterns rather than complex frameworks.

## Sources

- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
- [Anthropic: Chain Complex Prompts](https://platform.claude.com/docs/en/docs/build-with-claude/prompt-engineering/chain-prompts)
- [Prompt Engineering Guide: Prompt Chaining](https://www.promptingguide.ai/techniques/prompt_chaining)
- [AWS: Workflow for Prompt Chaining](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-patterns/workflow-for-prompt-chaining.html)
