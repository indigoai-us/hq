---
title: "Evaluator Unit Testing and Dry-Run Patterns"
category: agent-evaluation
tags: ["agent-loop", "evaluator-design", "testing", "golden-dataset", "dry-run", "production-patterns", "reproducibility", "version-pinning"]
source: https://langfuse.com/blog/2025-10-21-testing-llm-applications, https://www.getmaxim.ai/articles/building-a-golden-dataset-for-ai-evaluation-a-step-by-step-guide/, https://deepeval.com/guides/guides-ai-agent-evaluation, https://www.confident-ai.com/docs/llm-evaluation/core-concepts/test-cases-goldens-datasets, https://langfuse.com/docs/prompt-management/get-started, https://www.promptfoo.dev/docs/integrations/langfuse/, https://langfuse.com/docs/prompt-management/data-model
confidence: 0.88
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T16:00:00Z
---

Before committing to expensive loop runs, validate your evaluator with unit tests and dry-run modes.

Testing the evaluator *itself* is often overlooked — if the evaluator is broken, every expensive loop run produces meaningless results or infinite loops. The patterns below keep feedback loops tight and costs low.

## Why Evaluator Testing Matters

In a Ralph loop (or any autonomous agent loop), the evaluator is the exit condition. A faulty evaluator causes:
- **False positives**: exits early, declares done when incomplete
- **False negatives**: never exits, runs forever and burns tokens
- **Silent corruption**: scores look plausible but don't track the actual goal

## Core Pattern: Three-Layer Testing Pyramid

### Layer 1 — Unit Tests (no LLM)

Test the evaluator function in isolation against known fixtures. Use deterministic, synthetic inputs with known expected scores.

```python
# Example: test a completeness evaluator
def test_evaluator_rejects_empty_output():
    result = evaluate_completeness(output="", expected_fields=["title", "summary"])
    assert result.score < 0.5
    assert "missing fields" in result.reason

def test_evaluator_accepts_complete_output():
    result = evaluate_completeness(
        output='{"title": "Foo", "summary": "Bar"}',
        expected_fields=["title", "summary"]
    )
    assert result.score >= 0.9
```

Key: the evaluator function must be **pure and extractable** — testable without running the full loop.

### Layer 2 — Golden Dataset Evaluation

A "golden dataset" is a curated set of (input, expected_output) pairs with known-good evaluator scores. Promote examples to gold by:
1. Starting with synthetic "silver" examples
2. Running the evaluator and manually verifying results
3. Locking the (input → score) mapping as a regression fixture

Run the evaluator over goldens on every change:

```bash
# Pseudocode
for each (input, expected_score) in goldens:
    actual_score = evaluator.run(input)
    assert abs(actual_score - expected_score) < threshold
```

Tools like [DeepEval](https://deepeval.com) structure this as pytest-style assertions over `LLMTestCase` objects.

### Layer 3 — Dry-Run Mode

A dry-run executes the full loop pipeline but **caps iterations** and **logs evaluator calls** without acting on results. Useful for:
- Verifying the evaluator is called with the right inputs
- Checking score distributions on realistic data before committing cost
- Detecting evaluator crashes or unexpected None returns

```python
loop.run(max_iterations=2, dry_run=True)
# → logs: evaluator called 2x, scores [0.43, 0.71], no exit triggered
```

## Evaluator Validation Checklist

Before running a real loop:

| Check | Method |
|---|---|
| Evaluator returns scores in [0,1] | Unit test boundary values |
| Exit threshold is calibrated | Run on 10 known-good/bad examples |
| Evaluator is deterministic (or stable) | Run same input 3x, check variance |
| Error cases are handled | Unit test with malformed LLM outputs |
| Prompt drift detection | Compare evaluator prompt to last known-good hash |

## Offline vs Online Evaluation

**Offline** (pre-loop): Run evaluator over a fixed dataset in CI. Catches regressions before any loop runs. Cheap — no live LLM calls if evaluator uses heuristics.

**Online** (during loop): Live evaluation. More realistic but expensive. Reserve for final validation once offline tests pass.

The principle: *offline evaluation gates online evaluation*.

## Evaluator-as-Judge Special Cases

When the evaluator itself uses an LLM (LLM-as-judge), add:
- **Calibration set**: 20–50 human-labeled examples with known scores. Assert evaluator agreement ≥ 80%.
- **Consistency test**: same input, same judge prompt → variance in score < 0.1 across 3 runs.
- **Adversarial probes**: inputs designed to confuse the judge (e.g., verbose-but-wrong outputs). Verify the judge scores them low.

Tools: [G-Eval (DeepEval)](https://deepeval.com), [LangSmith evaluators](https://www.langchain.com/langsmith/evaluation), [Braintrust](https://www.braintrust.dev).

## Version-Pinning Evaluator Prompts

LLM-judge scores drift when (a) the judge model is updated by the provider or (b) the evaluator prompt changes. Both silently corrupt comparisons across runs. Version-pinning addresses both.

### What causes score drift

| Source | Mechanism |
|--------|-----------|
| Model version churn | Provider silently updates `gpt-4o`; score distribution shifts |
| Prompt edits | Even whitespace or tone changes alter judge behavior |
| Temperature > 0 | Sampling introduces run-to-run variance |
| Few-shot example drift | Examples hand-edited over time, rubric evolves |

### Pin the judge model

Use **dated model snapshots**, not aliases:

```python
# Bad — alias changes without notice
judge_model = "gpt-4o"

# Good — pinned to a specific deployed version
judge_model = "gpt-4o-2024-11-20"   # OpenAI
judge_model = "claude-3-5-sonnet-20241022"  # Anthropic
```

Set temperature to 0 to eliminate sampling variance.

### Pin the evaluator prompt via hash

Store the prompt text in a versioned file and record its SHA-256 hash in the eval run metadata:

```python
import hashlib, pathlib

PROMPT_PATH = "evals/judge_prompt_v3.txt"
prompt_text = pathlib.Path(PROMPT_PATH).read_text()
prompt_hash = hashlib.sha256(prompt_text.encode()).hexdigest()[:12]

# Log alongside eval results
run_metadata = {
    "judge_model": judge_model,
    "prompt_file": PROMPT_PATH,
    "prompt_hash": prompt_hash,
}
```

Compare `prompt_hash` across runs to detect silent edits. Fail CI if the hash changed without a version bump.

### Prompt versioning with a management tool

[Langfuse](https://langfuse.com/docs/prompt-management/get-started) stores prompt versions immutably:

```python
# Reference specific version — never "production" label in eval CI
prompt = langfuse.get_prompt("llm-judge", version=7)
```

[Promptfoo](https://www.promptfoo.dev/docs/integrations/langfuse/) integrates directly:

```yaml
# promptfoo config
prompts:
  - langfuse://my-judge-prompt:7  # pinned to version 7
```

### Calibration gating

After any prompt or model change, run the golden dataset and assert:
- Agreement with human labels ≥ 85%
- Score variance on repeated inputs < 0.1
- No regression on adversarial probes

Fail the eval pipeline if any threshold drops — treat it as a breaking change.

### Checklist: Stable Judge Configuration

| Control | Implementation |
|---------|---------------|
| Pinned model version | Dated snapshot ID, not alias |
| Temperature | Set to 0 in eval config |
| Prompt hashed | SHA-256 logged per run |
| Prompt in version control | Git-tracked file or versioned prompt store |
| Golden regression | CI asserts score stability on labeled examples |
| Change policy | Treat prompt + model as a versioned artifact; bump version on any edit |

## Ralph Loop Specifics

For Ralph-style loops with machine-verifiable acceptance criteria:
1. **Write evaluator tests before writing the evaluator** — define pass/fail cases from the PRD criteria first.
2. **Dry-run with `max_iterations=1`** to test a single evaluator call cheaply.
3. **Log raw evaluator output** on every call — invaluable for debugging infinite loops post-hoc.
4. **Pin evaluator prompt version** — log `prompt_hash` + model snapshot in every run; gate CI on golden regression.
