---
id: gmail-token-refresh
title: Check Gmail token validity before sending
scope: global
trigger: mcp__gmail__send_email, mcp__gmail__draft_email
enforcement: soft
created: 2026-03-04
---

## Rule

Before sending emails via Gmail MCP, test token validity with a lightweight call first (e.g., `mcp__gmail__list_emails` with limit 1). If it fails with `invalid_grant`, re-auth immediately:

```
cd repos/public/advanced-gmail-mcp && npm run auth -- {account}
```

Then open the auth URL in browser (`open "URL"`) so the user doesn't have to find it manually.

