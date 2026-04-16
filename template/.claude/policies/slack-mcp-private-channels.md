---
id: slack-mcp-private-channels
title: Slack MCP private channel resolution
scope: global
trigger: sending messages or reading private Slack channels
enforcement: hard
---

## Rule

ALWAYS use the custom slack-mcp (`repos/public/slack-mcp/`), NEVER the official Slack marketplace plugin. The official plugin uses OAuth bot tokens that cannot access private channels.

When `resolveChannel` fails for a private channel (user token lacks `groups:read`), the search-based fallback discovers the channel ID via `search.messages`. If the MCP server hasn't restarted to pick up this fix, pass the channel ID directly instead of the channel name.

### Known Private Channel IDs ({Product})

| Channel | ID | Notes |
|---------|-----|-------|
| #team-liveops | `C06UP2V06CD` | Ops/incident room |
| #team-dev | `{channel-id}` | {PRODUCT}/{Product} engineering — canonical PR-notification channel (see `companies/{company}/policies/slack-pr-notifications.md`) |

