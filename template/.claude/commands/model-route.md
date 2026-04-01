---
description: Recommend optimal model (Opus 4.6 / Codex GPT-5.4 / Gemini) based on task type
allowed-tools: Read, AskUserQuestion
argument-hint: [task description]
visibility: public
---

# /model-route - Model Selection Guide

**All Claude work runs on Opus 4.6.** External models (Codex GPT-5.4, Gemini) handle their specific domains via CLI.

**Input:** $ARGUMENTS (task description, question, or work type)

## Step 1: Parse Input

If `$ARGUMENTS` is empty, ask:

**What are you trying to do? (Brief description or work type)**

## Step 2: Classify & Route

### Routing Table

| Task Type | Model | Why |
|-----------|-------|-----|
| **All Claude work** | Opus 4.6 | Sessions, sub-agents, workers, search, drafting, testing — everything |
| **Codex generation** | GPT-5.4 --reasoning high --fast | Code gen, scaffolding via Codex CLI |
| **Codex review/debug** | GPT-5.4 --reasoning high --fast | Independent code review, root-cause analysis |
| **Gemini workers** | Gemini (via CLI) | Design audit, frontend, CSS, UX — separate runtime |

### Decision Logic

1. **Is it Codex CLI work?** (code gen, second-opinion review, debugging) → **GPT-5.4 --reasoning high --fast**
2. **Is it a Gemini worker?** (design audit, CSS, UX) → **Gemini CLI**
3. **Everything else** → **Opus 4.6**

### Keyword Signals

**Opus signals (everything):** orchestrate, architect, review, debug, security, strategy, plan, evaluate, decide, analyze, search, explore, scaffold, draft, test, execute, build, deploy, content, social

**Codex signals:** codex, generate via codex, codex review, codex debug, second opinion

**Gemini signals:** gemini, design audit, visual diff, CSS specialist

## Step 3: Output Recommendation

```
RECOMMENDED MODEL: {Opus 4.6 | Codex GPT-5.4 | Gemini}

Task: "{task_description}"

Reasoning:
- {reason 1}
- {reason 2}

---

Model Reference:

| Model | Use Case | Approx Cost |
|-------|----------|-------------|
| Opus 4.6 | All Claude work (default, no exceptions) | $15/$75 per 1M tokens |
| GPT-5.4 (Codex) | Code gen, review, debugging via Codex CLI | ~$0.05–0.30/task |
| Gemini | Design/CSS/UX via Gemini CLI workers | Google pricing |

---

IMPLEMENTATION:

- Opus: default (CLAUDE_CODE_SUBAGENT_MODEL=opus) — never change
- Codex: use `/run codex-coder generate` or `/run codex-reviewer review`
- Gemini: use `/run gemini-{worker} {skill}`
```

## Rules

- **Recommendation only** — never enforces model choice
- **Opus is the only Claude model** — all sessions, sub-agents, workers use Opus 4.6
- **External models for their domains** — Codex for code gen/review, Gemini for design/CSS
- **Policy ref:** `.claude/policies/model-routing-opus-only.md`
- **No tool execution** — this command only analyzes and recommends
