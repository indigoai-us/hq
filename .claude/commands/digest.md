---
description: Generate Presidential Daily Brief email digest
allowed-tools: Read, Write, AskUserQuestion
---

# Email Digest Skill

Generate an HTML "Presidential Daily Brief" from your emails.

## Prerequisites

Before running this skill:
1. Configure email accounts in `settings/email/accounts.json`
2. Set up email worker in `workers/assistant/email/`

## Process

1. **Fetch emails** from accounts in `settings/email/accounts.json`
2. **Classify** each email: urgent | actionable | fyi | archive
3. **Generate HTML** digest with styled PDB format
4. **Save and open** the digest

## Classification Rules

| Category | Criteria | Examples |
|----------|----------|----------|
| **URGENT** | Time-sensitive, requires immediate action | Payment failures, security alerts, time-limited requests |
| **ACTIONABLE** | Needs response/action, not time-critical | Meeting requests, questions, tasks |
| **FYI** | Informational, no action needed | Newsletters, updates, confirmations |
| **ARCHIVE** | Can be safely ignored | Marketing, spam, automated notifications |

## Output Format

Create `workspace/digests/{date}-pdb.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { background: #1a1a2e; color: #e0e0e0; font-family: system-ui; }
    .urgent { border-left: 4px solid #ff4444; }
    .actionable { border-left: 4px solid #ff9944; }
    .fyi { border-left: 4px solid #4488ff; }
    .archive { opacity: 0.6; }
  </style>
</head>
<body>
  <h1>Presidential Daily Brief - {date}</h1>

  <h2 style="color: #ff4444;">URGENT</h2>
  <!-- urgent emails -->

  <h2 style="color: #ff9944;">ACTIONABLE</h2>
  <!-- actionable emails -->

  <h2 style="color: #4488ff;">FYI</h2>
  <!-- fyi emails -->

  <details>
    <summary>Archive ({count})</summary>
    <!-- archive emails collapsed -->
  </details>
</body>
</html>
```

## Manual Workflow (if no email integration)

1. Copy your unread emails into a text file
2. Run this skill with the content
3. It will classify and format into the PDB structure

## After Generation

- Open `workspace/digests/{date}-pdb.html` in browser
- Process urgent items first
- Schedule time for actionable items
- Archive or batch-process FYI items
