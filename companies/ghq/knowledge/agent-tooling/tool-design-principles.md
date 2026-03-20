---
title: "Tool Design Principles for Autonomous Agents"
category: agent-tooling
tags: ["tool-design", "mcp", "function-calling", "api-design", "error-handling", "agent-loop", "production-patterns"]
source: "blueprint, https://www.anthropic.com/engineering/writing-tools-for-agents, https://arxiv.org/html/2602.14878v2, https://medium.com/@pyneuronaut/the-mcp-revolution-how-tool-granularity-can-make-or-break-your-ais-performance-and-cost-d9b5a66182b3, https://thenewstack.io/15-best-practices-for-building-mcp-servers-in-production/, https://blog.arcade.dev/mcp-tool-patterns"
confidence: 0.9
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T19:42:00Z
---

Tools are an agent's hands — they determine what the agent can actually do. Poorly designed tools are the most common cause of agent failure, more so than model capability.

## The Six Components of Effective Tool Descriptions

Research on 856 tools across 103 MCP servers found **97.1% contain at least one description smell**. The six components that most impact agent success:

| Component | What to Include | Impact |
|-----------|----------------|--------|
| **Purpose** | Clear one-liner: what the tool does | Prevents wrong-tool selection |
| **Guidelines** | When to use it, when NOT to use it | Reduces ambiguous calls |
| **Limitations** | Known constraints, edge cases, failure modes | Reduces retry loops |
| **Parameter Explanation** | Each input's role, format, valid values | Reduces parameter errors |
| **Length & Completeness** | Proportional to tool complexity | Prevents incomplete use |
| **Examples** | Correct usage patterns | Removable without major quality loss |

Adding these components yielded:
- **+5.85 percentage point** increase in task success rate
- **+15.12%** evaluator-level performance improvement
- (Tradeoff: +67% more execution steps — examples can be omitted to reduce this)

### Description Writing Rules

- **Lead with purpose**: AI agents may not read the full description — front-load the most important information.
- **Be explicit about implicit context**: Specialized query formats, niche terminology, required prefixes — document what a new hire wouldn't know.
- **Treat refinement as a dial**: Concrete example — when Claude's web search launched, appending "2025" to queries was causing biased results. A single description fix resolved it.

## Parameter Design

- **Unambiguous names**: `user_id` not `user`; `file_path` not `path`. Ambiguity causes hallucinated values.
- **Typed with constraints**: Use JSON Schema `enum`, `minimum`, `maximum`, `pattern` to constrain inputs.
- **Avoid optional parameter explosion**: > ~5 optional params causes decision paralysis. Bundle common combos into higher-level tools instead.
- **Structured over free-text**: Return typed JSON — agents parse structured output more reliably than prose.

## Tool Granularity

The granularity paradox: fine-grained atomic tools require more calls (more tokens, more errors); coarse-grained tools reduce flexibility.

### Decision Framework

Start atomic, then observe:

| Signal in traces | Action |
|-----------------|--------|
| High retry rates | Improve descriptions first |
| Repeated tool sequences (A → B → C always) | Bundle into a composite tool |
| Partial completions on multi-step ops | Add transaction boundary |
| Agent loops on a single operation | Add batch support |

**Target high-impact workflows**, not API parity. A `schedule_meeting` tool (finds availability + creates event) outperforms separate `list_free_slots` + `create_event` tools.

### Tool Overload

LLM performance degrades as the number of available tools grows. With > ~20 tools:
- Incorrect tool selection increases
- Parameter errors increase
- Reasoning capacity decreases

Mitigations: namespace tools by domain, enable/disable tool subsets per task context, use tool descriptions to steer away from wrong tools.

## Error Format

Errors should be **instructional, not diagnostic**:

- **Wrong**: Python traceback or raw exception message
- **Right**: "File not found: `config.yaml`. Expected at project root or `~/.config/`. Use `list_config_files()` to find available configs."

Rules:
1. **Return errors in the result object**, not as MCP protocol-level errors — lets the LLM see and handle them.
2. **State what failed** + **why** + **what to do next**
3. **Suggest the corrective tool call** when applicable — guides agents toward recovery without extra reasoning.
4. Implement contextual retry hints for transient failures (rate limits, timeouts).

## Composability

Tools should work like Unix pipes:
- **Consistent response shapes**: output of tool A is valid input for tool B
- **Batch support**: avoid forcing one-at-a-time loops
- **Multiple abstraction levels**: let the agent pick the right granularity

## MCP as the Standard

MCP is the dominant standard for agent-tool connectivity — a USB interface for AI tools. As of June 2025 the spec added `outputSchema` and `structuredContent` for typed outputs.

## Anti-Patterns

- Tools that require multi-step setup before they're usable
- Tools with dozens of optional parameters (decision paralysis)
- Tools that return megabytes of output (fills context window)
- Generic parameter names (`id`, `data`, `value`)
- Silent failures that return empty results instead of an error
- Tools without "when to use" and "when NOT to use" guidance
