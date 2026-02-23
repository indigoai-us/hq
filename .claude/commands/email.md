---
description: Manage email across all 4 Gmail accounts via gmail-local MCP
allowed-tools: Task, Read, Glob, Grep, Bash, Edit, Write, AskUserQuestion, ToolSearch, mcp__gmail-local__*
argument-hint: [action] [account] [args]
visibility: public
---

# /email - Gmail Management

Manage email across 4 Gmail accounts using the `gmail-local` MCP tools.

**Accounts:** {repo} (user@example.com), designco (user@example.com), personal (user@example.com), widgets (user@example.com)

**User's input:** $ARGUMENTS

## MCP Tools (gmail-local)

Before using any tool, run `ToolSearch` with query `+gmail-local` to load them.

| Tool | Purpose |
|------|---------|
| `list_emails` | List inbox/label (account, label, max_results, query) |
| `search_emails` | Gmail query search (query, account, max_results) |
| `read_email` | Read full email by ID (message_id, account) |
| `get_thread` | Get full thread by ID (thread_id, account) |
| `get_labels` | List all labels (account) |
| `send_email` | Send new email (to, subject, body, account) |
| `draft_email` | Create new draft (to, subject, body, account) |
| `draft_reply` | Create threaded draft reply (message_id, body, account, reply_all) |
| `reply_email` | Reply and SEND immediately (message_id, body, account) — **dangerous, prefer draft_reply** |
| `send_draft` | Send an existing draft by ID (draft_id, account) |
| `archive_email` | Archive email (message_id, account) |
| `label_email` | Add/remove labels (message_id, add_labels, remove_labels, account) |
| `trash_email` | Trash email (message_id, account) |
| `batch_modify` | Batch archive/trash/label (message_ids, action, account) |

## Actions

### No args or "triage" → Inbox Triage
1. Ask which account(s) to triage (or default to all)
2. For each account, `list_emails` with max_results=25
3. Summarize inbox: group by sender/category, flag urgent items
4. Ask user what to archive/trash/reply to
5. Execute batch actions

### "cleanup" → Daily Email Triage (full workflow)
**Phase 1 — Cleanup:** Search all accounts for promotions, newsletters, notifications, social, cold outreach. Present grouped summary. Batch archive on approval.
**Phase 2 — Triage:** List remaining inbox per account. Categorize: urgent / action needed / FYI / quick decisions. Present summary tables.
**Phase 3 — Walkthrough:** Read full content of urgent/action items. Brief user with context + recommended action. Group quick decisions separately.
**Phase 4 — Decisions:** Walk through quick decisions one at a time. Wait for user response before next. For each: archive, reply (draft first → get approval), forward, create Linear ticket (via API at settings/linear/), or create PRD for follow-up sessions.
**Key:** Use qmd + company settings to pull context for replies (e.g. GTM IDs, existing Linear tickets). Archive FYI in batch, forward exceptions individually.

### "search {query}" → Search
1. Search across specified or all accounts
2. Present results

### "send" / "draft" / "reply" → Compose
1. Use write tools as directed
2. Always confirm before sending (drafts don't need confirmation)

### "labels" → Show Labels
1. `get_labels` for specified account

## CRM Auto-Detect (People Tracking)

When processing emails (reading, triaging, composing, or replying), workers MUST check the CRM for all people involved and create/update contact records. This ensures every email interaction builds the rolodex automatically.

### After Reading/Triaging Emails

For each email processed (via `list_emails`, `read_email`, `get_thread`, or `search_emails`):

1. **Extract the sender** from the `From` header (email address + display name)
2. **Extract all recipients** from `To`, `CC`, and `BCC` headers
3. **For each email address found**, run the CRM lookup:

```javascript
const crm = require('./.claude/lib/crm.js');

// Look up by email address
const matches = crm.findContact({ email: 'sender@example.com' });

if (matches.length > 0) {
  // Contact exists -- add interaction and update if needed
  const contact = matches[0];

  // Add any new email addresses not already on the contact
  crm.updateContact(contact.slug, {
    emails: [{ address: 'sender@example.com' }]
  });

  // Log the interaction
  crm.addInteraction(contact.slug, {
    date: new Date().toISOString(),
    type: 'email-received',
    summary: 'Email: Subject line here (brief context)',
    ref: 'message-id or subject line'
  });
} else {
  // Contact not found -- create from email display name
  crm.createContact({
    name: 'Display Name',  // parsed from email From header (e.g., "Jane Doe <jane@co.com>" -> "Jane Doe")
    emails: [{ address: 'sender@example.com' }],
    identifiers: {
      email: [{ address: 'sender@example.com', primary: true }]
    },
    sources: [{
      type: 'email',
      ref: 'Subject line or message ID',
      date: new Date().toISOString(),
      context: 'Auto-detected from email'
    }]
  });
}
```

### After Composing/Replying to Emails

When drafting or sending an email (via `send_email`, `draft_email`, `draft_reply`, or `reply_email`):

1. **Look up all recipients** (To, CC) in the CRM by email address
2. **Apply the same create-or-update logic** as the reading flow above
3. For the interaction type, use `'email-sent'` to distinguish outgoing emails:

```javascript
crm.addInteraction(contact.slug, {
  date: new Date().toISOString(),
  type: 'email-sent',
  summary: 'Sent email re: Subject line (brief context)',
  ref: 'message-id or subject line'
});
```

### Rules for Email Auto-Detect

1. **Parse display names from email headers.** The `From` field often contains `"Display Name" <email@domain.com>` -- extract the display name for contact creation. If no display name, use the email username as a fallback name.
2. **Do not create contacts for noreply/automated senders.** Skip addresses like `noreply@`, `notifications@`, `no-reply@`, `mailer-daemon@`, and similar automated/system addresses.
3. **Do not create contacts for the user's own email accounts.** Skip the 4 configured Gmail addresses (they belong to the HQ user's self-contact, not separate contacts).
4. **Batch lookups efficiently.** When triaging multiple emails, collect all unique email addresses first, then do CRM lookups in batch rather than per-email.
5. **Interaction summaries should be brief** (one sentence). Include subject line and brief context, not full email body.
6. **Handle CC/BCC contacts the same as To recipients.** Every participant in an email thread is a contact worth tracking.
7. **Update existing contacts with new info.** If a known contact sends from a new email address, add that address to their emails array.

## Rules

- Always specify `account` parameter explicitly — never rely on default
- For triage: present a summary table first, then ask for actions — don't auto-archive
- For batch operations: always confirm with user before executing
- Respect company isolation: don't mix account contexts
- When reading emails, show sender, subject, date, and snippet — not full bodies unless asked
- **ALWAYS check full thread** (`get_thread`) before telling the user an action hasn't been taken. `read_email` returns a single message — the user's reply may be a different message in the same thread. Check sent folder or threadId before claiming something wasn't done
- **ALWAYS review email drafts with user before sending** — never auto-send replies. Show the draft and wait for approval or edits
- **NEVER use `reply_email` to compose** — it sends immediately with no review. ALWAYS use `draft_email` first, tell user to review/attach in Gmail, then only send via `reply_email` after explicit approval. `reply_email` replies to the *sender* of the message_id, not necessarily the intended recipient — always verify
- **Plain text for email bodies** — never use markdown formatting in email body text. Gmail renders plain text, not markdown. No `**bold**`, `--`, or `#` headers
- **Linear API available** for ticket creation during triage — credentials at `settings/linear/credentials.json`, config at `settings/linear/config.json`. Use GraphQL API (api.linear.app/graphql) to create issues, search tickets, find assignees
- **Pull HQ context before replying** — search qmd + company settings for relevant info (pixel IDs, existing tickets, deploy configs) to craft informed replies
- **Create PRDs for deferred items** — if an email needs follow-up work that can't be done now, create a PRD via `/prd` so it's queued for a future session
- **CRM auto-detect is mandatory.** After processing any emails (reading, triaging, composing, replying), always check the CRM for all people involved and create/update contacts. See "CRM Auto-Detect" section above
