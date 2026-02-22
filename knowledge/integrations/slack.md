# Slack Integration

Send and read messages in Slack workspaces via the Slack Web API. Supports multiple organizations.

## Rules

1. **Always use the Quick Lookup Directory first.** Before sending any message, check the directory below for the recipient's DM Channel ID. Never make API calls to resolve known contacts.
2. **Update the directory after every message.** Any time we message a person or channel not yet in the directory -- or whose DM Channel was blank -- update the Quick Lookup Directory with the returned DM channel/channel ID immediately after sending. This ensures every subsequent message is instant.
3. **ASCII only on Windows.** See Windows Encoding Rule section below.

## Tokens

Stored in `C:\hq\.env` (gitignored). Each organization has its own token pair.

### Indigo (active)

- **`SLACK_USER_TOKEN`** (`xoxp-...`) — sends messages **as Stefan**. Use this by default.
- **`SLACK_BOT_TOKEN`** (`xoxb-...`) — sends messages **as the HQ app**. Use for automated/system messages.

### FrogBear (active)

- **`FROGBEAR_SLACK_USER_TOKEN`** (`xoxp-...`) — sends messages **as Stefan**. Use this by default.
- **`FROGBEAR_SLACK_BOT_TOKEN`** — not set

### Synesis (not yet configured)

- **`SYNESIS_SLACK_USER_TOKEN`** — not set
- **`SYNESIS_SLACK_BOT_TOKEN`** — not set

**Token lookup by org:** When a process needs the Slack token for an organization, use the org-prefixed variable name. Indigo uses the unprefixed names for backward compatibility.

**Token validation:** Test any token with `auth.test`:
```bash
curl -s "https://slack.com/api/auth.test" -H "Authorization: Bearer $TOKEN"
```
If `ok: true`, the token is valid.

**Setting up a new org:** See `knowledge/hq-core/post-project-completion.md` § "If No Valid Token — Setup Flow" for the full Slack app creation and token collection walkthrough.

Load tokens in Bash: `source C:/hq/.env` (won't work on Windows — read the file or reference the value directly).

## Workspace Info

| Organization | Workspace | Team ID | Stefan's User ID |
|-------------|-----------|---------|------------------|
| Indigo | indigo-ai.slack.com | T043AC36YE4 | U065YSKUCJK |
| FrogBear | frogbearventures.slack.com | T08RUDAR21X | U08RUDAR4FK |
| Synesis | TBD | TBD | TBD |

## Quick Lookup Directory

> **People data now lives in workspace/crm/contacts/.** Use CRM utilities for lookups.
>
> ```javascript
> const crm = require('./.claude/lib/crm.js');
> // Find by name
> crm.findContact({ name: 'Corey' });
> // Find by Slack user ID
> crm.findContact({ slack: { userId: 'U042Z9XCRK3' } });
> // Find by email
> crm.findContact({ email: 'corey@getindigo.ai' });
> ```
>
> Channel IDs are still listed below for quick reference.

### Indigo (`$SLACK_USER_TOKEN`)

**Channels:**

| Channel | Channel ID | Notes |
|---------|------------|-------|
| | | (add as discovered) |

### FrogBear (`$FROGBEAR_SLACK_USER_TOKEN`)

**Channels:**

| Channel | Channel ID | Notes |
|---------|------------|-------|
| #crisp-chats | C097R4RDSV7 | Support chat threads (Level Fit support-chat routes here) |
| #stripe-events | C098QQ2L47L | Stripe webhook events |
| #frogbear-liveops | C098TA22BRC | LiveOps notifications |

### Synesis (not yet configured)

(Add members/channels when workspace is set up.)

## API Patterns

All examples use the user token. Replace with `$SLACK_BOT_TOKEN` for bot messages.

### Send a Message

```bash
curl -s -X POST "https://slack.com/api/chat.postMessage" \
  -H "Authorization: Bearer $SLACK_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"channel":"CHANNEL_ID","text":"Your message here"}'
```

`channel` can be a channel ID (`C...`), DM channel ID (`D...`), or a user ID (`U...` — Slack auto-opens DM).

### Send a File (3-step upload)

**Step 1** — Get upload URL:
```bash
filesize=$(wc -c < "filepath" | tr -d ' ')
curl -s -X POST "https://slack.com/api/files.getUploadURLExternal" \
  -H "Authorization: Bearer $SLACK_USER_TOKEN" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "filename=name.md&length=$filesize"
# Returns: upload_url, file_id
```

**Step 2** — Upload content:
```bash
curl -s -X POST "$UPLOAD_URL" -F file=@"filepath"
```

**Step 3** — Complete and share:
```bash
curl -s -X POST "https://slack.com/api/files.completeUploadExternal" \
  -H "Authorization: Bearer $SLACK_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"files":[{"id":"FILE_ID","title":"Title"}],"channel_id":"CHANNEL_ID","initial_comment":"Message with the file"}'
```

### Open a DM

```bash
curl -s -X POST "https://slack.com/api/conversations.open" \
  -H "Authorization: Bearer $SLACK_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"users":"USER_ID"}'
# Returns: channel.id (use as CHANNEL_ID for messages)
```

### Read Messages from a Channel/DM

```bash
curl -s "https://slack.com/api/conversations.history?channel=CHANNEL_ID&limit=10" \
  -H "Authorization: Bearer $SLACK_USER_TOKEN"
```

### List Channels

```bash
curl -s "https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=100" \
  -H "Authorization: Bearer $SLACK_USER_TOKEN"
```

### Look Up User by Email

```bash
curl -s "https://slack.com/api/users.lookupByEmail?email=user@example.com" \
  -H "Authorization: Bearer $SLACK_USER_TOKEN"
```

## Formatting

Slack uses **mrkdwn** (not standard Markdown):

| Format | Syntax |
|--------|--------|
| Bold | `*text*` |
| Italic | `_text_` |
| Strikethrough | `~text~` |
| Code | `` `code` `` |
| Code block | ` ```code``` ` |
| Link | `<https://url\|display text>` |
| Mention user | `<@USER_ID>` |
| Mention channel | `<#CHANNEL_ID>` |
| Blockquote | `> text` |

Note: Slack does **not** render Markdown tables. Use code blocks for tabular data.

## Windows Encoding Rule

**NEVER use non-ASCII characters in Slack messages sent via curl on Windows.** The Windows bash/curl pipeline does not reliably handle UTF-8, causing characters to render as `?` in Slack.

Banned characters and their ASCII replacements:

| Banned | Name | Use Instead |
|--------|------|-------------|
| `—` | em dash (U+2014) | `-` or `--` |
| `→` | right arrow (U+2192) | `->` or `>` |
| `←` | left arrow (U+2190) | `<-` or `<` |
| `•` | bullet (U+2022) | `-` or `*` |
| `…` | ellipsis (U+2026) | `...` |
| `'` `'` | smart quotes (U+2018/9) | `'` |
| `"` `"` | smart quotes (U+201C/D) | `"` |

**Rule: Compose all Slack message text using only ASCII characters (U+0000-U+007F).** The only exception is emoji shortcodes like `:white_check_mark:` which Slack resolves server-side.

## Sending Quick Reference

To DM someone from the directory above, no lookups needed:

```bash
# Example: DM Aaron (FrogBear)
TOKEN=$(grep 'FROGBEAR_SLACK_USER_TOKEN' C:/hq/.env | cut -d'=' -f2 | tr -d '"' | tr -d "'" | tr -d '\r')
curl -s -X POST "https://slack.com/api/chat.postMessage" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"channel":"D08RANPFLFQ","text":"message here"}'
```

When DMing someone whose DM Channel is blank, use their User ID as the `channel` value (Slack auto-opens the DM) and record the returned `channel` ID in the directory above for next time.

## Scopes Configured

**User token:** chat:write, files:write, channels:read, channels:history, groups:read, groups:history, im:read, im:history, im:write, mpim:read, mpim:history, users:read, users:read.email

**Bot token:** chat:write, files:write, channels:read, channels:history, groups:read, im:read, im:history, im:write, mpim:read, mpim:history, users:read, users:read.email
