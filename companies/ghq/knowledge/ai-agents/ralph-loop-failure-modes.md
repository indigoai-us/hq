---
title: "Ralph Loop Failure Modes & Debugging"
category: ai-agents
tags: ["agent-loop", "debugging", "failure-modes", "autonomous-coding", "observability"]
source: blueprint
confidence: 0.5
created_at: 2026-03-19T20:00:00Z
updated_at: 2026-03-19T20:00:00Z
---

Common failure patterns in Ralph loops and strategies for diagnosing them.

## Failure Taxonomy

### 1. Infinite Loop (Most Common)

The agent never converges on completion. Causes:
- **Vague acceptance criteria** — evaluator can never confirm "looks good" or "works well"
- **Conflicting criteria** — fixing one item breaks another, creating an oscillation
- **Evaluator too strict** — legitimate completion is rejected by overly pedantic checks
- **Agent scope creep** — agent keeps "improving" code beyond what's needed, never outputs completion signal

Mitigation: always set `max_iterations`. Monitor git diffs between iterations — if diffs are small and repetitive, the loop is oscillating.

### 2. Premature Exit

The agent declares completion before the task is actually done. Causes:
- **Weak evaluator** — checklist scan passes but implementation is hollow
- **Completion signal in agent reasoning** — the word "COMPLETE" appears in thinking, not as a genuine signal
- **Tests pass trivially** — tests exist but don't exercise the actual requirements

Mitigation: dual-condition exit (both checklist complete AND explicit signal). Write tests that would fail without the implementation.

### 3. Context Amnesia

Each iteration starts fresh, so discoveries from earlier iterations are lost. Causes:
- **No progress file** — the loop has no persistent memory mechanism
- **Progress file not in prompt** — it exists but the agent isn't instructed to read it
- **Overwritten progress** — agent replaces progress.md instead of appending

Mitigation: CLAUDE.md (or equivalent) must explicitly instruct reading AND updating the progress file.

### 4. Runaway Cost

Loop burns through budget without meaningful progress. Causes:
- **Large context per iteration** — bloated repo or overly broad file reading
- **High iteration count with large model** — complex tasks on Opus-class models
- **No early termination** — stuck loops run to max_iterations

Mitigation: monitor cost per iteration. Set budget alerts. Use cheaper models for simple sub-tasks.

### 5. Codebase Corruption

Agent makes changes that break the repo in ways subsequent iterations can't recover from. Causes:
- **Partial commits** — agent commits broken state, next iteration starts from broken baseline
- **Dependency mutations** — agent installs/removes packages that destabilize the project
- **File deletions** — agent removes files it thinks are unnecessary

Mitigation: run tests as part of the evaluator (not just the worker). Consider a pre-iteration health check.

## Debugging Strategies

- **Check git log** — each iteration should produce commits. Gaps or empty iterations indicate stuck loops.
- **Diff between iterations** — if diffs are oscillating (add/remove same code), criteria are conflicting.
- **Read progress.md** — the learnings section reveals what the agent struggled with.
- **Review evaluator output** — log what the evaluator checks and its pass/fail decisions.
- **Run the evaluator manually** — test it against known-good and known-bad states to verify it works.

## Open Questions

- How do teams track ralph loop runs across a project over time?
- What observability tooling exists specifically for agent loops?
- Are there patterns for "resumable" loops that can pause and restart across sessions?
