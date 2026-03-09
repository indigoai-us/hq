---
description: Recommend optimal Claude model (haiku/sonnet/opus) based on task type
allowed-tools: Read, AskUserQuestion
argument-hint: [task description]
visibility: public
---

# /model-route - Model Selection Guide

Recommend the optimal Claude model for your task based on complexity, reasoning needs, and cost.

**Input:** $ARGUMENTS (task description, question, or work type)

## Step 1: Parse Input

If `$ARGUMENTS` is empty, go to Step 2 (interview).

If `$ARGUMENTS` is provided (≥5 words):
- Use as task description
- Skip to Step 3 (routing decision)

Otherwise, ask one question in Step 2.

## Step 2: Gather Task Context

If needed, ask:

**What are you trying to do? (Brief description or work type)**

Examples:
- "Search for auth middleware patterns in the codebase"
- "Debug a TypeScript error in the React component"
- "Design the architecture for a new microservice"
- "Review code for security vulnerabilities"

## Step 3: Classify Task & Route

Read the task description and classify by **primary work type**:

### Routing Table

| Task Type | Recommended Model | Reasoning | Example Cost per Task |
|-----------|-------------------|-----------|----------------------|
| **Exploration/Search** | Haiku | Fast retrieval, no complex reasoning needed | $0.01–0.05 |
| **Simple transforms** | Haiku | Code generation, formatting, simple edits | $0.02–0.10 |
| **File reading/summarization** | Haiku | Parse existing code, extract info | $0.01–0.05 |
| **Coding/Debugging** | Sonnet | Standard development work, refactoring, testing | $0.10–0.50 |
| **Code review/Analysis** | Sonnet | Pattern matching, style issues, best practices | $0.05–0.30 |
| **Feature design** | Sonnet | API design, component specs, workflow planning | $0.10–0.40 |
| **Architecture/Systems** | Opus | Complex tradeoffs, multi-layer reasoning | $1.00–5.00 |
| **Security analysis** | Opus | Threat modeling, vulnerability analysis | $0.50–3.00 |
| **Complex reasoning** | Opus | Multi-step logic, edge cases, novel problems | $1.00–5.00 |
| **Research/Decisions** | Opus | Synthesizing options, novel approaches | $0.50–3.00 |

**Decision logic:**
1. Scan for keywords: search/read/explore → Haiku; code/debug/refactor → Sonnet; architecture/security/novel → Opus
2. If task involves 3+ reasoning layers → Opus
3. If task is bounded and well-defined → Haiku or Sonnet
4. If task requires justifying tradeoffs or novel thinking → Opus
5. If cost is primary concern and task is simple → prefer Haiku

### Keywords Reference

**Haiku signals:** search, find, read, summarize, extract, list, enumerate, simple, straightforward, transform

**Sonnet signals:** code, build, fix, refactor, test, review, implement, API, component, pattern

**Opus signals:** architecture, design system, security, threat, novel, complex, tradeoff, research, strategy, reasoning

## Step 4: Output Recommendation

Print model recommendation with reasoning:

```
RECOMMENDED MODEL: {haiku|sonnet|opus}

Task: "{task_description}"

Reasoning:
- {reason 1}
- {reason 2}
- {reason 3}

---

Model Comparison:

| Model   | Latency | Cost    | Best For |
|---------|---------|---------|----------|
| Haiku   | ~200ms  | $0.01   | Exploration, file reading, simple transforms |
| Sonnet  | ~1s     | $0.10   | Coding, debugging, standard dev work |
| Opus    | ~3s     | $1.00   | Architecture, security, novel reasoning |

---

ENV VAR EXPORT (copy & paste):

export CLAUDE_MODEL=claude-{model}-4-{version}-{date}
export CLAUDE_THINKING_BUDGET=10000   # or adjust for task
export CLAUDE_SUBAGENT_MODEL=haiku    # always use haiku for sub-agents

---

COST OPTIMIZATION TIPS:

1. Use Haiku for exploration/search before Sonnet work
2. Prefer Sonnet for standard coding (cheaper than Opus)
3. Reserve Opus for truly novel/complex reasoning
4. Use extended thinking sparingly (MAX_THINKING_TOKENS=10000)
5. Batch related sub-tasks with same model to amortize setup

```

## Step 5: Offer Follow-Up

Print additional guidance:

```
NEXT STEPS:

- `/model {model}`              → Switch to recommended model in current session
- `claude code --model {model}` → Start new session with model
- `/quality-gate`               → Pre-commit quality checks (use Sonnet)
- `/tdd`                        → Test-driven workflow (use Sonnet)

Questions?
- Cost breakdown: See cost table above
- Subagent routing: Always use Haiku (set in .claude/settings.json)
- Thinking budget: MAX_THINKING_TOKENS=10000 (caps reasoning cost ~70%)
```

## Worked Example

**Input:** "I need to explore the VYG codebase to understand how auth middleware is structured"

**Output:**

```
RECOMMENDED MODEL: Haiku

Task: "I need to explore the VYG codebase to understand how auth middleware is structured"

Reasoning:
- Primary task is exploration/search (understand structure, not modify)
- Bounded scope: specific module (auth middleware)
- Fast iteration preferred: reading files, asking questions, pivot as needed
- Cost-sensitive: exploration is throwaway work

---

Model Comparison:

| Model   | Latency | Cost    | Best For |
|---------|---------|---------|----------|
| Haiku   | ~200ms  | $0.01   | Exploration, file reading, simple transforms |
| Sonnet  | ~1s     | $0.10   | Coding, debugging, standard dev work |
| Opus    | ~3s     | $1.00   | Architecture, security, novel reasoning |

---

ENV VAR EXPORT (copy & paste):

export CLAUDE_MODEL=claude-haiku-4-5-20251001
export CLAUDE_THINKING_BUDGET=10000
export CLAUDE_SUBAGENT_MODEL=haiku

---

COST OPTIMIZATION TIPS:

1. Use Haiku for exploration/search before Sonnet work
2. Prefer Sonnet for standard coding (cheaper than Opus)
3. Reserve Opus for truly novel/complex reasoning
4. Use extended thinking sparingly (MAX_THINKING_TOKENS=10000)
5. Batch related sub-tasks with same model to amortize setup

---

NEXT STEPS:

- `claude code --model haiku` → Start exploration session with Haiku
- Read: repos/private/vyg/apps/function/src/ (Lambda code location)
- Search: qmd vsearch "auth middleware VYG" (explore first)
```

---

**Second Example Input:** "Design a new DynamoDB schema for storing user sessions and recovery tokens"

**Output:**

```
RECOMMENDED MODEL: Opus

Task: "Design a new DynamoDB schema for storing user sessions and recovery tokens"

Reasoning:
- Complex tradeoff analysis needed: schema design → affects queries, costs, scaling
- Multiple layers of reasoning: data types, access patterns, TTLs, indexing strategy
- Novel thinking: how to balance recovery token lifecycle with session expiration
- High-impact decision: poor schema causes scaling/performance issues later

---

Model Comparison:

| Model   | Latency | Cost    | Best For |
|---------|---------|---------|----------|
| Haiku   | ~200ms  | $0.01   | Exploration, file reading, simple transforms |
| Sonnet  | ~1s     | $0.10   | Coding, debugging, standard dev work |
| Opus    | ~3s     | $1.00   | Architecture, security, novel reasoning |

---

ENV VAR EXPORT (copy & paste):

export CLAUDE_MODEL=claude-opus-4-6
export CLAUDE_THINKING_BUDGET=20000  # increase for complex reasoning
export CLAUDE_SUBAGENT_MODEL=haiku

---

COST OPTIMIZATION TIPS:

1. Use Haiku for exploration/search before Sonnet work
2. Prefer Sonnet for standard coding (cheaper than Opus)
3. Reserve Opus for truly novel/complex reasoning
4. Use extended thinking sparingly (MAX_THINKING_TOKENS=10000)
5. Batch related sub-tasks with same model to amortize setup

---

NEXT STEPS:

- `claude code --model opus` → Start design session with Opus
- `/quality-gate`            → Pre-commit review (use Sonnet when implementing)
- Document findings as: companies/{company}/knowledge/dynamodb-session-schema.md
```

## Rules

- **Recommendation only** — command never enforces model choice, only suggests
- **Cost awareness** — always include cost estimates in output
- **Subagent default** — always mention CLAUDE_SUBAGENT_MODEL=haiku (set in settings.json)
- **Thinking budget** — MAX_THINKING_TOKENS=10000 is the default cost cap
- **Task-driven** — model choice depends on work type, not cwd or repo
- **Exportable format** — output includes copy-paste env var export for convenience
- **No tool execution** — this command only analyzes and recommends; doesn't switch models

## Cost Reference

Approximate costs per million tokens (Feb 2026):

| Model | Input | Output | Ratio |
|-------|-------|--------|-------|
| Haiku | $0.25 | $1.25 | 1:5 |
| Sonnet | $3.00 | $15.00 | 1:5 |
| Opus | $15.00 | $75.00 | 1:5 |

**Example task costs (rough):**
- Haiku exploration (5K tokens): $0.03
- Sonnet coding (20K tokens): $0.45
- Opus architecture (50K tokens): $2.00

Use `/model-route` before starting expensive tasks to avoid cost surprises.
