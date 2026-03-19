---
title: "Machine-Verifiable Acceptance Criteria"
category: ghq-core
tags: ["agent-loop", "prd-driven-development", "acceptance-criteria", "automation"]
source: conversation
confidence: 0.7
created_at: 2026-03-19T19:35:00Z
updated_at: 2026-03-19T19:35:00Z
---

When writing acceptance criteria for AI agent loops, criteria must be machine-parseable, not just human-readable.

## The Problem

Traditional Agile acceptance criteria are written for humans: "the login page should feel responsive" or "error messages should be helpful." In a Ralph loop (or any autonomous agent loop), an evaluator program must decide pass/fail — subjective language causes either infinite loops (evaluator can never confirm "feels responsive") or premature exits (evaluator can't distinguish done from stuck).

## Rules for Machine-Verifiable Criteria

1. **Use checkboxes** — `- [ ]` / `- [x]` are trivially parseable by the evaluator script
2. **One deliverable per item** — atomic items the agent can complete in a single iteration
3. **Observable outcomes only** — "test suite passes," "endpoint returns 200," "file exists at path X"
4. **No subjective language** — replace "looks good" with "renders without console errors"; replace "fast" with "p95 latency < 200ms"
5. **Include negative criteria** — "no regressions in existing tests" catches agents that break things while making progress

## Anti-Patterns

| Bad Criterion | Why It Fails | Better Version |
|--------------|-------------|----------------|
| "Auth works correctly" | Can't verify "correctly" | "POST /login returns 200 with valid creds, 401 with invalid" |
| "Clean code" | Subjective | "No lint errors, no type errors" |
| "Good error handling" | Vague | "All API endpoints return structured error JSON with status code" |
| "Performant" | Unmeasurable in-loop | "Benchmark script exits 0 (thresholds in benchmark.config)" |

## Applicability Beyond Ralph Loops

This pattern applies to any automated task acceptance: CI/CD quality gates, automated PR review criteria, scheduled task completion checks. Anywhere a program (not a human) must judge "done," criteria need to be machine-verifiable.
