---
id: slack-workspace-routing
title: Slack workspace routing — match person/company to correct workspace
scope: global
trigger: any Slack MCP operation (send_message, find_user, list_channels, etc.)
enforcement: hard
---

## Rule

Before any Slack operation, determine the target workspace from context (company, person, channel).

### Workspace mapping

| Workspace | Company | Team ID |
|-----------|---------|---------|
| `{product}` | {company}, {product} | `T7V83HY5B` |
| `{company}` | {company}, {company}, personal | `T043AC36YE4` |

Default is `{product}`. Always pass `workspace:` param when targeting non-default.

### Known people → workspace

| Person | Workspace | Slack ID | Username |
|--------|-----------|----------|----------|
| {team-member} Johnson | {company} | `U065YSKUCJK` | `thereal{team-member}` |
| {team-member} Kalim | {company} | `U0823D5QDJM` | `{team-member}` |
| Corey Epstein | both ({company} primary) | `U042Z9XCRK3` ({company}) | `me1` |
| Ryan, Josh, {Product} team | {product} | — | — |

**`find_user` gotcha**: Search matches `name` (username), not `real_name`. Use username or Slack ID directly if name search fails.

### Failure protocol

If `find_user` or `list_channels` returns empty/wrong results:
1. **Check workspace param first** — wrong workspace is the #1 cause
2. Verify `workspaces.json` has real team IDs (not placeholders)
3. Only after workspace is confirmed correct, try search-based fallback
4. NEVER suggest email/iMessage as Slack fallback without first verifying workspace config

## Rationale

Session wasted 6+ turns spiraling through wrong-workspace attempts, email fallback suggestions, and user confusion — all because the workspace param was missing/wrong. Diagnosing the config issue first would have fixed it in one turn.
