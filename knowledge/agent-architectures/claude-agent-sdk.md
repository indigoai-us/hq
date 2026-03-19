---
title: "Claude Agent SDK: Architecture, Abstractions, and Framework Comparison"
tags: [claude-code, agent-loop, production-patterns, mcp, comparison, context-management]
category: agent-architectures
source: https://platform.claude.com/docs/en/agent-sdk/overview, https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk, https://letsdatascience.com/blog/ai-agent-frameworks-compared, https://mcp-server-langgraph.mintlify.app/comparisons/vs-claude-agent-sdk
confidence: 0.92
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

The Claude Agent SDK exposes the same agent loop, tool execution, and context management that power Claude Code as a programmable library (Python + TypeScript).

Formerly the "Claude Code SDK", renamed in late 2025. Install: `pip install claude-agent-sdk` / `npm install @anthropic-ai/claude-agent-sdk`.

## Core Abstractions

### Two Entry Points

| Interface | Use case |
|-----------|----------|
| `query()` | Standalone async iterator; simple fire-and-iterate usage |
| `ClaudeSDKClient` | Class with session state management; enables custom tools and hooks |

Both support the full feature set (tools, hooks, MCP, subagents, streaming).

### Built-in Tools

Out of the box without any implementation: `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `WebSearch`, `WebFetch`, `AskUserQuestion`, `Agent` (subagents), `NotebookEdit`.

`allowed_tools` / `allowedTools` whitelist controls exactly which tools the agent may use.

### Custom Tools

Defined as plain Python/TypeScript functions; run as in-process MCP servers (no separate process). This eliminates the latency and complexity of external MCP server processes.

```python
from claude_agent_sdk import ClaudeSDKClient

async def get_weather(city: str) -> str:
    return f"72°F in {city}"

client = ClaudeSDKClient(custom_tools=[get_weather])
```

### Hooks

Callback functions injected at lifecycle points — run in application process, not inside the agent's context window (so they consume no tokens).

Key hooks: `PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`, `SessionEnd`, `UserPromptSubmit`.

`PreToolUse` hooks can short-circuit the agent loop (block dangerous operations). `PostToolUse` hooks are useful for audit logging.

### Subagents

Spawned via the `Agent` built-in tool. Each subagent runs with its own isolated context window and reports back to the orchestrator. Enable with `Agent` in `allowed_tools` plus an `agents` dict of `AgentDefinition` objects.

Use cases: parallelisation, context isolation, specialised roles (reviewer, planner, executor).

### Sessions

Sessions persist across multiple `query()` calls. Capture `session_id` from the `init` system message; pass `resume=session_id` to continue with full prior context. Sessions stored at `~/.claude/projects/<encoded-cwd>/*.jsonl`.

Fork a session (via `fork=session_id`) to branch exploration without touching the original.

### Permissions

`permission_mode` controls autonomy:
- `"default"` — asks user for sensitive operations
- `"acceptEdits"` — auto-approves file edits
- `"bypassPermissions"` — fully autonomous (use in sandboxes only)

## Architecture Diagram

```
Your Application
  └── query() / ClaudeSDKClient
        ├── Agent Loop (same as Claude Code)
        │     ├── Claude model (API call)
        │     ├── Tool execution (built-ins + custom in-process MCP)
        │     ├── Context management (auto-compaction, prompt caching)
        │     └── Session state (~/.claude/projects/...)
        ├── Hooks (pre/post tool use, lifecycle callbacks)
        └── Subagents (isolated context windows, parallel execution)
```

System prompt, tool definitions, and CLAUDE.md content are automatically prompt-cached across turns to reduce cost and latency.

## Comparison with Other Agent Frameworks

| Dimension | Claude Agent SDK | LangGraph | CrewAI | OpenAI Agents SDK |
|-----------|-----------------|-----------|--------|-------------------|
| **Model support** | Claude only | Model-agnostic | Model-agnostic | OpenAI models primary |
| **Workflow control** | Implicit (agent decides) | Explicit graph/state machine | Role-based | Handoffs/guardrails |
| **Production maturity** | Battle-tested (powers Claude Code) | High; time-travel debug | Medium | Medium |
| **MCP integration** | Native, in-process | Via LangChain adapters | Plugin-based | External server |
| **Context management** | Automatic (compaction, caching) | Manual state management | Automatic | Automatic |
| **Persistence** | File-based sessions | Checkpointers (Redis, Postgres) | Built-in memory | External |
| **Best for** | Claude-centric, MCP-heavy agents | Complex stateful workflows | Multi-agent collaboration | OpenAI-native apps |

### When to Choose Claude Agent SDK

- You're building primarily with Claude models
- You need MCP tool integration (especially in-process, low-latency)
- You want the tested agent loop from Claude Code without reimplementing it
- Hooks for safety/observability matter
- Long-running sessions with automatic context management

### When to Choose LangGraph

- You need fine-grained workflow control (branching, cycles, state transitions)
- Multi-model orchestration is required
- Time-travel debugging and checkpointing are essential
- You're building complex state machines, not open-ended agents

### Complementary Use

The two aren't mutually exclusive. A common pattern: LangGraph orchestrates the overall workflow (states, transitions), Claude Agent SDK nodes execute specific agentic tasks within that graph.

## Production Hosting Patterns

- **Ephemeral containers**: spin up per-task, resume session from stored `.jsonl` history; spin down when done
- **Long-running server**: single process handles multiple sessions via `ClaudeSDKClient`; suitable for interactive applications
- `setting_sources=["project"]` enables reading from `CLAUDE.md`, `.claude/skills/`, and `.claude/commands/` — same as CLI

## Relation to Claude Code CLI

Same capabilities, different interface. Many teams use CLI for interactive development and the SDK for CI/CD pipelines and production automation. Workflows translate directly between them.
