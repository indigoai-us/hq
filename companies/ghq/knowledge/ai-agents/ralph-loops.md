---
title: "Ralph Loops"
category: ai-agents
tags: ["agent-loop", "autonomous-coding", "iteration-pattern", "context-management", "prd-driven-development", "planning"]
source: "web research, https://ghuntley.com/loop/, https://ghuntley.com/pressure/, https://github.com/ghuntley/how-to-ralph-wiggum, https://linearb.io/blog/ralph-loop-agentic-engineering-geoffrey-huntley, https://linearb.io/blog/dex-horthy-humanlayer-rpi-methodology-ralph-loop"
confidence: 0.88
created_at: 2026-03-19T18:00:00Z
updated_at: 2026-03-20T15:30:00Z
---

Autonomous agent iteration pattern where AI keeps working until tasks are verifiably complete.

## Origin

Coined by Geoffrey Huntley in early 2024. Named after Ralph Wiggum (The Simpsons) — the name is also slang for vomiting, reflecting Huntley's visceral reaction to realizing how the pattern would reshape software engineering. The technique went mainstream in 2025-2026 as coding agents matured.

## Core Mechanism

A Ralph loop is structurally simple: `while (!done) { work(); verify(); }`. An AI coding agent receives a task (typically from a PRD), works on it, then an evaluator checks whether the task is actually complete. If not, the agent iterates with feedback. The key insight is **fresh context per iteration** — rather than accumulating conversation history within one session, each loop iteration starts clean. State lives in files and git, not in the LLM's context window.

```
┌─────────────┐
│  PRD / Task  │
└──────┬───────┘
       ▼
┌──────────────┐    ┌──────────────┐
│  Worker Agent │◄───│  Evaluator   │
│  (fresh ctx)  │───►│  (review)    │
└──────────────┘    └──────┬───────┘
                           │
                     done? ─┤
                     no  ───┘ (loop)
                     yes ───► exit
```

## Three-File Pattern

The canonical implementation uses three files:

| File | Role |
|------|------|
| **Orchestrator script** | Bash loop that cycles worker → reviewer |
| **Work recipe** | Prompt telling the worker how to make progress |
| **Review recipe** | Prompt telling the reviewer how to evaluate completion |

## Ralph vs ReAct

| Aspect | ReAct | Ralph Loop |
|--------|-------|------------|
| Context model | Single session, accumulating history | Fresh context per iteration |
| Loop control | LLM self-assessment decides when to stop | External verification decides |
| Memory layer | In-context window | Files + git history |
| Long tasks | Degrades as context fills | Handles arbitrarily long work |
| Failure mode | LLM hallucinates completion | Evaluator catches false positives |

ReAct loops within a single context window and rely on the LLM to judge its own completion — if the model becomes "delusional" and thinks it's done, the loop exits prematurely. Ralph breaks this dependency by externalizing verification.

## Key Principles

1. **Sit on the loop, not in it** — your job is engineering the setup (PRD, tooling, environment), not doing the coding.
2. **Git is memory** — progress persists in commits, not conversation history. Each iteration reads the repo's current state.
3. **Monolithic by design** — one repo, one process, one task per loop. Simplicity over orchestration complexity.
4. **Verification > generation** — the evaluator/reviewer is as important as the worker. Bad evaluation = infinite loops or premature exits.

## Ecosystem

Several implementations exist:

- **snarktank/ralph** — original reference implementation
- **frankbria/ralph-claude-code** — Claude Code-specific with intelligent exit detection
- **vercel-labs/ralph-loop-agent** — Vercel AI SDK integration
- **Block's Goose** — has a built-in Ralph Loop tutorial
- Various minimal implementations (iannuttall/ralph, PageAI-Pro/ralph-loop)

## Practical Considerations

- **PRD quality is everything** — vague specs lead to infinite loops or wrong outputs
- **Token cost** — each iteration is a fresh session, so costs scale linearly with iterations
- **Exit conditions** — the hardest part; evaluators need clear, measurable criteria
- **Scope** — works best for well-defined, bounded tasks (feature implementation, bug fixes, migrations); struggles with ambiguous design work

## Back-Pressure

Back-pressure is a central design concept in Ralph: automated feedback mechanisms that **reject incomplete or incorrect work** before the loop can proceed.

> "Software engineering is now about preventing failure scenarios and preventing the wheel from turning over through back pressure to the generative function." — Geoffrey Huntley

### Back-Pressure Gates

Concrete gates used to create back-pressure:

| Gate Type | Mechanism | Appropriate For |
|-----------|-----------|----------------|
| **Test suite** | `pytest`, `jest`, `go test` — loop won't exit until all pass | Code correctness |
| **Static analysis** | `tsc --noEmit`, `ruff`, `eslint` — fail = loop continues | Type/lint safety |
| **Build gate** | Compilation succeeds | Any compiled language |
| **Completion promise** | Agent must output `<promise>COMPLETE</promise>` | Subjective criteria |
| **LLM-as-judge** | Second model reviews the diff, returns pass/fail | Complex feature requirements |

### Why Back-Pressure Matters

Without it, the agent can hallucinate completion and exit prematurely. Back-pressure shifts the exit decision from the worker agent (unreliable self-assessment) to an external evaluator (objective, consistent). Projects with strong back-pressure have been able to run agents on much longer-horizon tasks because the agent encounters its mistakes in real-time and self-corrects rather than discovering them after exit.

### The AGENTS.md Learning Feedback Loop

After each iteration, the agent updates AGENTS.md (or progress.md) with learnings — gotchas, discovered constraints, patterns that work. This is a softer form of back-pressure: institutional memory that guides future iterations away from dead ends the current agent already explored.

## Ralph and the How-to-Ralph-Wiggum Playbook

Geoffrey Huntley's canonical methodology is documented in [ghuntley/how-to-ralph-wiggum](https://github.com/ghuntley/how-to-ralph-wiggum). The repository defines a **three-phase workflow**:

| Phase | Mode | Prompt file |
|-------|------|------------|
| 1. Define | Requirements / spec writing | `PROMPT_plan.md` |
| 2. Plan | Gap analysis, IMPLEMENTATION_PLAN generation | `PROMPT_plan.md` |
| 3. Build | Task-by-task autonomous coding | `PROMPT_build.md` |

Core files: `loop.sh` (orchestrator) + `AGENTS.md` (operational guide, ≤60 lines) + `IMPLEMENTATION_PLAN.md` (auto-updated task list) + `specs/NN-kebab-case.md` (requirements, one per job-to-be-done).

Various "hq-starter-kit" variants package this methodology with pre-written knowledge files (commonly 01-overview through 11-team-training-guide) covering topics like: methodology overview, PRD format, loop mechanics, evaluator design, back-pressure gates, multi-agent patterns, cost management, and team onboarding. The exact file set varies by implementation; no single canonical "hq-starter-kit" repo was found in public sources as of 2026-03-20.

## Sources

- [Geoffrey Huntley — everything is a ralph loop](https://ghuntley.com/loop/)
- [Geoffrey Huntley — don't waste your back pressure](https://ghuntley.com/pressure/)
- [LinearB — Mastering Ralph loops](https://linearb.io/blog/ralph-loop-agentic-engineering-geoffrey-huntley)
- [LinearB — Ralph loops make agentic coding reliable](https://linearb.io/blog/dex-horthy-humanlayer-rpi-methodology-ralph-loop)
- [Dev Interrupted — Inventing the Ralph Wiggum Loop (podcast)](https://linearb.io/dev-interrupted/podcast/inventing-the-ralph-wiggum-loop)
- [Alibaba Cloud — From ReAct to Ralph Loop](https://www.alibabacloud.com/blog/from-react-to-ralph-loop-a-continuous-iteration-paradigm-for-ai-agents_602799)
- [DEV Community — 2026: The year of the Ralph Loop Agent](https://dev.to/alexandergekov/2026-the-year-of-the-ralph-loop-agent-1gkj)
- [GitHub — snarktank/ralph](https://github.com/snarktank/ralph)
- [GitHub — how-to-ralph-wiggum](https://github.com/ghuntley/how-to-ralph-wiggum)
- [GitHub — mikeyobrien/ralph-orchestrator](https://github.com/mikeyobrien/ralph-orchestrator)
