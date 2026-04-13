---
id: hq-no-chrome-mcp-slack-fallback
title: Never use Claude in Chrome as a fallback when Slack MCP is unavailable
scope: global
trigger: slack, mcp unavailable, fallback, scheduled task, health check
enforcement: hard
version: 1
created: 2026-04-01
updated: 2026-04-01
source: user-correction
---

## Rule

When the `slack` MCP `send_message` tool is unavailable, **NEVER fall back to Claude in Chrome** (`mcp__Claude_in_Chrome__*`) to post Slack messages.

If the Slack MCP is not loaded:
1. Note the failure in the task output/report
2. Include the message text that would have been posted (so it can be posted manually)
3. Continue with remaining task steps — do not abort

Browser automation is not a valid fallback for MCP tool failures.

## Rationale

User correction on 2026-04-01: During the `{product}-infra-health` scheduled task, Slack MCP was unavailable. Claude attempted to use Claude in Chrome to navigate Slack and post the message, burning multiple turns navigating to the wrong workspace. The correct behavior is to note the failure inline and move on.
