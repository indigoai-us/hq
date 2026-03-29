---
name: crm
description: Manage contacts and people context in HQ. Use when the user mentions a person by name and context would be useful, when sending messages (Slack, iMessage), when assigning work (Linear), or when the user asks "who is X?", "add a contact", "note about X". Also triggers proactively — when the agent learns something notable about a person (role, preference, expertise), it should offer to save a note.
allowed-tools: Read, Write, Glob, Grep, Bash(scripts/slack.sh:*)
---

# HQ CRM — Contact Management

Manage the people you work with across all companies. Contacts are global YAML files at `contacts/{slug}.yaml`.

## When to Use

- **Explicit:** User runs `/contact`, `/who`, or asks about a person
- **Implicit — resolve handles:** Before sending a Slack DM, look up the person in contacts first. Before assigning a Linear issue, check contacts for their Linear user ID. Before `/imessage`, check for phone number.
- **Implicit — enrich contacts:** When the agent discovers new info about a person during a session (e.g., learns their role from a Slack message, discovers their email from a PR, sees them assigned in Linear), offer to update their contact file.

## Contact File Structure

```yaml
name: Full Name
slug: full-name              # lowercase, hyphens
added: "YYYY-MM-DD"
updated: "YYYY-MM-DD"
role: General Role            # optional, can also be per-company

handles:                      # global handles
  email: name@example.com
  phone: "+1XXXXXXXXXX"
  github: username

companies:                    # company-specific context
  {company-slug}:
    role: Role at Company
    slack:
      user_id: "UXXXXXXXXX"
      display_name: "name"
      workspace: workspace-name
    linear:
      user_id: "uuid"
    context: "Freeform notes about this person in this company context"

tags: [engineering, leadership]

notes:                        # append-only, newest first
  - date: "YYYY-MM-DD"
    text: "What was learned"
```

## Resolution Flow (for /slack, /imessage, Linear)

1. Search `contacts/*.yaml` by name/slug (case-insensitive partial match)
2. If found → extract the needed handle (Slack user ID, phone, Linear ID)
3. If handle missing → use service API to look it up (e.g., `scripts/slack.sh lookup-user`)
4. Cache the discovered handle back to the contact file
5. If no contact found → use service API, then create a new contact file with what was learned

## Auto-Enrichment Guidelines

When the agent encounters a person during work and learns useful context:

**Worth saving:**
- Communication preferences ("prefers Slack", "responds quickly", "timezone GMT+5")
- Expertise areas ("owns the billing system", "go-to for React questions")
- Role changes ("promoted to VP", "moved to Platform team")
- Decision-making context ("signs off on infra spend", "product owner for feature X")
- Relationship context ("reports to Jane", "works closely with Bob on project Y")

**Not worth saving:**
- Ephemeral task details ("reviewed PR #123")
- Things derivable from other systems (git blame, Linear assignments)
- Sensitive personal information beyond what's needed for work routing

## Commands

| Command | Purpose |
|---------|---------|
| `/contact show <name>` | Full contact card |
| `/contact add <name>` | Create new contact |
| `/contact note <name> <text>` | Append a note |
| `/contact edit <name>` | Update fields |
| `/contact search <query>` | Search all contacts |
| `/contact list` | List all contacts |
| `/who <name>` | Quick compact lookup |
