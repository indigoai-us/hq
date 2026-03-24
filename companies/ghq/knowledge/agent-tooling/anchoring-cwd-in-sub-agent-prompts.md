---
title: "Anchoring CWD Awareness in Sub-Agent Prompts"
category: agent-tooling
tags: ["agent-orchestration", "claude-code", "context-management", "production-patterns"]
source: "web research"
confidence: 0.8
created_at: "2026-03-25T00:00:00Z"
updated_at: "2026-03-25T00:00:00Z"
---

Sub-agents spawned via `claude -p` reliably lose CWD context; prompt-level instructions alone are insufficient — enforce CWD at the execution layer.

## The Problem

When a parent agent spawns a sub-agent via `claude -p`, the subprocess inherits the parent's CWD. Even when the prompt explicitly states "you are working in `companies/ghq`", the LLM defaults to executing bare commands from the inherited CWD. This causes 3–7 wasted tool calls as the agent tries path variations before self-correcting.

Key observation: LLMs treat CWD instructions as advisory, not binding. The execution environment must enforce what prompts cannot.

## Anchoring Techniques (Ranked by Reliability)

### 1. Set CWD at the Executor Level (Most Reliable)

Change directory before spawning the subprocess:

```bash
# Subshell approach — parent CWD unaffected
(cd companies/ghq && claude -p "$prompt")

# Or use env -C (GNU coreutils 8.28+ / macOS 15+)
env -C companies/ghq claude -p "$prompt"
```

The `--cwd` flag for `claude` CLI is tracked as a [feature request](https://github.com/anthropics/claude-code/issues/26287) but not yet available. When it ships, this becomes the cleanest option:

```bash
claude --cwd companies/ghq -p "$prompt"
```

### 2. Structured CWD Block in Prompt Preamble

Place a machine-readable CWD declaration at the very top of the prompt, before any task instructions:

```
## Environment
- WORKING_DIRECTORY: /Users/me/repos/ghq/companies/ghq
- All file paths are relative to this directory
- Run `pwd` as your first command to confirm your location

## Task
...
```

This works because:
- **Primacy effect**: Instructions at the top of context get higher attention weight
- **Explicit verification step**: Asking the agent to run `pwd` first creates a feedback loop that corrects drift
- **Structured format**: Machine-readable blocks are followed more reliably than prose instructions

### 3. Inject `pwd` as the First Command

Include a mandatory `pwd` verification as the first action in the prompt:

```
Before starting any work:
1. Run `pwd` to confirm your current directory
2. If you are NOT in `companies/ghq`, run `cd companies/ghq` first
3. Then proceed with the task
```

This is less reliable than executor-level CWD setting but catches cases where the executor can't be modified.

### 4. Use Absolute Paths in All References

Eliminate CWD dependency entirely by using absolute paths in the prompt:

```
Search the knowledge base:
  qmd search "query" -c ghq

NOT:
  cd companies/ghq && qmd search "query"
```

When tools support `-C <dir>` or `--dir` flags, use those instead of relying on CWD.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Prose-only CWD instructions | "You are working in X" is treated as context, not a command — ignored ~60% of the time |
| CWD instructions buried mid-prompt | Attention drops in the middle of long prompts; CWD instructions get lost |
| Relying on `CLAUDE.md` for CWD | CLAUDE.md provides project context but doesn't override the inherited CWD |
| Multiple `cd` commands in sequence | Each Bash tool call resets to the inherited CWD; `cd` doesn't persist between calls |

## Recommendation for GHQ

The `ask-claude.sh` executor should:

1. **Accept a `-d <dir>` flag** to set the sub-agent's working directory
2. **Default to the caller's CWD** (not the repo root) when no flag is provided
3. **Inject a CWD verification block** at the top of every prompt as a safety net:
   ```
   WORKING_DIRECTORY=$(pwd)
   echo "## Environment\n- CWD: $WORKING_DIRECTORY" | cat - <(echo "$prompt")
   ```

This layered approach (executor-level CWD + prompt-level verification) eliminates the class of errors observed in agent runs.

## Sources

- [Claude Code --cwd Feature Request](https://github.com/anthropics/claude-code/issues/26287)
- [SDK CWD Propagation Fix](https://github.com/anthropics/claude-code-sdk-python/pull/136)
- [ExitPlanMode CWD Bug](https://github.com/anthropics/claude-code/issues/22343)
- [Addy Osmani: Stop Using /init for AGENTS.md](https://addyosmani.com/blog/agents-md/)
- [Claude Code System Prompts](https://github.com/Piebald-AI/claude-code-system-prompts)
