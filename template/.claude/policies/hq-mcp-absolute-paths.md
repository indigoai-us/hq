---
id: hq-mcp-absolute-paths
title: Use absolute paths for MCP stdio server commands
scope: global
trigger: mcp, .mcp.json, stdio, npx, node
enforcement: hard
version: 2
created: 2026-04-01
updated: 2026-04-01
source: success-pattern
---

## Rule

ALWAYS use absolute paths (e.g. `/opt/homebrew/bin/npx`, `/opt/homebrew/bin/node`) for `command` fields in `.mcp.json` stdio-type servers. Bare `npx` or `node` fail silently because Claude Code spawns MCP subprocesses without the full shell profile — `/opt/homebrew/bin` is not on PATH.

ALWAYS include `"PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"` in the `env` block of stdio MCP servers that use `npx tsx` or similar wrappers. Absolute path on `command` only fixes the first hop — `npx tsx` internally spawns `node` with a bare name, which fails without PATH set in the subprocess environment.

HTTP-type MCP servers are unaffected (they connect to already-running processes).

## Rationale

On 2026-04-01, all stdio MCP servers (slack, gmail, agent-browser, paper, {company}-workspace) were failing to start silently. The root cause was `"command": "npx"` resolving to nothing in the subprocess environment. Fixed by replacing with `/opt/homebrew/bin/npx` and `/opt/homebrew/bin/node`.
