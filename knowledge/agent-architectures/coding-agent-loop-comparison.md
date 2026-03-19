---
title: "Coding Agent Loop Architecture: Claude Code vs Devin vs Cursor vs Codex"
category: agent-architectures
tags: ["agent-loop", "autonomous-coding", "comparison", "claude-code", "tool-use", "context-management"]
source: "https://platform.claude.com/docs/en/agent-sdk/agent-loop, https://code.claude.com/docs/en/how-claude-code-works, https://openai.com/index/unrolling-the-codex-agent-loop/, https://blog.bytebytego.com/p/how-cursor-shipped-its-coding-agent, https://medium.com/@takafumi.endo/agent-native-development-a-deep-dive-into-devin-2-0s-technical-design-3451587d23c0"
confidence: 0.82
created_at: "2026-03-20T00:00:00Z"
updated_at: "2026-03-20T00:00:00Z"
---

Architectural comparison of how Claude Code, Devin, Cursor, and OpenAI Codex implement their agent loops.

## Common Pattern: Evaluate → Act → Verify

All four systems share the same basic structure:

1. **Gather context** — understand the codebase, task, and environment
2. **Decide + act** — call tools (file read/edit, shell, browser)
3. **Observe** — receive tool results, update state
4. **Repeat** until done or budget exhausted

The differences lie in **execution model**, **tool surface**, **context management**, and **planning layer**.

---

## Claude Code

**Architecture**: Single-threaded master loop (`nO`) with limited sub-agent spawning.

- Loop: user input → LLM evaluates → tool calls (file, shell, search, MCP) → results feed back → repeat
- Sub-agents are spawned as separate Claude instances with isolated contexts; the parent waits for results
- **Context compressor** fires at ~92% usage: summarizes conversation + writes important state to a Markdown file, then continues
- No persistent memory beyond the current session unless the user explicitly snapshots
- **Tools**: Bash, file read/write/edit, glob, grep, web search, MCP servers, computer use (experimental)
- **Planning**: Implicit — Claude reasons in its CoT before each tool call. Explicit task decomposition is done in prose, not a structured plan object
- **Permission model**: Tool calls can require user approval based on permission mode (auto, semi-auto, full manual)

**Key decision**: Optimize for developer trust via transparent, reviewable tool calls rather than autonomous background operation.

---

## OpenAI Codex

**Architecture**: Request-response cycle over Responses API with structured prompt assembly.

- Loop: user input → structured prompt (system + developer + user roles) → HTTP request to Responses API → SSE stream back → tool calls → results appended → next request
- **AGENTS.md files** in project directories inject per-project developer instructions automatically
- **Prompt caching** is architecturally central: static content (instructions, examples) at prompt head, dynamic content at tail — cache hits make multi-turn sampling linear not quadratic
- **Context management**: Agent can make hundreds of tool calls per turn; context budget tracked explicitly; truncation or summarization triggered when approaching limits
- **Tools**: shell commands, file editor, web browser, code interpreter
- GPT-5.3-Codex (Dec 2025) is the current production model — 25% faster than 5.2 while matching on reasoning

**Key decision**: Prompt structure is a first-class concern — role hierarchy (system > developer > user) and cache-friendly layout are architectural requirements, not implementation details.

---

## Cursor (+ Composer)

**Architecture**: IDE-integrated orchestrator with a specialized MoE model (Composer) for agent turns.

- Loop: user describes task → Composer plans multi-step execution → tool calls (terminal, editor, file) run in an **isolated sandbox** → results feed back → repeat until tests pass or user intervenes
- **Composer** (launched Oct 2025) is a Mixture-of-Experts model routing tokens to specialized MLP experts — optimized for agentic latency (<30s/turn) over raw reasoning depth
- **Sandbox isolation**: every tool call runs in a sandboxed environment; destructive commands are blocked, preventing host machine damage
- **Plan Mode**: explicit pre-execution planning step where Cursor shows its plan and waits for user approval before touching code
- **Automations** (2026): agent loop triggered by external events (new commit, Slack message, timer) — not just on-demand

**Key decision**: Treat agent turns as a product with latency SLOs. Composer trades some reasoning depth for consistent <30s turn times. The MoE architecture is chosen for speed/cost efficiency at agent scale.

---

## Devin 2.0

**Architecture**: Agent-native cloud IDE with integrated planner, editor, shell, and browser as first-class components.

- Loop: planner breaks task into steps → editor + shell loop mirrors human dev workflow → browser used for live docs lookup and testing → verification checks against requirements
- **Planner** ("Architectural Brain") maintains a persistent task tree, not just a flat conversation history
- **Multi-agent**: Devin 2.0 (April 2025) allows launching multiple Devin instances in parallel on separate tasks or subtasks
- **Context**: maintains understanding across extended sessions using retrieval techniques similar to RAG — relevant codebase context retrieved, not the full repo
- **Browser-native**: built-in browser is a core tool, not an add-on — used for API docs, StackOverflow, and testing deployed apps in real time

**Key decision**: Ship a vertically integrated, cloud-hosted environment where agent, IDE, browser, and terminal are one system — reduces integration surface area at the cost of portability.

---

## Architectural Comparison Table

| Dimension | Claude Code | OpenAI Codex | Cursor | Devin |
|---|---|---|---|---|
| **Execution model** | Single-threaded + sub-agents | Request-response (SSE) | Sandbox orchestrator | Cloud IDE integration |
| **Planning layer** | Implicit CoT | Implicit + AGENTS.md | Explicit Plan Mode | Persistent task tree |
| **Context strategy** | Compress at 92% | Cache-optimized prompt structure | Per-turn context rebuild | RAG-style retrieval |
| **Tool surface** | MCP extensible | Shell + browser + file | IDE tools + sandbox | Planner + editor + shell + browser |
| **Parallelism** | Sub-agent spawning | None (sequential turns) | Automations (event-triggered) | Multi-agent instances |
| **Model specialization** | General Claude | GPT-5.3-Codex (tuned) | Composer MoE (speed-optimized) | Undisclosed |
| **Safety model** | Permission modes (user approval) | AGENTS.md permissions | Sandbox execution | Cloud isolation |
| **Deployment** | Local CLI + SDK | CLI + API | IDE plugin + cloud | Hosted cloud only |

---

## Key Architectural Divergences

**1. Planning representation**: Claude Code and Codex use implicit planning embedded in CoT. Cursor externalizes it (Plan Mode). Devin uses a persistent structured task tree — most durable across long sessions.

**2. Context management**: Codex treats prompt structure as an engineering discipline (cache-friendly layout). Claude Code treats context as a runtime problem (compress on overflow). Devin avoids the problem by retrieving relevant context rather than maintaining all of it.

**3. Speed vs depth tradeoff**: Cursor's Composer MoE sacrifices reasoning depth for latency. Claude Code and Codex prioritize reasoning quality, accepting slower turns.

**4. Extensibility**: Claude Code is uniquely extensible via MCP — any MCP server becomes an agent tool. Others use fixed tool surfaces.

**5. Permission philosophy**: Claude Code and Cursor require user approval for sensitive actions. Devin and Codex assume broader autonomy within a defined permission envelope.
