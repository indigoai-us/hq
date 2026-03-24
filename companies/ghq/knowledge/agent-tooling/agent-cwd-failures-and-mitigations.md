---
title: "Agent CWD Failures: Why Subprocesses Miss the Right Working Directory"
category: agent-tooling
tags: ["cli", "sandboxing", "agent-loop", "claude-code", "production-patterns", "agent-architecture"]
source: "https://github.com/anthropics/claude-code/issues/11067, https://github.com/anthropics/claude-code/issues/12748, https://github.com/anthropics/claude-code/issues/28183, https://github.com/anthropics/claude-code/issues/28240, https://github.com/anthropics/claude-code/issues/28784"
confidence: 0.8
created_at: "2026-03-24T18:00:00Z"
updated_at: "2026-03-24T18:00:00Z"
---

Agent subprocesses default to the repo root CWD, not the directory their prompts specify.

## The Problem

When a reviewer or worker agent is spawned as a `claude -p` subprocess, it inherits the parent shell's working directory — typically the repository root. Even when the agent's prompt explicitly says "run commands from `companies/ghq`", the LLM defaults to executing bare commands (like `bd search`) from the inherited CWD. This leads to repeated failures where the CLI tool can't find its config or data directory.

### Observed Pattern

1. Agent prompt says: "Run bd commands from `companies/ghq`"
2. Agent executes: `bd search "query"` (from repo root)
3. `bd` fails — no `.beads/` directory at repo root
4. Agent retries 3–7 times with slight variations before discovering `cd companies/ghq && bd search "query"`
5. Compound command triggers sandbox permission prompts or blocks

## Root Causes

| Cause | Details |
|-------|---------|
| **CWD inheritance** | `claude -p` inherits the parent's CWD. The subprocess has no built-in mechanism to set a different working directory. |
| **Prompt compliance gap** | LLMs frequently ignore CWD instructions in prompts, defaulting to bare command execution. Prompt-level instructions are not reliable for enforcing CWD. |
| **Compound command friction** | `cd /path && command` is the natural workaround but triggers Claude Code's compound command permission evaluation, which can block or repeatedly prompt for `cd:*`. |
| **No `--cwd` flag on Task/Agent tools** | Claude Code subagents and the Task tool don't support a `cwd` parameter (tracked in issue #12748). |

## Mitigation Strategies

### 1. Make the CLI CWD-Independent (Recommended)

Add a `--dir` / `-C` flag or `BEADS_DIR` environment variable to the CLI tool so it can operate from any directory:

```bash
# Flag approach (like git -C)
bd -C companies/ghq search "query"

# Environment variable approach
BEADS_DIR=companies/ghq bd search "query"
```

This follows the standard Cobra/Viper pattern: flags > env vars > config file > defaults. It eliminates the CWD dependency entirely and avoids compound command issues.

### 2. Set CWD in the Subprocess Executor

Wrap the `claude -p` invocation to run from the correct directory:

```bash
# In the executor script
(cd companies/ghq && claude -p "$prompt")
```

The subshell `(cd ... && ...)` runs in a child process, so the parent's CWD is unaffected. This is reliable but requires the executor to know the target directory.

### 3. Prompt Chaining: Research Phase Then Execute Phase

Split the agent into two phases:
1. **Phase 1**: Gather context (reads, searches) — CWD doesn't matter
2. **Phase 2**: Execute commands with an explicit CWD instruction and the context from phase 1 pre-loaded

This reduces the window where CWD matters and gives the agent fewer opportunities to forget.

### 4. PreToolUse Hook for Compound Commands

Install a hook that decomposes compound commands (`&&`, `||`, `;`) into individual sub-commands and checks each against permission rules separately. This prevents the `cd:*` permission prompt from blocking the actual command.

## Recommendation

For GHQ specifically, the best approach is a combination:

1. **Short-term**: Set CWD in the subprocess executor (`ask-claude.sh` or equivalent) before spawning the agent
2. **Long-term**: Make `bd` accept `BEADS_DIR` or `--dir` so it's fully CWD-independent, following the Go CLI convention of `git -C <path>`

Prompt-level CWD instructions should be treated as a **hint**, not a guarantee. The execution environment must enforce the correct CWD.
