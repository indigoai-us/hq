---
title: "QMD MCP Server: Stdio vs HTTP Transport"
category: qmd-operations
tags: ["qmd", "mcp", "agent-architecture", "production-patterns", "cli"]
source: blueprint
confidence: 0.5
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

QMD exposes an MCP (Model Context Protocol) server with two transport modes:

**Stdio** (`qmd mcp`) — launched as a subprocess by each client. Each instance loads its own models. This is the default for Claude Desktop and Claude Code integration. Simple to configure but means each client session pays the model-loading cost.

**HTTP** (`qmd mcp --http`) — a shared, long-lived server on localhost (default port 8181). Exposes `POST /mcp` for MCP Streamable HTTP and `GET /health` for liveness checks. LLM models stay loaded in VRAM across requests. Embedding/reranking contexts are disposed after 5 min idle and recreated on next request (~1s penalty). Can run as a background daemon with `--daemon`.

MCP tools exposed: `query` (search with typed sub-queries via RRF + reranking), `get` (retrieve by path or docid with fuzzy matching), `multi_get` (batch retrieve by glob/list/docids), and `status` (index health).

For GHQ, the MCP server is configured in Claude Code settings and also available as the `indigo` MCP collection for project-scoped search. The HTTP transport would be preferable for setups where multiple agents or tools need concurrent access to the same index without redundant model loading.
