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
| `{workspace-1}` | {company}, {workspace-1} | `{team-id-1}` |
| `{workspace-2}` | {company}, {company}, personal | `{team-id-2}` |

Default is `{workspace-1}`. Always pass `workspace:` param when targeting non-default.

### Known channels → workspace

| Channel | Workspace | Notes |
|---------|-----------|-------|
| `#hq` | `{company}` | HQ project updates, private channel |
| `#{company}-product` | `{company}` | Product updates |
| `#releases` | `{company}` | Release announcements |
| `#team-{company}-agents` | `{workspace-1}` | agent ops |

### Known people → workspace

| Person | Workspace | Slack ID | Username |
|--------|-----------|----------|----------|
| {team-member} | {company} | `{slack-id-1}` | `{username-1}` |
| {team-member} | {company} | `{slack-id-2}` | `{username-2}` |
| {your-name} | both ({company} primary) | `{slack-id-3}` ({company}) | `{username-3}` |
| Team members | {workspace-1} | — | — |

**`find_user` gotcha**: Search matches `name` (username), not `real_name`. Use username or Slack ID directly if name search fails.

### Failure protocol

If `find_user` or `list_channels` returns empty/wrong results:
1. **Check workspace param first** — wrong workspace is the #1 cause
2. Verify `workspaces.json` has real team IDs (not placeholders)
3. Only after workspace is confirmed correct, try search-based fallback
4. NEVER suggest email/iMessage as Slack fallback without first verifying workspace config

## Rationale

Session wasted 6+ turns spiraling through wrong-workspace attempts, email fallback suggestions, and user confusion — all because the workspace param was missing/wrong. Diagnosing the config issue first would have fixed it in one turn.
