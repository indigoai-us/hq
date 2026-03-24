---
title: "Preventing Hallucinated CLI Flags in Agent Templates"
category: agent-tooling
tags: ["agent-loop", "cli", "failure-modes", "prompt-optimization", "tool-design"]
source: "web research"
confidence: 0.8
created_at: "2026-03-24T18:30:00Z"
updated_at: "2026-03-24T18:30:00Z"
---

Agents repeatedly hallucinate invalid CLI flags (e.g. `bd children --short`) when templates don't enumerate valid options.

## The Problem

LLMs generate syntactically plausible but non-existent flags for CLI tools. This is a specific form of tool-use hallucination where the model invents parameters based on pattern matching from training data. Common patterns:

- **Plausible shorthand flags**: `--short`, `--brief`, `--quiet` added to commands that don't support them
- **Cross-tool contamination**: flags from `git` or `docker` applied to unrelated CLIs (e.g., `--format` where unsupported)
- **Nested flag invention**: fabricating `--output json` when the tool only supports `--json`

The root cause is that agents work from an internal probabilistic model of CLI conventions rather than from authoritative flag documentation.

## Mitigation Strategies

### 1. Exhaustive Flag Documentation in Templates (Most Effective)

Agent templates should include a **complete reference** of valid flags for every CLI command the agent is expected to use. Not just examples — the full flag inventory:

```markdown
## bd CLI Reference

### bd children <parent-id>
Valid flags: --json, --depth <n>, --status <status>
No other flags are supported. Do NOT use --short, --brief, or --format.
```

Explicitly listing disallowed flags ("Do NOT use X") is more effective than only listing allowed ones because it directly counters the most common hallucinations.

### 2. Schema-Level Enforcement (Strongest Guarantee)

When possible, use structured tool definitions (JSON Schema) instead of free-form CLI strings. Function-calling APIs validate arguments against schemas at generation time, making invalid flags structurally impossible.

For CLI-based tools, a wrapper that validates flags before execution provides the same benefit:

```bash
# Validate flags before passing to actual CLI
VALID_FLAGS="--json --depth --status"
for flag in "$@"; do
  [[ "$flag" == --* && ! " $VALID_FLAGS " =~ " $flag " ]] && {
    echo "ERROR: Unknown flag: $flag. Valid flags: $VALID_FLAGS" >&2
    exit 1
  }
done
```

### 3. Error-Recovery Prompting

Include instructions for how agents should handle unknown flag errors:

```markdown
If a CLI command returns "unknown flag" or similar error:
1. Do NOT retry with the same flag
2. Run `<tool> --help` to discover valid flags
3. Retry with only documented flags
```

### 4. Negative Examples in Few-Shot Prompts

Include explicit wrong-then-right examples:

```markdown
WRONG: bd children bd-a3f8 --short
RIGHT: bd children bd-a3f8 --json
```

## Recommendation for GHQ Agent Templates

1. **Add a CLI Reference section** to every agent template that uses `bd` or other CLIs. List valid subcommands and their flags exhaustively.
2. **Add a "Common Mistakes" section** listing frequently hallucinated flags with corrections.
3. **Consider CLI wrappers** that validate flags and return helpful error messages rather than cryptic failures.
4. **Use `--help` as fallback instruction** — teach agents to self-correct by reading help output when a flag fails.

## Sources

- [Lakera — Guide to LLM Hallucinations](https://www.lakera.ai/blog/guide-to-hallucinations-in-large-language-models)
- [Don't Prompt Your Agent for Reliability — Engineer It](https://www.aiyan.io/blog/engineer-agent-reliability/)
- [3 Patterns That Fix LLM API Calling — Stop Getting Hallucinated Parameters](https://dev.to/docat0209/3-patterns-that-fix-llm-api-calling-stop-getting-hallucinated-parameters-4n3b)
- [AI Agent Guardrails: Rules That LLMs Cannot Bypass](https://dev.to/aws/ai-agent-guardrails-rules-that-llms-cannot-bypass-596d)
- [Prevent Hallucinated Responses from any AI Agent](https://cleanlab.ai/blog/prevent-hallucinated-responses/)
