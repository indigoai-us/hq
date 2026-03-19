---
title: "Running Claude Code CLI as a Subprocess via --print"
category: tools
tags: ["claude-code", "cli", "automation", "shell-scripting", "agent-architecture"]
source: conversation
confidence: 0.9
created_at: "2026-03-19T00:00:00Z"
updated_at: "2026-03-19T16:00:00Z"
---

The Claude Code CLI can be invoked as a subprocess from shell scripts using `claude --print` (or `-p`) mode. This runs Claude non-interactively: it takes a prompt, produces output to stdout, and exits — no REPL, no interactive UI. This is useful for building automation pipelines, hook scripts, or batch processing workflows where you need Claude's intelligence without human interaction.

## Key Flags

- `--print` / `-p`: Non-interactive mode. Reads prompt, writes response to stdout, exits.
- `--output-format json`: Returns structured JSON instead of plain text (useful for parsing).
- `--model`: Override the default model for the subprocess invocation.
- `--max-turns`: Limit agentic turns (default is unlimited in print mode).
- `--allowedTools`: Restrict which tools the subprocess can use.
- `--disallowedTools`: Block specific tools.
- `--permission-mode`: Control permission level (e.g., `plan`, `autoEdit`, `fullAuto`).

## Usage Pattern

```bash
# Simple one-shot prompt
claude -p "Summarize this file" < input.txt

# Piping prompts
echo "What is 2+2?" | claude -p

# JSON output for scripting
claude -p --output-format json "List the exports in src/index.ts"

# From within a Claude Code hook or script
result=$(claude -p --max-turns 3 "Check if tests pass")
```

## Gotchas

- **Nesting guard**: Claude Code sets a `CLAUDECODE` env var. Running `claude` from within a session fails with "cannot be launched inside another Claude Code session." Fix: `unset CLAUDECODE` before invoking the subprocess.
- Running `claude` from within a Claude Code session spawns a **separate process** with its own context — it does not share the parent session's conversation history or MCP servers.
- The subprocess inherits the working directory and environment variables of the parent shell.
- Be mindful of token costs — each `--print` invocation is a full API call.
- Use `--max-turns 1` to prevent the subprocess from entering agentic loops when you only need a single response.

## GHQ's ask-claude.sh Wrapper

GHQ wraps the raw CLI in `scripts/ask-claude.sh`, a production-ready script that solves three key problems:

1. **Final-answer-only output**: Always fetches `--output-format json` internally, then extracts `.result` via `jq -r '.result // empty'`. This strips all intermediate tool-use noise and returns only the final answer text. Use `-j` flag to get the full JSON instead.
2. **Self-recursion guard**: Uses `--disallowedTools "Bash(./scripts/ask-claude.sh*)" "Bash(ask-claude*)"` to prevent the subprocess from calling itself, avoiding infinite loops.
3. **CLAUDECODE env guard**: Runs `unset CLAUDECODE` before invoking `claude`, bypassing the nesting detection that would otherwise block subprocess invocation.

### Enforcing Subprocess Over Subagents

The GHQ setup enforces `ask-claude.sh` as the only delegation mechanism through three layers:

- **settings.local.json**: `"deny": ["Agent"]` — the harness blocks the Agent tool before it reaches Claude.
- **CLAUDE.md**: Documents the "Subprocess, Not Subagents" rule with usage examples.
- **MCP limitation**: Subagents cannot access the parent session's MCP servers, making them useless for tasks that need MCP tools (Slack, Sentry, Gmail, etc.). The main session must call MCP tools directly.

This pattern gives full control over model selection, tool access, and turn limits while keeping the main session's context window clean.
