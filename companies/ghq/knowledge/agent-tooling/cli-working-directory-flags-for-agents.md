---
title: "CLI Working Directory Flags for Agent-Friendly Tools"
category: agent-tooling
tags: ["cli", "sandboxing", "production-patterns", "agent-architecture", "compound-commands"]
source: "https://github.com/cli/cli/issues/2228, https://github.com/anthropics/claude-code/issues/28183, https://github.com/anthropics/claude-code/issues/28784, https://git-scm.com/docs/git"
confidence: 0.85
created_at: "2026-03-24T00:00:00Z"
updated_at: "2026-03-24T00:00:00Z"
---

CLI tools used by agents should accept a working-directory flag (`-C <dir>`) to eliminate `cd && command` compound patterns that trigger sandbox permission blocks.

## The Problem

Claude Code's sandbox evaluates compound commands (`cd /path && bd search ...`) as a single unit. This creates two issues:

1. **Permission matching fails**: The sandbox may attribute the entire command to `cd` rather than the actual tool, causing incorrect permission prompts (see [anthropics/claude-code#28240](https://github.com/anthropics/claude-code/issues/28240)).
2. **Individually-allowed commands get blocked**: Even when both `cd` and `bd search` are individually permitted, their combination via `&&` may trigger a new permission prompt (see [anthropics/claude-code#28183](https://github.com/anthropics/claude-code/issues/28183)).
3. **Agent retry waste**: Agents burn 5-7 tool calls trying variations of `cd + command` before succeeding or giving up.

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

## Agent-Side Mitigation (Without CLI Changes)

If the CLI can't be modified, agents can work around compound-command blocks:

1. **Wrapper scripts**: A shell script that accepts a directory argument and calls `cd` internally — the agent invokes a single command, not a compound one.
2. **`env -C` (GNU coreutils 8.28+)**: `env -C /path bd search "query"` — single command, no `&&`.
3. **`pushd`/`subshell`**: `(cd /path && bd search "query")` — subshell isolates the cd, though this is still compound.

## Design Recommendation for bd

`bd` should accept `-C <dir>` as a global flag that sets the working directory before resolving `.beads/`. This would:

- Eliminate all `cd && bd` patterns in agent templates
- Allow simple permission rules like `Bash(bd:*)` to work without compound-command complications
- Follow the same convention as `git -C`, which agents already use fluently
