# Slack Integration

Send and read messages in Slack workspaces via the Slack Web API. Supports multiple organizations.

## Rules

1. **CRM is the single source of truth for people.** Before sending any message, look up the recipient in the CRM (via `crm.findContact()`) for their DM Channel ID, User ID, and workspace. The CRM replaces all hardcoded people directories. Fall back to the Channel IDs table below only for channel (non-person) lookups.
2. **Update CRM after every message.** Any time we message a person or channel, update the CRM contact's slack identifier with the returned DM channel ID (if not already stored). See "CRM Auto-Detect" section below for the full protocol.
3. **ASCII only on Windows.** See Windows Encoding Rule section below.
4. **CRM auto-detect is mandatory.** After reading or sending Slack messages, always check the CRM for all people involved and create/update contacts. See "CRM Auto-Detect" section below.
5. **Never hardcode people data in this file.** All person identifiers (user IDs, DM channels, display names) live in `workspace/crm/contacts/`. This file only contains API patterns, tokens, workspace info, and channel IDs.

## CRM Auto-Detect (People Tracking)

When processing Slack messages (reading or sending), workers MUST check the CRM for all people involved and create/update contact records. This ensures every Slack interaction builds the rolodex automatically.

### After Reading Messages (conversations.history, conversations.replies)

For each message in the response:

1. **Extract the sender's user ID** from the `user` field (e.g., `"user": "U042Z9XCRK3"`)
2. **Extract any mentioned user IDs** from `<@U...>` patterns in the message `text`
3. **For each user ID found**, run the CRM lookup:

```javascript
const crm = require('./.claude/lib/crm.js');

// Look up by Slack user ID
const matches = crm.findContact({ slack: { userId: 'U042Z9XCRK3' } });

if (matches.length > 0) {
  // Contact exists -- add interaction
  const contact = matches[0];
  crm.addInteraction(contact.slug, {
    date: new Date().toISOString(),
    type: 'slack-message',
    summary: 'Message in #channel-name: brief summary of message content',
    ref: 'workspace-name/#channel-name/timestamp'
  });
} else {
  // Contact not found -- resolve name via users.info, then create
  // Step 1: Get user info from Slack API
  // curl -s "https://slack.com/api/users.info?user=U042Z9XCRK3" \
  //   -H "Authorization: Bearer $SLACK_USER_TOKEN"
  // Extract: real_name, display_name, profile.email (if available)

  // Step 2: Create CRM contact
  crm.createContact({
    name: realName,  // from users.info response
    emails: profileEmail ? [{ address: profileEmail }] : [],
    identifiers: {
      slack: [{
        workspace: 'workspace-name',  // e.g., 'indigo-ai' or 'frogbearventures'
        userId: 'U042Z9XCRK3',
        displayName: displayName  // from users.info
      }]
    },
    sources: [{
      type: 'slack',
      ref: 'workspace-name/#channel-name/timestamp',
      date: new Date().toISOString(),
      context: 'Auto-detected from Slack message'
    }]
  });
}
```

### After Sending Messages (chat.postMessage)

When sending a message to a person (DM) or channel:

1. **If sending to a user (DM)**, look up the recipient's user ID in CRM
2. **If the message text contains `<@U...>` mentions**, look up each mentioned user
3. **Apply the same create-or-update logic** as the reading flow above
4. For the interaction type, use `'slack-message-sent'` to distinguish outgoing messages:

```javascript
crm.addInteraction(contact.slug, {
  date: new Date().toISOString(),
  type: 'slack-message-sent',
  summary: 'Sent DM to contact: brief summary of message',
  ref: 'workspace-name/DM/timestamp'
});
```

### Rules for Auto-Detect

1. **Always call users.info for unknown user IDs.** Never create a contact with just a user ID and no name. The `real_name` field from users.info is the display name.
2. **Use the correct workspace name** based on which token is being used (indigo-ai for `$SLACK_USER_TOKEN`, frogbearventures for `$FROGBEAR_SLACK_USER_TOKEN`).
3. **Do not add interactions for bot users.** Skip user IDs that resolve to bots (users.info `is_bot: true`).
4. **Batch lookups efficiently.** When reading multiple messages, collect all unique user IDs first, then do CRM lookups and users.info calls in batch rather than per-message.
5. **Interaction summaries should be brief** (one sentence). Include channel name and topic, not full message text.
6. **Skip self-interactions.** Do not log interactions for Stefan's own messages (user ID varies by workspace -- check CRM for self-contact by name if needed).
7. **DM channel discovery.** When a new DM channel is opened (via conversations.open), write the `dmChannel` back to the CRM contact's slack identifier, not to this file.

### users.info API Pattern

```bash
curl -s "https://slack.com/api/users.info?user=USER_ID" \
  -H "Authorization: Bearer $SLACK_USER_TOKEN"
```

Response fields to extract:
- `user.real_name` -- full display name (use for contact name)
- `user.profile.display_name` -- Slack display name (use for identifier displayName)
- `user.profile.email` -- email address (may be empty depending on workspace settings)
- `user.is_bot` -- skip if true
- `user.profile.title` -- job title (use for contact title field if available)

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

## CRM Lookup Protocol (People)

All person data lives in `workspace/crm/contacts/`. Use CRM utilities for all people lookups:

```javascript
const crm = require('./.claude/lib/crm.js');

// === SENDING A MESSAGE ===
// Step 1: Look up recipient in CRM for their DM Channel ID
const matches = crm.findContact({ name: 'Corey' });
// or: crm.findContact({ slack: { userId: 'U042Z9XCRK3' } });
// or: crm.findContact({ email: 'corey@getindigo.ai' });

if (matches.length > 0) {
  const contact = matches[0];
  // Get Slack identifier for the correct workspace
  const slackId = contact.identifiers.slack?.find(s => s.workspace === 'indigo-ai');
  const channel = slackId?.dmChannel || slackId?.userId;
  // Use 'channel' in chat.postMessage
}

// Step 2: After sending, if a new DM channel was returned (conversations.open),
// write it back to the CRM contact -- NOT to this file:
crm.updateContact(contact.slug, {
  identifiers: {
    slack: [{ workspace: 'indigo-ai', userId: slackId.userId, dmChannel: newDmChannelId }]
  }
});
```

**Workflow for unknown recipients:** If the person is not in CRM, use their Slack User ID directly as the `channel` parameter (Slack auto-opens DM), then create a CRM contact with the returned DM channel ID.

**Quick resolution:** Workers can also use the crm-manager's `lookup-person` skill (`/run crm-manager lookup-person`) for formatted contact cards with all identifiers.

Channel IDs (non-person) are still listed below for quick reference.

### Indigo (`$SLACK_USER_TOKEN`)

**Channels:**

| Channel | Channel ID | Notes |
|---------|------------|-------|
| #project-hq | C0ACTRKLN7N | HQ project updates |

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

To DM someone, always look up their DM Channel ID from the CRM first:

```bash
# Step 1: Look up recipient in CRM (conceptual -- workers do this via crm.findContact())
# crm.findContact({ name: 'Aaron' }) -> identifiers.slack[workspace=frogbearventures].dmChannel

# Step 2: Use the DM Channel ID from CRM
TOKEN=$(grep 'FROGBEAR_SLACK_USER_TOKEN' C:/hq/.env | cut -d'=' -f2 | tr -d '"' | tr -d "'" | tr -d '\r')
curl -s -X POST "https://slack.com/api/chat.postMessage" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"channel":"DM_CHANNEL_FROM_CRM","text":"message here"}'
```

When DMing someone whose DM Channel is blank in the CRM, use their User ID as the `channel` value (Slack auto-opens the DM) and write the returned `channel` ID back to the CRM contact's slack identifier (via `crm.updateContact(slug, { identifiers: { slack: [{ workspace, userId, dmChannel: returnedChannelId }] } })`).

**Never hardcode DM Channel IDs in commands or knowledge files.** Always read from CRM.

**Remember:** After sending any message, run the CRM auto-detect flow (see "CRM Auto-Detect" section above) to log the interaction.

## Scopes Configured

**User token:** chat:write, files:write, channels:read, channels:history, groups:read, groups:history, im:read, im:history, im:write, mpim:read, mpim:history, users:read, users:read.email

**Bot token:** chat:write, files:write, channels:read, channels:history, groups:read, im:read, im:history, im:write, mpim:read, mpim:history, users:read, users:read.email
