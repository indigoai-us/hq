---
description: Quick inbox cleanup — archive junk, then triage what matters one at a time
allowed-tools: Task, Read, Glob, Grep, Bash, AskUserQuestion, ToolSearch, mcp__gmail-local__*
argument-hint: [account] (default: all)
visibility: public
---

# /checkemail — Inbox Cleanup + Triage

Two-phase inbox sweep: (1) batch archive junk, (2) walk through real emails one by one.

**Accounts:** {repo} (user@example.com), designco (user@example.com), personal (user@example.com), widgets (user@example.com)

**User's input:** $ARGUMENTS

## Setup

Load gmail tools: `ToolSearch` with query `+gmail-local`.

Determine accounts: if user specified one, use it. Otherwise all 4.

## Phase 1 — Fetch + Classify

1. `list_emails` for each account (max_results=25, parallel)
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

### Present results

Show a single summary with two sections:

**Proposed archives** — grouped table by account:
```
## Proposed Archives (N emails)

### {repo} (X)
| From | Subject | Reason |
|------|---------|--------|

### Personal (Y)
...
```

**Triage queue** — numbered list across all accounts:
```
## Triage Queue (N emails)

| # | Account | From | Subject | Status |
|---|---------|------|---------|--------|
| 1 | {repo} | {Contact Name} | Re: Board Follow up | Unread, needs reply |
| 2 | widgets | {Contact Name} | Google Tag Manager | Waiting on them |
```

Then ask: **"Archive all N? Then we'll walk through triage."**

Wait for user confirmation. User may exclude items from archive or add items to archive.

## Phase 2 — Archive

On approval, `batch_modify` per account (archive action). Report count.

If user excluded items, move them to triage queue.

## Phase 3 — Triage (one at a time)

For each email in triage queue, in priority order (unread action-needed first, then FYI):

1. Show the email:
   ```
   ### [#1] {repo} — {Contact Name}
   **Subject:** Re: Board Follow up
   **Date:** Wed, Feb 11
   **Status:** Unread
   **Snippet:** "It was gross margin for sure. Can you send me link..."
   ```

2. If context would help a reply, silently search qmd + HQ for relevant info (don't show search process, just have context ready).

3. Ask user what to do via `AskUserQuestion`:
   - **Archive** — done with it
   - **Reply** — draft a reply (pull HQ context, show draft for approval before sending)
   - **Skip** — come back to it later
   - (user can always type a custom action)

4. Execute the action. If reply: draft it, show it, wait for approval, then send.

5. Move to next email. Repeat until queue is empty.

When done: **"Inbox clear. N archived, N replied, N skipped."**

## Rules

- Always specify `account` parameter explicitly
- ALWAYS `get_thread` before classifying — never assume no reply was sent based on `read_email` alone
- ALWAYS show reply drafts for approval before sending — never auto-send
- Pull HQ context (qmd search, company settings) when drafting replies
- Respect company isolation — don't reference one company's data in another's replies
- One triage email at a time — wait for user decision before showing next
- Keep summaries concise — sender, subject, date, one-line snippet. Full body only if user asks or if drafting a reply
- Threads where user sent the last message = "waiting on them" → archive by default
- If the triage queue is empty after archives, say so and end
- **NEVER** auto-archive account activation emails (e.g. "Activate your account", "Set your password") — always classify as Triage. These are action-required with time-sensitive links
- **ALWAYS** classify marketing emails, GitHub notifications (except billing/admin), and newsletters as Archive. Don't list them individually in the Proposed Archives table — just show count per account (e.g. "{repo}: 3, Personal: 12"). Still wait for user approval before archiving
