---
title: "CLI Working Directory Flags for Agent-Friendly Tools"
category: agent-tooling
tags: ["cli", "sandboxing", "production-patterns", "agent-architecture", "compound-commands", "agent-loop", "claude-code"]
source: "https://github.com/cli/cli/issues/2228, https://github.com/anthropics/claude-code/issues/28183, https://github.com/anthropics/claude-code/issues/28784, https://github.com/anthropics/claude-code/issues/11067, https://github.com/anthropics/claude-code/issues/12748, https://github.com/anthropics/claude-code/issues/28240, https://github.com/anthropics/claude-code/issues/19903, https://code.claude.com/docs/en/sandboxing, https://git-scm.com/docs/git"
confidence: 0.85
created_at: "2026-03-24T00:00:00Z"
updated_at: "2026-03-25T00:00:00Z"
---

CLI tools used by agents should accept a working-directory flag (`-C <dir>`) to eliminate `cd && command` compound patterns that trigger sandbox permission blocks.

## The Problem

Agent subprocesses (spawned via `claude -p`) inherit the parent shell's CWD — typically the repository root. Even when the agent's prompt says "run commands from `companies/ghq`", the LLM defaults to bare command execution from the inherited CWD. This leads to a cascade of failures:

1. Agent executes `bd search "query"` from repo root — fails (no `.beads/` directory)
2. Agent retries 3–7 times with slight variations
3. Agent discovers `cd companies/ghq && bd search "query"`
4. Compound command triggers sandbox permission blocks

### Why Compound Commands Break

Claude Code's sandbox evaluates compound commands (`cd /path && command`) as a single unit:

- **Permission matching fails**: The sandbox attributes the entire command to `cd` rather than the actual tool, causing incorrect prompts ([#28240](https://github.com/anthropics/claude-code/issues/28240))
- **Individually-allowed commands get blocked**: Even when both `cd` and `bd search` are individually permitted, their `&&` combination triggers a new permission prompt ([#28183](https://github.com/anthropics/claude-code/issues/28183))
- **Security hole**: A `Bash(cd:*)` allow rule matches the entire compound command, inadvertently allowing arbitrary execution after `&&` ([#28784](https://github.com/anthropics/claude-code/issues/28784))

### Why `cd` Doesn't Persist

Claude Code creates a new shell for each Bash invocation. The session CWD persists between calls, but `cd X && command Y` leaves it unchanged because `cd` wasn't the final command. Only `cd` as the last/only command in a Bash call updates the session CWD.

### Root Causes

| Cause | Details |
|-------|---------|
| **CWD inheritance** | `claude -p` inherits the parent's CWD with no built-in mechanism to override |
| **Prompt compliance gap** | LLMs frequently ignore CWD instructions in prompts — unreliable for enforcement |
| **Compound command friction** | `cd && command` triggers sandbox evaluation as a single unit |
| **No `--cwd` on Task/Agent tools** | Subagents don't support a `cwd` parameter ([#12748](https://github.com/anthropics/claude-code/issues/12748)) |

## The Solution: `-C` / `--dir` Flag

Add a persistent (global) flag that changes the tool's working directory before execution, following established CLI precedent:

| Tool | Flag | Description |
|------|------|-------------|
| `git` | `-C <path>` | Run as if started in `<path>` |
| `gh` (GitHub CLI) | `--repo OWNER/REPO` | Target repo without cd |
| `tar` | `-C <dir>` | Change to directory before operation |
| `make` | `-C <dir>` | Change to directory before reading makefiles |

### Implementation in Go/Cobra

```go
var rootDir string

func init() {
    rootCmd.PersistentFlags().StringVarP(&rootDir, "dir", "C", "", "run as if started in DIR")
    rootCmd.PersistentPreRunE = func(cmd *cobra.Command, args []string) error {
        if rootDir != "" {
            return os.Chdir(rootDir)
        }
        return nil
    }
}
```

Using `PersistentPreRunE` on the root command ensures every subcommand inherits the flag.

## Agent-Side Workarounds (Without CLI Changes)

### 1. Wrapper Scripts (Recommended)

Create a wrapper that handles `cd` internally:

```bash
#!/usr/bin/env bash
# companies/ghq/tools/bd-wrapper.sh
cd "$(dirname "$0")/../.." && exec bd "$@"
```

The agent calls `./companies/ghq/tools/bd-wrapper.sh search "query"` — a single command that the permission system can match cleanly. This is the GHQ pattern: tools like `ask-claude.sh` and `reindex.ts` all resolve their own working directory internally.

### 2. Set CWD in the Subprocess Executor

```bash
# In the executor script
(cd companies/ghq && claude -p "$prompt")
```

The subshell runs in a child process, so the parent's CWD is unaffected.

### 3. `env -C` (GNU coreutils 8.28+, Linux only)

```bash
env -C companies/ghq bd search "query"
```

Single command, no `&&`. Not available on macOS (BSD `env` lacks `-C`). See [env-chdir-cross-platform.md](../tools/env-chdir-cross-platform.md).

### 4. Prompt Chaining: Research Then Execute

Split the agent into two phases:
1. **Phase 1**: Gather context (reads, searches) — CWD doesn't matter
2. **Phase 2**: Execute commands with explicit CWD instruction and pre-loaded context

### 5. PreToolUse Hook for Compound Commands

Install a hook that decomposes compound commands (`&&`, `||`, `;`) into individual sub-commands and checks each against permission rules separately.

## Recommendation for GHQ

**Short-term**: Use wrapper scripts and set CWD in subprocess executors. Add allow rules for wrapper scripts:
```json
{ "permissions": { "allow": ["Bash(./companies/ghq/tools/bd-wrapper.sh *)"] } }
```

**Long-term**: Make `bd` accept `-C <dir>` or `BEADS_DIR` env var so it's fully CWD-independent.

Prompt-level CWD instructions should be treated as a **hint**, not a guarantee. The execution environment must enforce the correct CWD. Avoid documenting `cd && command` patterns in prompts — agents copy them verbatim and hit permission blocks.

## See Also

- [env-chdir-cross-platform.md](../tools/env-chdir-cross-platform.md) — `env -C` availability across platforms
- [sandbox-safe-agent-patterns.md](../ai-agents/sandbox-safe-agent-patterns.md) — broader sandbox workarounds including heredoc issues
- [sandbox-command-validation-false-positives.md](../ai-agents/sandbox-command-validation-false-positives.md) — quote/brace heuristic failures
