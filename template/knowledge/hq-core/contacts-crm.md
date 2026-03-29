# Contacts CRM

HQ's built-in people directory. One YAML file per person at `contacts/{slug}.yaml`.

## Philosophy

Contacts are **global to HQ**, not company-scoped. A person is a person — they may work across multiple companies. Company-specific context (Slack handles, Linear IDs, roles) nests under the `companies:` key in their contact file.

The CRM is designed for **progressive enrichment**. A contact starts minimal (name + one handle) and grows richer as the agent interacts with that person across sessions. Notes accumulate. Handles get discovered. Context builds over time.

## File Location

```
contacts/
  _example.yaml          # Template — skipped by all commands
  jane-smith.yaml         # One file per person
  bob-jones.yaml
  ...
```

## Schema

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Full name |
| `slug` | string | Lowercase, hyphenated (e.g., `jane-smith`) — also the filename |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `added` | date | When this contact was created |
| `updated` | date | When last modified |
| `role` | string | General role/title |
| `handles` | map | Global service handles (email, phone, github, linkedin) |
| `companies` | map | Company-specific context blocks (keyed by company slug) |
| `tags` | list | For filtering and search |
| `notes` | list | Append-only log, newest first |

### Company Block

Each entry under `companies:` can have:

| Field | Type | Description |
|-------|------|-------------|
| `role` | string | Role at this specific company |
| `slack` | map | `user_id`, `display_name`, `workspace` |
| `linear` | map | `user_id` |
| `context` | string | Freeform company-specific notes |

### Notes

```yaml
notes:
  - date: "2026-03-28"
    text: "Prefers async communication over meetings"
```

Notes are **append-only** — never edit or delete existing notes. The agent adds notes when it learns something useful. Notes are ordered newest-first.

## Integration Points

### /slack

When sending a DM, `/slack` resolves the recipient by:
1. Searching `contacts/*.yaml` for a name match
2. Looking for `companies.{co}.slack.user_id`
3. If not found → uses `scripts/slack.sh lookup-user` to search the Slack workspace by name
4. Caches the discovered Slack handle back to the contact file

### /imessage

Looks up `handles.phone` from the contact file. If no phone number, tells the user to add one via `/contact edit`.

### Linear Integration

When assigning issues or mentioning reviewers, checks `companies.{co}.linear.user_id` from the contact file.

### Auto-Enrichment

The CRM skill encourages the agent to proactively offer to save useful context about people. When the agent learns something notable during a session — a role, a preference, an area of expertise — it should offer to add a note or update the contact.

## Commands

| Command | Description |
|---------|-------------|
| `/contact show <name>` | Display full contact card |
| `/contact add <name>` | Create a new contact |
| `/contact note <name> <text>` | Append a note to a contact |
| `/contact edit <name>` | Update any field on a contact |
| `/contact search <query>` | Search across all contacts |
| `/contact list` | List all contacts |
| `/who <name>` | Quick compact lookup |

## Design Principles

1. **One person, one file** — no duplicates across companies
2. **Global + company-specific** — global handles (email, phone) at top level, company-scoped handles (Slack, Linear) nested under `companies:`
3. **Progressive enrichment** — contacts grow richer over time as the agent discovers info
4. **Append-only notes** — notes are a log, not a document. Never edit or delete.
5. **Agent decides what's worth storing** — not every interaction is a note. Save context that helps future sessions.
6. **No sensitive data** — no passwords, tokens, or financial information in contacts
