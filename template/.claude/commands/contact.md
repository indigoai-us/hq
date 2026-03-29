---
description: View, add, update, or search contacts in the HQ CRM
allowed-tools: Bash, Read, Write, Glob, Grep, Agent
argument-hint: "[add|note|search|list|show] <name> [details...]"
visibility: public
---

# /contact — HQ Contact Manager

Manage the people you work with. Contacts live in `contacts/{slug}.yaml` — one file per person, global to HQ.

**Arguments:** $ARGUMENTS

## Subcommands

### `show <name>` (default when just a name is given)

Look up a contact by name (case-insensitive partial match).

1. Search `contacts/*.yaml` files — match against `name`, `slug`, or `tags`
2. If exactly one match → display a formatted card:
   ```
   # Jane Smith
   Role: Head of Engineering
   Email: jane@example.com
   Tags: engineering, leadership

   ## Handles
   - Slack (acme): @jane.smith (U08EXAMPLE1)
   - Linear (acme): abc123-def456
   - Phone: +1XXXXXXXXXX

   ## Companies
   - acme-corp: VP Engineering
     "Reports to CEO. Owns platform team."

   ## Recent Notes
   - 2026-01-20: Prefers Slack over email...
   - 2026-01-15: Met at kickoff meeting...
   ```
3. If multiple matches → list them and ask user to pick
4. If no match → say so, offer to create

### `add <name>`

Create a new contact.

1. Generate slug from name (lowercase, hyphens): "Jane Smith" → `jane-smith`
2. Check if `contacts/{slug}.yaml` already exists — if so, show it and ask if they meant `show`
3. Create `contacts/{slug}.yaml` with:
   - `name`, `slug`, `added` (today's date), `updated` (today's date)
   - Any additional info the user provided (role, email, company, etc.)
   - Empty `notes: []` and `tags: []` if not provided
4. Report: `Created contact: {name} → contacts/{slug}.yaml`

### `note <name> <text>`

Add a note to an existing contact.

1. Resolve contact (same as `show`)
2. Prepend a new entry to the `notes` list:
   ```yaml
   - date: "YYYY-MM-DD"
     text: "<the note>"
   ```
3. Update the `updated` field
4. Report: `Added note to {name}`

### `edit <name>`

Update contact fields.

1. Resolve contact (same as `show`)
2. Read the current file
3. Apply whatever changes the user described (role, handles, tags, company context, etc.)
4. Update the `updated` field
5. Report what changed

### `search <query>`

Search across all contacts.

1. Search `contacts/*.yaml` files — match `query` against:
   - `name`, `slug`, `role`, `tags`, `notes[].text`, `companies.*.role`, `companies.*.context`
2. Display matching contacts as a compact list:
   ```
   Found 3 contacts matching "engineering":
   - Jane Smith (engineering, leadership) — VP Engineering @ acme-corp
   - Bob Jones (engineering, backend) — Senior Engineer @ acme-corp
   - Alice Lee (engineering) — CTO @ other-co
   ```

### `list`

List all contacts.

1. Read all `contacts/*.yaml` files (skip `_example.yaml`)
2. Display as compact list sorted by name:
   ```
   Contacts (12):
   - Alice Lee — CTO @ other-co [engineering]
   - Bob Jones — Senior Engineer @ acme-corp [engineering, backend]
   - Jane Smith — VP Engineering @ acme-corp [engineering, leadership]
   ...
   ```

## No Subcommand — Smart Routing

If the user just says `/contact Jane Smith` without a subcommand, treat it as `show`.
If the user says `/contact Jane Smith is the new CTO`, treat it as `edit` (update role).
If the user says `/contact add Bob Jones`, treat it as `add`.

Use judgment — the user shouldn't need to memorize subcommands.

## Rules

- Contact files are global — NOT company-scoped. Company-specific info goes under `companies:` key
- Slug format: lowercase, hyphens, no spaces (e.g., `jane-smith`)
- Skip `_example.yaml` in all list/search operations
- When adding handles (Slack, Linear, etc.), put them under the appropriate company in `companies:` if company-specific, or at the top-level `handles:` if global (email, phone, github)
- Notes are append-only (newest first) — never delete or edit existing notes
- Always update the `updated` field when modifying a contact
- Keep the YAML clean — don't add empty keys. Only write fields that have values
