---
id: gmail-mcp-config
title: Gmail MCP — Use Advanced Gmail MCP Only
scope: global
trigger: Any gmail/email MCP tool usage
enforcement: hard
created: 2026-03-04
---

## Rule

1. **The ONLY gmail MCP is `advanced-gmail-mcp`** at `repos/public/advanced-gmail-mcp/`. Server name in `.mcp.json` is `gmail`.
2. **NEVER use `gmail-local` tools.** If you see tools prefixed `mcp__gmail-local__`, do NOT use them. They are from a deprecated, broken MCP.
3. **Tool prefix for the correct MCP is `mcp__gmail__`** (not `mcp__gmail-local__`).
4. **If gmail tools aren't loading,** check `.mcp.json` points to `repos/public/advanced-gmail-mcp/src/server.ts` and suggest a session restart. Do not fall back to any other email tool.
5. **Auth command:** `cd repos/public/advanced-gmail-mcp && npm run auth -- <alias>` (e.g., `{company}`, `personal`).

## Rationale

`gmail-local` (old `repos/public/gmail-mcp`) had broken auth, missing `accounts.json`, and UTF-8 encoding issues. It was deleted on 2026-03-04. The `advanced-gmail-mcp` is the canonical replacement with proper token refresh, multi-account support, and correct encoding.
