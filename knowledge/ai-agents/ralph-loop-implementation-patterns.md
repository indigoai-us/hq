---
title: "Ralph Loop Implementation Patterns"
category: ai-agents
tags: ["agent-loop", "prd-driven-development", "evaluator-design", "token-optimization", "exit-conditions", "planning", "decision-making"]
source: web research, https://www.signlz.co/from-prd-to-tasks-the-art-of-decomposition, https://testdouble.com/insights/youre-holding-it-wrong-the-double-loop-model-for-agentic-coding, https://ralph-wiggum.ai/
confidence: 0.85
created_at: 2026-03-19T19:30:00Z
updated_at: 2026-03-20T14:00:00Z
---

Deep dive into PRD structure, evaluator design, exit strategies, and cost optimization for Ralph loops.

## Epic Decomposition Strategy

The most consequential decision before starting a Ralph loop is not *how* to write the PRD — it's *how much* to put in it.

### Right-Sizing: What Makes a Task "Loop-Sized"

A loop-sized task has three properties:

1. **Machine-verifiable completion** — tests pass, checkboxes are checked, lint succeeds. If "done" requires human judgment, it's not loop-sized yet.
2. **Fits in a fresh context** — all necessary background fits in one context load without summarization. Target: codebase orientation + PRD + progress file ≤ 30% of context budget.
3. **Converges in 3–10 iterations** — if a task typically needs 15+ iterations, the scope is too wide or the success criteria are ambiguous.

### One Big Loop vs. Many Small Loops

| Situation | Recommendation | Reason |
|-----------|---------------|--------|
| Feature touches one module | Single loop | Coordination cost > benefit |
| Feature has independent sub-features | Multiple sequential loops | Clean commits, smaller diffs per review |
| Sub-features can run in parallel | Multi-agent (parallel loops) | Wall-clock savings |
| Epic spans >2 days of coding | Split into loops | Context drift and cost compound |
| Success criteria are unclear | Single exploratory loop first | Clarify before parallelizing |
| Tight API contracts between parts | Sequential loops in order | Worker A's output is Worker B's input |

**Rule of thumb:** if you'd break it into separate PRs for a human dev, break it into separate loops.

### Splitting an Epic Into Loops

1. **Identify vertical slices** — decompose by user-facing behavior, not technical layer. A "backend + frontend" split requires integration overhead; an "auth flow + profile flow" split doesn't.
2. **Make contracts first** — any shared interfaces, API schemas, or data shapes should be defined before task loops start. These become constraints in each task's PRD.
3. **Order by dependency** — tasks that produce files/interfaces others consume must run first (or their outputs must be mocked in contracts).
4. **Assign file ownership** — each loop owns specific files. Overlapping ownership causes merge conflicts and re-work.
5. **Keep the PRD per loop ≤ 5 items** — more than 5 user stories/technical requirements per loop is a signal the scope is too large.

### Anti-Patterns in Decomposition

- **Horizontal slicing** ("do all the DB layer, then all the API layer") creates integration risk and makes each loop's output non-runnable.
- **God PRD** — one massive PRD for an entire epic leads to context bloat, cost overruns, and agents that lose track of constraints by iteration 8.
- **Underdefined acceptance criteria** — "make the login work" generates more loops than "login with valid credentials returns 200 + JWT; invalid returns 401 + error message".
- **Splitting too fine** — tasks that take one iteration are better as checklist items within a larger loop. Coordination overhead exceeds value.

## PRD Structure

The PRD is the steering wheel of a Ralph loop — its quality directly determines loop success or failure. Effective PRDs follow a structured pattern:

### Recommended PRD Format

```markdown
# Feature: <name>

## User Stories
- [ ] US-1: <description with acceptance criteria>
- [ ] US-2: ...

## Technical Requirements
- [ ] TR-1: <measurable requirement>

## Constraints
- No breaking changes to existing API
- Must pass all existing tests

## Definition of Done
- All checkboxes checked
- Tests passing
- No lint errors
```

Key principles:
- **Checkboxes are machine-verifiable** — the evaluator scans for `- [x]` vs `- [ ]`
- **Each item is atomic** — one clear deliverable per checkbox
- **Acceptance criteria are explicit** — avoid subjective language like "looks good" or "works well"
- **Constraints section** prevents scope creep — the agent knows what NOT to do

### Progress File Pattern

The `progress.md` (or `progress.txt`) file is the loop's persistent memory:

```markdown
## Completed
- [x] US-1: Implemented auth middleware (iteration 3)

## Current
- [ ] US-2: Add rate limiting

## Learnings
- Auth middleware requires Redis connection — added to docker-compose
- Rate limiter config lives in `config/rate-limit.yaml`
```

The **Learnings section is critical** — each iteration reads this file and avoids rediscovering what previous iterations already found. This is how the loop builds institutional memory without in-context history.

## Evaluator Design

The evaluator is as important as the worker. Poor evaluation leads to infinite loops or premature exits.

### Evaluator Strategies

| Strategy | How It Works | Best For |
|----------|-------------|----------|
| **Checklist scan** | Parse PRD for unchecked boxes | Simple feature work |
| **Test suite** | Run tests, check pass/fail | Bug fixes, refactors |
| **Dual-agent review** | Second LLM reviews the diff | Complex features |
| **Static analysis** | Lint + type check + build | Code quality gates |
| **Composite** | Combine multiple strategies | Production workflows |

### Dual-Condition Exit (Best Practice)

The most robust pattern requires BOTH conditions:
1. All PRD items marked complete
2. An explicit completion signal (e.g., `<promise>COMPLETE</promise>`)

This prevents false positives where items are checked but implementation is incomplete.

## Exit Condition Strategies

Exit conditions are the hardest part of Ralph loop design:

### Common Patterns

1. **Completion Promise** — Agent outputs a specific token (e.g., `COMPLETE`) that the orchestrator scans for. Simple but relies on agent honesty.
2. **Max Iterations** — Safety valve that stops after N iterations regardless. Always include this as a fallback.
3. **Test Gate** — Loop exits only when all tests pass. Most reliable for code changes.
4. **Diff-Based** — Exit when an iteration produces no new changes (agent has converged). Risk: can exit on a stuck agent.
5. **Composite** — Combine promise + test gate + max iterations. Most robust.

### Anti-Patterns

- **Relying solely on LLM self-assessment** — the agent will hallucinate completion
- **No max iteration cap** — risks infinite loops and runaway costs
- **Overly complex exit logic** — the orchestrator script should stay simple
- **Multiple completion tokens** — `--completion-promise` uses exact string matching; stick to one

## Token Cost Optimization

Each iteration starts a fresh context, so costs scale linearly. Strategies to manage this:

### Effort-Aware Routing

Not all tasks need the same cognitive spend. A trivial rename doesn't deserve the same model tier as a complex migration:

| Task Complexity | Recommended Approach |
|----------------|---------------------|
| Simple (rename, format) | Smaller model, 1-2 iterations |
| Medium (feature impl) | Full model, 3-5 iterations |
| Complex (migration, refactor) | Full model, 5-10 iterations, dual-agent eval |

### Context Minimization

- Keep PRD and progress files concise — they're loaded every iteration
- Archive completed stories to a separate file once verified
- Use `.gitignore` patterns to exclude large generated files from agent context
- Prefer reading specific files over globbing entire directories

### Cost Benchmarks (Approximate)

- Simple feature: 3-5 iterations, ~$2-5 total (Sonnet-class)
- Medium feature: 5-10 iterations, ~$10-25 total
- Complex migration: 10-20 iterations, ~$30-80 total

These vary wildly based on codebase size and model choice. The ROI calculation is developer-hours-saved vs compute cost.

## Real-World Deployment Patterns

### Solo Developer (Overnight Loop)

```
1. Write PRD before bed
2. Start loop with max_iterations=20
3. Wake up to PR with implemented feature
4. Review diff, merge or add feedback for another loop
```

### Team Integration

```
1. PM writes PRD in standardized format
2. Dev configures loop (model, evaluator, constraints)
3. Loop runs in CI/CD environment
4. Output is a draft PR for human review
5. Human feedback feeds back into PRD for next iteration
```

### Multi-Agent Orchestration

Advanced pattern where multiple Ralph loops coordinate:
- **Planner loop** — decomposes epic into stories
- **Worker loops** — one per story, running in parallel
- **Integration loop** — merges outputs and resolves conflicts

This is still experimental and adds significant orchestration complexity.

## Sources

- [Medium — The Ralph Loop: When Your PRD Becomes the Steering Wheel](https://medium.com/@ValentinNagacevschi/the-ralph-loop-when-your-prd-becomes-the-steering-wheel-5abf6b1345c0)
- [AI Hero — 11 Tips For AI Coding With Ralph Wiggum](https://www.aihero.dev/tips-for-ai-coding-with-ralph-wiggum)
- [DEV Community — 2026: The year of the Ralph Loop Agent](https://dev.to/alexandergekov/2026-the-year-of-the-ralph-loop-agent-1gkj)
- [Vibecoding — Ralph Wiggum Loop Review (2026)](https://vibecoding.app/blog/ralph-wiggum-loop-review)
- [Adam Tuttle — My RALPH Workflow for Claude Code](https://adamtuttle.codes/blog/2026/my-ralph-workflow-for-claude-code/)
- [Geocodio — Ship Features in Your Sleep with Ralph Loops](https://www.geocod.io/code-and-coordinates/2026-01-27-ralph-loops/)
- [GitHub — snarktank/ralph](https://github.com/snarktank/ralph)
- [GitHub — daydemir/ralph](https://github.com/daydemir/ralph)
