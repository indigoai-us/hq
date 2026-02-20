---
description: Quick inbox cleanup — archive junk, then triage what matters one at a time
allowed-tools: Task, Read, Glob, Grep, Bash, Write, AskUserQuestion, ToolSearch, mcp__gmail-local__*
argument-hint: [account] (default: all)
visibility: public
---

# /checkemail — Inbox Cleanup + Triage

Two-phase inbox sweep: (1) fetch + classify, (2) launch triage UI for archive review + email-by-email triage, (3) execute actions from responses.

**Accounts:** vyg (corey@vyg.ai), indigo (corey@getindigo.ai), personal (me@{your-username}.com), abacus (corey.epstein@goabacus.co)

**User's input:** $ARGUMENTS

## Setup

Load gmail tools: `ToolSearch` with query `+gmail-local`.

Determine accounts: if user specified one, use it. Otherwise all 4.

## Phase 1 — Fetch + Classify

1. `list_emails` for each account (no max_results limit, parallel)
2. For every email with a threadId, check if user already replied:
   - `get_thread` for each thread (parallel, batch by account)
   - If any message in thread has `from:` matching the account's address, mark as **already handled**
3. Classify every inbox email into one of:
   - **Archive** — newsletters, promotions, notifications, social, expired codes, calendar accepts, duplicate sends, FYI-only items user already replied to
   - **Triage** — needs user attention (action required, waiting on reply, unread from a real person, financial/legal)

### Always-archive rules

These are ALWAYS classified as Archive without asking:
- Vanta security task reminders
- Slack security codes
- Newsletters / Substacks / daily digests
- Promotional emails (CATEGORY_PROMOTIONS)
- Social notifications (CATEGORY_SOCIAL, Nextdoor, etc.)
- Duplicate sends (same subject/thread to multiple aliases)
- Calendar accepts/declines (no action needed)
- USPS Informed Delivery
- Automated billing receipts
- GitHub notifications (PRs, commits, reviews, CI) — except billing or admin-level alerts
- Marketing emails (product announcements, webinars, feature promos from SaaS tools)
- Tool/service update notices (Wise, Granola, Zoom renewals, Mercury notifications)
- Threads where user already sent the most recent reply (waiting on other party)

## Phase 2 — Write Queue + Launch App

Build an `EmailTriageQueue` JSON from classified emails and launch the triage UI app.

### Queue schema

```typescript
interface EmailTriageQueue {
  id: string;              // unique slug (e.g. "triage-20260213-1400")
  createdAt: string;       // ISO 8601
  accounts: string[];      // accounts checked
  archiveProposals: ArchiveProposal[];
  triageItems: TriageItem[];
}

interface ArchiveProposal {
  id: string;              // unique (e.g. "arch-{index}")
  account: string;         // "vyg" | "personal" | "indigo" | "abacus"
  messageId: string;       // Gmail message ID
  threadId: string;
  from: string;
  subject: string;
  date: string;            // ISO 8601
  reason: string;          // why archive (e.g. "Newsletter/digest")
  snippet?: string;        // enriched — used if user excludes to triage
  status?: string;
  labels?: string[];
  body?: string;
}

interface TriageItem {
  id: string;              // unique (e.g. "tri-{index}")
  account: string;
  messageId: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  status: string;          // "Unread" | "Waiting on them" | "FYI"
  reason: string;
  actionLink?: string;     // extracted CTA link for platform invites
  labels: string[];
  body?: string;           // full body when available (for reply drafting)
}
```

### Steps

1. Build the queue from classified emails:
   - `archiveProposals[]` from all emails classified as Archive
   - `triageItems[]` from all emails classified as Triage
   - Include `body` field on triage items when available
   - Include enriched fields (`snippet`, `status`, `labels`) on archive proposals too
   - Extract `actionLink` for EVERY triage item — parse body for URLs, or `read_email` for HTML CTA if no plain-text link found. Every billing, payment, admin, or action-required email has a link — find it

2. Write queue to email-triage app:
   ```bash
   mkdir -p ~/Documents/HQ/repos/private/email-triage/data
   ```
   Write the JSON to `~/Documents/HQ/repos/private/email-triage/data/queue.json`

3. Launch app — check port 3034:
   ```bash
   curl -s http://localhost:3034/api/status 2>/dev/null
   ```
   If not running, launch via Tauri dev (starts both Next.js + desktop window):
   ```bash
   cd ~/Documents/HQ/repos/private/email-triage && npm run tauri:dev &
   ```
   Wait ~15s for Tauri + Next.js compilation.

4. Tell user:
   > Email triage ready at http://localhost:3034
   > {N} to archive, {N} to triage. Complete in the app and I'll execute.

5. Poll `GET http://localhost:3034/api/status` every 3 seconds until `completedAt` is non-null. Timeout after 30 minutes — warn at 24.

## Phase 3 — Execute Actions

Read responses from `~/Documents/HQ/repos/private/email-triage/data/responses.json`

### Response schema

```typescript
interface EmailTriageResponseFile {
  queueId: string;
  archivedIds: string[];         // approved archive proposal IDs
  excludedFromArchive: string[]; // IDs user moved to triage
  triageResponses: TriageResponse[];
  completedAt?: string;
}

interface TriageResponse {
  itemId: string;
  action: "archive" | "reply" | "skip" | "trash" | "project";
  replyText?: string;
  discussion?: ChatMessage[];     // inline chat history (for context)
  projectContext?: ProjectStub;   // if action is "project"
  respondedAt: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface ProjectStub {
  name: string;
  description: string;
  emailContext: {
    from: string;
    subject: string;
    body?: string;
    account: string;
    date: string;
  };
}
```

### Execute

1. **Archives from archive review:** Map `archivedIds` back to `messageId` via queue. Group by account. `batch_modify` per account with archive action.

2. **Triage responses:**
   - `action: "archive"` → `batch_modify` archive (group by account)
   - `action: "reply"` → `draft_email` with `replyText` (NEVER `reply_email`). Show draft to user for approval before sending. If `discussion` exists, use it for context when reviewing the draft.
   - `action: "trash"` → `batch_modify` trash (group by account)
   - `action: "skip"` → no action
   - `action: "project"` → create project stub (see below)

3. **Project stubs:** For each response with `action: "project"`:
   - Read `projectContext` from the response
   - Create directory: `mkdir -p ~/Documents/HQ/projects/{stub.name}/`
   - Write `prd.json`:
     ```json
     {
       "name": "{stub.name}",
       "description": "{stub.description}",
       "branchName": "",
       "userStories": [],
       "metadata": {
         "goal": "{stub.description}",
         "origin": "email-triage",
         "emailFrom": "{stub.emailContext.from}",
         "emailSubject": "{stub.emailContext.subject}"
       }
     }
     ```
   - Write `README.md` with email context + description
   - Report: "Created project stub: {name} — run /prd {name} to flesh it out"

4. **Clean up:** Delete `data/queue.json` and `data/responses.json`

5. **Report:** "Inbox clear. N archived, N replied, N skipped, N trashed, N projects created."

## Rules

- Always specify `account` parameter explicitly on all gmail MCP calls
- ALWAYS `get_thread` before classifying — never assume no reply was sent based on `read_email` alone
- ALWAYS show reply drafts for approval before sending — never auto-send
- Pull HQ context (qmd search, company settings) when drafting replies from replyText
- Respect company isolation — don't reference one company's data in another's replies
- Threads where user sent the last message = "waiting on them" → archive by default
- If the triage queue is empty after archives, say so and end
- **NEVER** auto-archive account activation emails (e.g. "Activate your account", "Set your password") — always classify as Triage
- **ALWAYS** classify marketing emails, GitHub notifications (except billing/admin), and newsletters as Archive
- **NEVER** auto-archive invitations to collaborate on platforms (Figma, Google Docs, Notion, Linear, etc.) — always classify as Triage
- **ALWAYS** extract `actionLink` for EVERY triage item — not just platform invites. Billing alerts, payment failures, admin actions, subscription notices all have CTA links. Parse `body` for `https://` URLs first. If no URL found in plain text, use `read_email` to get HTML and extract the primary CTA button href. Set as `actionLink` on the TriageItem. Zero triage items should ship without an actionLink unless the email genuinely has none
- If queue.json already exists in the app data dir, ask user before overwriting
