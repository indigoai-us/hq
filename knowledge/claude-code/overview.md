---
title: "Claude Code Overview"
category: claude-code
tags: ["cli", "agentic-coding", "mcp", "agent-sdk", "developer-tools"]
source: "web research"
confidence: 0.85
created_at: 2026-03-19T00:41:00Z
updated_at: 2026-03-19T00:41:00Z
---

Anthropic's agentic coding tool — reads codebases, edits files, runs commands, and connects to external services.

## What It Is

Claude Code is an AI-powered development tool that operates as a CLI, IDE extension, desktop app, and browser interface. It understands full codebases and executes multi-step tasks through natural language: reading files, writing changes, running shell commands, managing git workflows, and iterating until completion.

As of February 2026, approximately 4% of public GitHub commits (~135,000/day) are authored via Claude Code.

## Core Capabilities

| Capability | Description |
|---|---|
| Codebase understanding | Reads and reasons about entire projects |
| Multi-file editing | Creates, modifies, and deletes files across a project |
| Shell execution | Runs arbitrary commands with user permission controls |
| Git workflows | Commits, branches, PRs, rebases — full git integration |
| MCP integration | Connects to 300+ external services via Model Context Protocol |
| Subagents | Delegates specialized tasks to child agents |
| Hooks | Lifecycle event system for automation (see `hooks.md`) |
| Skills | Organized instruction sets Claude loads dynamically |

## Models

| Model | ID | Notes |
|---|---|---|
| Opus 4.6 | `claude-opus-4-6` | Most capable, 1M context |
| Sonnet 4.6 | `claude-sonnet-4-6` | Balanced, improved agentic search |
| Haiku 4.5 | `claude-haiku-4-5-20251001` | Fastest, lowest cost |

All models support extended thinking and up to 1M token context windows.

## Configuration Files

| File | Purpose |
|---|---|
| `CLAUDE.md` | Project instructions (checked into repo) |
| `~/.claude/CLAUDE.md` | Global user instructions |
| `.claude/settings.json` | Project settings, hooks, permissions |
| `.claude/settings.local.json` | Local overrides (gitignored) |
| `.mcp.json` | MCP server configuration (project root) |

## MCP (Model Context Protocol)

MCP is an open protocol that lets Claude Code connect to external tools, databases, and APIs. Claude Code acts as an MCP client connecting to MCP servers. It can also act as an MCP server itself (`claude mcp serve`).

**Transport types:**
- **stdio** — local processes, best for tools needing direct system access
- **HTTP** — remote servers (recommended for cloud services)

**Configuration:** defined in `.mcp.json` at project root (shared) with auth tokens in local config.

## Claude Agent SDK

Formerly "Claude Code SDK", renamed in late 2025. Provides the same agent loop, built-in tools, and context management that power Claude Code as a programmable library.

- **Python**: `claude-agent-sdk` on PyPI (v0.1.48+)
- **TypeScript**: `@anthropic-ai/claude-agent-sdk` on npm (v0.2.71+)
- Built-in: file operations, shell commands, web search, MCP integration
- Use case: building custom agents (finance, support, assistants) with Claude Code's infrastructure

## Permission Model

Claude Code uses a tiered permission system:
1. Read-only tools (Read, Glob, Grep) — generally auto-allowed
2. Write tools (Edit, Write, Bash) — require user approval or pre-configuration
3. MCP tools — follow the same approval flow
4. Hooks can auto-approve or block specific tools via `PermissionRequest` events

## Sources

- [Claude Code Overview — Official Docs](https://code.claude.com/docs/en/overview)
- [Claude Code CLI Guide — Introl](https://introl.com/blog/claude-code-cli-comprehensive-guide-2025)
- [Claude Agent SDK Overview — API Docs](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Claude Code MCP Servers — Builder.io](https://www.builder.io/blog/claude-code-mcp-servers)
- [Claude Code Complete Guide 2026](https://www.jitendrazaa.com/blog/ai/claude-code-complete-guide-2026-from-basics-to-advanced-mcp-2/)
