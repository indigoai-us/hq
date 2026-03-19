---
title: "Context Isolation Patterns for Multi-Company AI Assistants"
category: knowledge-segregation
tags: ["knowledge-management", "security", "context-management", "personal-knowledge", "runtime-isolation"]
source: blueprint
confidence: 0.5
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

When an AI assistant (like Claude Code) works across multiple companies, context isolation prevents knowledge from one company leaking into sessions for another. This is distinct from traditional multi-tenancy — the "tenant" is the same user, but the *context boundaries* must be enforced per-company.

## Key Isolation Vectors

1. **Conversation context**: The most immediate risk. If company A's codebase details remain in conversation history while working on company B, the assistant may inadvertently reference or suggest patterns from A.

2. **Persistent memory**: Systems like Claude Code's auto-memory (`~/.claude/projects/`) store learned preferences and project facts. Without scoping, memories from company A's project could surface when working on company B.

3. **Knowledge base contamination**: A shared knowledge base (like GHQ's `knowledge/` directory) may contain company-specific insights mixed with general knowledge. Search results could surface proprietary information from the wrong context.

4. **Tool state**: MCP servers, git configs, environment variables, and shell history can carry company-specific state between sessions.

## Isolation Strategies (Overview)

- **Session-level**: Fresh sessions per company, no conversation carry-over
- **Directory-level**: Per-company working directories with scoped configs (e.g., `companies/{slug}/`)
- **Collection-level**: Separate qmd collections per company, queried only when in that company's context
- **Memory-level**: Project-scoped memory files that only load for matching working directories

The right approach likely combines multiple strategies. The tradeoff is between isolation strength and the ability to apply cross-cutting general knowledge.
