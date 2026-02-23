# Linear Integration

**Workspace:** indigo-ai
**API endpoint:** `https://api.linear.app/graphql`
**API key env var:** `LINEAR_API_KEY` (stored in `C:\hq\.env`)
**Config:** `C:\hq\config\hiamp.yaml`

## Rules

1. **CRM is the single source of truth for people.** When mentioning a user, assigning an issue, or looking up anyone in Linear, always look up their Linear userId and displayName from the CRM first (via `crm.findContact()`). The Key Users table below is a read-only quick reference -- never write new user data there; write to CRM instead.
2. **CRM auto-detect is mandatory.** When creating issues, adding comments, or reading assignments in Linear, always check the CRM for all people involved and create/update contacts. See "CRM Auto-Detect" section below.
3. **Write back new identifiers to CRM.** Any new Linear user IDs or display names discovered during API calls must be written to the CRM contact, not to this file.
4. **Never hardcode people data in this file.** All person identifiers (user IDs, display names) live in `workspace/crm/contacts/`. The Key Users table below is a frozen snapshot for quick reference only -- new users go directly to CRM.

## CRM Auto-Detect (People Tracking)

When interacting with Linear (creating issues, adding comments, reading assignments), workers MUST check the CRM for all people involved and create/update contact records. This ensures every Linear interaction builds the rolodex automatically.

### After Creating Issues (issueCreate)

When creating an issue with an assignee:

1. **Look up the assignee** by their Linear user ID in the CRM
2. **Apply create-or-update logic:**

```javascript
const crm = require('./.claude/lib/crm.js');

// Look up by Linear user ID
const matches = crm.findContact({ linear: { userId: '0f41fe7e-9ad7-4de3-8e70-10aa7b42d001' } });

if (matches.length > 0) {
  // Contact exists -- add interaction
  const contact = matches[0];
  crm.addInteraction(contact.slug, {
    date: new Date().toISOString(),
    type: 'linear-assignment',
    summary: 'Assigned to issue DEV-123: Issue title',
    ref: 'https://linear.app/indigo-ai/issue/DEV-123'
  });
} else {
  // Contact not found -- create with Linear identifier
  crm.createContact({
    name: 'Display Name',  // from the Key Users table or API response
    identifiers: {
      linear: [{
        workspace: 'indigo-ai',
        userId: '0f41fe7e-9ad7-4de3-8e70-10aa7b42d001',
        displayName: 'therealstefan'
      }]
    },
    sources: [{
      type: 'linear',
      ref: 'https://linear.app/indigo-ai/issue/DEV-123',
      date: new Date().toISOString(),
      context: 'Auto-detected from Linear issue creation'
    }]
  });
}
```

### After Adding Comments (commentCreate)

When adding a comment, especially one with @mentions:

1. **Extract mentioned user IDs** from `suggestion_userMentions` nodes in the `bodyData` ProseMirror JSON
2. **For each mentioned user**, run the CRM lookup by Linear userId
3. **Apply the same create-or-update logic** as issue creation above
4. For the interaction type, use `'linear-comment'`:

```javascript
crm.addInteraction(contact.slug, {
  date: new Date().toISOString(),
  type: 'linear-comment',
  summary: 'Mentioned in comment on DEV-123: brief context of comment',
  ref: 'https://linear.app/indigo-ai/issue/DEV-123'
});
```

### After Reading Assignments / Issues

When fetching issues (e.g., for status checks, triage, or HIAMP event processing):

1. **Extract the assignee** from the issue's `assignee` field (userId, displayName)
2. **Extract the creator** from the issue's `creator` field if available
3. **Extract commenters** if reading issue comments
4. **For each user found**, run the CRM lookup:

```javascript
// Look up by Linear user ID
const matches = crm.findContact({ linear: { userId: assigneeId } });

if (matches.length > 0) {
  // Contact exists -- add interaction
  crm.addInteraction(matches[0].slug, {
    date: new Date().toISOString(),
    type: 'linear-assignment',
    summary: 'Assigned to DEV-123: Issue title (read during triage)',
    ref: 'https://linear.app/indigo-ai/issue/DEV-123'
  });
  // Update any missing linear fields
  const linearIds = matches[0].identifiers?.linear || [];
  const hasDisplayName = linearIds.some(id => id.userId === assigneeId && id.displayName);
  if (!hasDisplayName && displayName) {
    crm.updateContact(matches[0].slug, {
      identifiers: {
        linear: [{ workspace: 'indigo-ai', userId: assigneeId, displayName: displayName }]
      }
    });
  }
} else {
  // Create new contact
  crm.createContact({
    name: displayName || 'Unknown Linear User',
    identifiers: {
      linear: [{
        workspace: 'indigo-ai',
        userId: assigneeId,
        displayName: displayName
      }]
    },
    sources: [{
      type: 'linear',
      ref: 'https://linear.app/indigo-ai/issue/DEV-123',
      date: new Date().toISOString(),
      context: 'Auto-detected from Linear issue assignment'
    }]
  });
}
```

### Rules for Auto-Detect

1. **Always include displayName when creating contacts.** The display name from Linear (e.g., `therealstefan`, `corey1`) is essential for matching. Never create a contact with just a userId and no name.
2. **Use workspace `indigo-ai`** for all Linear identifiers (the only workspace currently configured).
3. **Skip self-interactions.** Do not log interactions for Stefan's own actions (userId `0f41fe7e-9ad7-4de3-8e70-10aa7b42d001`).
4. **Interaction summaries should be brief** (one sentence). Include the issue identifier (e.g., DEV-123) and title, not full descriptions.
5. **Merge, don't duplicate.** If a contact already has a Linear identifier for this workspace, update the existing entry (e.g., add displayName) rather than appending a duplicate.
6. **New user ID discovery.** When the API returns a user ID not in CRM, create a CRM contact immediately via `crm.createContact()`. Do not add new users to the Key Users table -- CRM is the source of truth.

## CRM Lookup Protocol (People)

All person data lives in `workspace/crm/contacts/`. Use CRM utilities for all people lookups:

```javascript
const crm = require('./.claude/lib/crm.js');

// === MENTIONING A USER IN A COMMENT ===
// Step 1: Look up the person in CRM for their Linear userId and displayName
const matches = crm.findContact({ name: 'Corey' });
// or: crm.findContact({ linear: { userId: 'be96bce2-...' } });

if (matches.length > 0) {
  const contact = matches[0];
  const linearId = contact.identifiers.linear?.find(l => l.workspace === 'indigo-ai');
  // Use linearId.userId and linearId.displayName in the suggestion_userMentions node
  // {
  //   "type": "suggestion_userMentions",
  //   "attrs": { "id": linearId.userId, "label": linearId.displayName }
  // }
}

// === ASSIGNING AN ISSUE ===
// Step 1: Look up the assignee in CRM for their Linear userId
const matches = crm.findContact({ name: 'Stefan' });
const linearId = matches[0]?.identifiers.linear?.find(l => l.workspace === 'indigo-ai');
// Use linearId.userId as the assigneeId in issueCreate/issueUpdate

// === DISCOVERING NEW USERS ===
// When the API returns a user ID not in CRM, create a contact:
crm.createContact({
  name: apiResponse.displayName,
  identifiers: {
    linear: [{ workspace: 'indigo-ai', userId: apiResponse.id, displayName: apiResponse.displayName }]
  },
  sources: [{
    type: 'linear',
    ref: 'https://linear.app/indigo-ai/issue/DEV-123',
    date: new Date().toISOString(),
    context: 'Auto-detected from Linear API response'
  }]
});
```

**Quick resolution:** Workers can also use the crm-manager's `lookup-person` skill (`/run crm-manager lookup-person`) for formatted contact cards with all identifiers.

**Workflow for unknown users:** If a Linear API response includes a user not in CRM, create a CRM contact immediately. Never add them to the Key Users table below -- CRM is the source of truth.

## Teams

| Key | Name | ID |
|-----|------|-----|
| DEV | Development | f0a1daf3-4382-4bb8-860b-8a86eb372630 |
| DES | Design | 20e4c56b-b92f-4829-9472-529ad3c6874b |
| OPS | Ops | 365773d2-584a-4aa4-9a3f-8e63ab24d401 |
| PRO | Product | 4b15a005-b6ac-4fd0-82b9-97c1e7fffe1e |
| GTM | GTM | a26ef468-7472-4e71-87ac-bbdd59424d9e |

## Key Users (Quick Reference -- CRM is source of truth)

> **Do not add new users here.** New user discoveries go to CRM via `crm.createContact()`.
> For lookups, always use `crm.findContact()` first. This table is a frozen snapshot only.

| Name | ID | Display Name | Profile URL |
|------|-----|-------------|-------------|
| Stefan Johnson | 0f41fe7e-9ad7-4de3-8e70-10aa7b42d001 | therealstefan | https://linear.app/indigo-ai/profiles/therealstefan |
| Corey Epstein | be96bce2-6da6-42cf-a834-21f2fa687662 | corey1 | https://linear.app/indigo-ai/profiles/corey1 |
| Yousuf Kalim | 308407ca-7a92-4017-8e80-9a220dd66cc5 | — | — |

## Creating Issues

```graphql
mutation CreateIssue($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue { id identifier url title }
  }
}
```

Variables:
```json
{
  "input": {
    "teamId": "TEAM_ID",
    "title": "Issue title",
    "description": "Markdown description",
    "assigneeId": "USER_ID",
    "priority": 2
  }
}
```

## Updating Issues

```graphql
mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) { success }
}
```

## Adding Comments with @mentions

To mention users in comments, you MUST use `bodyData` (ProseMirror JSON), not `body` (markdown). The `body` field does not resolve mentions -- even bare profile URLs render as plain text in the UI.

### Mention node format

```json
{
  "type": "suggestion_userMentions",
  "attrs": {
    "id": "USER_UUID",
    "label": "Display Name"
  }
}
```

### Full comment with mention example

```json
{
  "input": {
    "issueId": "ISSUE_ID",
    "bodyData": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Hey \"},{\"type\":\"suggestion_userMentions\",\"attrs\":{\"id\":\"USER_UUID\",\"label\":\"Display Name\"}},{\"type\":\"text\",\"text\":\" - what do you think?\"}]}]}"
  }
}
```

### IMPORTANT: Encoding rules for bodyData

- **Never use em dashes** (`--` or unicode `\u2014`) in bodyData text. They render as `�` (replacement character) in the Linear UI.
- Use a regular hyphen `-` or double hyphen `--` instead.
- Avoid other non-ASCII punctuation (curly quotes, ellipsis character, etc.) -- stick to plain ASCII in bodyData strings.
- The `bodyData` value is a JSON string inside JSON, so it requires double-escaping of quotes.

### GraphQL mutation

```graphql
mutation CreateComment($input: CommentCreateInput!) {
  commentCreate(input: $input) {
    success
    comment { id body bodyData }
  }
}
```

## Fetching Comments

```graphql
{ comments(first: 10) { nodes { id body bodyData user { name } } } }
```

## Auth

API key passed as header: `Authorization: lin_api_...`

The key is stored in `C:\hq\.env` as `LINEAR_API_KEY`.
