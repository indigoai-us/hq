---
id: mcp-process-cleanup
title: MCP Server Process Cleanup
scope: global
trigger: session-end, mcp-server
enforcement: hard
created: 2026-04-06
---

## Rule

MCP servers spawned via stdio (npx/tsx) leak as orphaned processes when Claude sessions end. The `cleanup-mcp-processes` Stop hook kills these on session exit. This hook MUST remain in all profiles (minimal, standard, strict).

Known leakers:
- `slack-mcp/src/server.ts` — 2 node processes per session (~200MB each)
- `advanced-gmail-mcp/src/server.ts` — leaks same pattern when enabled
- `agent-browser` — Chromium engine, 2-4 GB per leaked instance
- `detached-flush.js` — Next.js telemetry orphans (~100MB each)
