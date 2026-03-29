---
description: Quick contact lookup — "who is <name>?"
allowed-tools: Read, Glob, Grep
argument-hint: "<name>"
visibility: public
---

# /who — Quick Contact Lookup

Fast way to look up a person. Shows their contact card with all known info.

**Arguments:** $ARGUMENTS

## Process

1. If no arguments: `Usage: /who <name>`

2. Search `contacts/*.yaml` files (skip `_example.yaml`) — match against `name`, `slug`, `tags`, or any handle value. Case-insensitive partial match.

3. If exactly one match → display a compact card:
   ```
   Jane Smith — VP Engineering @ acme-corp
   Email: jane@example.com | Phone: +1XXXXXXXXXX
   Slack (acme): @jane.smith | Linear (acme): abc123
   Tags: engineering, leadership

   Latest: "Prefers Slack over email. Usually responds within an hour." (2026-01-20)
   ```

4. If multiple matches → list names and ask user to pick

5. If no match → `No contact found for "{name}". Use /contact add {name} to create one.`

## Rules

- Read-only — never creates or modifies contacts (use `/contact` for that)
- Show the most recent note only (not the full history)
- Keep output compact — this is a quick glance, not a deep dive
- Skip `_example.yaml` in search
