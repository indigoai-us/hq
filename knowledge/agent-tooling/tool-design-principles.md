---
title: "Tool Design Principles for Autonomous Agents"
category: agent-tooling
tags: ["tool-design", "mcp", "function-calling", "api-design", "error-handling", "agent-tooling"]
source: blueprint
confidence: 0.5
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

Tools are an agent's hands — they determine what the agent can actually do in the world. Poorly designed tools are the most common cause of agent failure, more so than model capability.

## Core Principles

**Clear, unambiguous descriptions**: The model decides which tool to call based on the description. Vague descriptions lead to wrong tool selection. Be specific about what the tool does, when to use it, and what it returns.

**Minimal, focused scope**: One tool should do one thing well. A tool that "reads a file and optionally edits it" will confuse the model. Separate into `read_file` and `edit_file`.

**Structured inputs and outputs**: Use typed parameters with clear constraints. Return structured data (JSON) rather than free-text when possible. The model parses structured output more reliably.

**Graceful error handling**: Return informative error messages, not stack traces. The agent needs to understand what went wrong to recover. "File not found: config.yaml" is actionable; a Python traceback is not.

**Idempotency where possible**: Tools that can be safely retried reduce the blast radius of agent mistakes. If an edit tool is idempotent, a retry doesn't corrupt the file.

## MCP as the Standard

The Model Context Protocol (MCP) has emerged as the dominant standard for agent-tool connectivity. It provides a uniform interface for tools regardless of implementation language or hosting. Think of it as USB for AI tools — any MCP-compliant tool works with any MCP-compliant agent.

## Anti-Patterns

- Tools that require multi-step setup before they're usable
- Tools with dozens of optional parameters (decision paralysis for the model)
- Tools that return megabytes of output (fills context window)
- Tools without clear "when to use" guidance in their descriptions
