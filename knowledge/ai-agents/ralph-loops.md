---
title: "Ralph Loops"
category: ai-agents
tags: ["agent-loop", "autonomous-coding", "iteration-pattern", "context-management"]
source: web research
confidence: 0.85
created_at: 2026-03-19T18:00:00Z
updated_at: 2026-03-19T18:00:00Z
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

## Sources

- [Geoffrey Huntley — everything is a ralph loop](https://ghuntley.com/loop/)
- [LinearB — Mastering Ralph loops](https://linearb.io/blog/ralph-loop-agentic-engineering-geoffrey-huntley)
- [Dev Interrupted — Inventing the Ralph Wiggum Loop (podcast)](https://linearb.io/dev-interrupted/podcast/inventing-the-ralph-wiggum-loop)
- [Alibaba Cloud — From ReAct to Ralph Loop](https://www.alibabacloud.com/blog/from-react-to-ralph-loop-a-continuous-iteration-paradigm-for-ai-agents_602799)
- [DEV Community — 2026: The year of the Ralph Loop Agent](https://dev.to/alexandergekov/2026-the-year-of-the-ralph-loop-agent-1gkj)
- [GitHub — snarktank/ralph](https://github.com/snarktank/ralph)
- [GitHub — how-to-ralph-wiggum](https://github.com/ghuntley/how-to-ralph-wiggum)
