# CRM - Contact Relationship Management

Unified contact storage for all people encountered across HQ worker interactions.

## Structure

```
workspace/crm/
├── INDEX.md              # This file
└── contacts/             # One JSON file per contact
    └── {slug}.json       # Contact record (schema: knowledge/hq-core/crm-schema.json)
```

## Schema

Contact schema is defined at `knowledge/hq-core/crm-schema.json`.

Each contact file is named `{slug}.json` where slug is derived from the contact's display name (lowercased, spaces replaced with hyphens, non-alphanumeric characters stripped).

### Key Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Unique identifier |
| `slug` | string | Filename-safe identifier derived from name |
| `name` | object | Display name, first, last, aliases |
| `emails` | array | Email addresses with primary flag |
| `phones` | array | Phone numbers with labels |
| `companies` | array | Company affiliations with roles |
| `title` | string | Current job title |
| `identifiers` | map | External system IDs (slack, linear, github, email, ...) |
| `sources` | array | Where/how this contact was discovered (append-only) |
| `interactions` | array | Log of interactions (append-only) |
| `tags` | array | Free-form tags |
| `notes` | string | Free-form notes |
| `createdAt` | ISO 8601 | Record creation timestamp |
| `updatedAt` | ISO 8601 | Last modification timestamp |

### Identifiers

The `identifiers` field is a map where each key is a system name and the value is an array of identifier objects. This supports multiple accounts per system (e.g., multiple Slack workspaces):

```json
{
  "slack": [
    { "workspace": "indigo-ai", "userId": "U042Z9XCRK3", "dmChannel": "D0672CEKJ1E" },
    { "workspace": "frogbear", "userId": "U08RANNQC5C", "dmChannel": "D08RANPFLFQ" }
  ],
  "linear": [
    { "workspace": "indigo-ai", "userId": "be96bce2-...", "displayName": "corey1" }
  ],
  "github": [
    { "username": "coreyepstein" }
  ],
  "email": [
    { "address": "corey@getindigo.ai", "primary": true }
  ]
}
```

New identifier types can be added without schema changes -- the identifiers map accepts any key with an array of objects.

### Sources

Tracks provenance -- where/how a contact was first discovered:

```json
{
  "type": "slack",
  "ref": "indigo-ai/#general/1708123456.789",
  "date": "2026-02-21T12:00:00Z",
  "context": "Mentioned in project discussion"
}
```

Source types: `slack`, `email`, `linear`, `document`, `manual`, `migration`, `web-research`

### Interactions

Append-only log of touchpoints:

```json
{
  "date": "2026-02-21T14:30:00Z",
  "type": "slack-message",
  "summary": "Discussed HQ Cloud deployment timeline",
  "ref": "indigo-ai/#hq-dev/1708123456.789"
}
```

## Usage

- **CRM utility library:** `.claude/lib/crm.js` (US-002) -- CRUD operations for contacts
- **CRM worker:** `workers/crm-manager/` (US-004) -- enrichment, cleanup, research
- **Commands:** `/clean-crm` (US-005) -- audit and deduplicate contacts
- **Auto-detection:** Workers automatically detect people in Slack, email, and Linear interactions

## Searchability

Contact files are plain JSON and indexed by qmd. Use:
- `qmd search "person name"` for keyword search across contacts
- `qmd vsearch "people at company X"` for semantic search
- CRM utility `findContact()` for programmatic lookup by name, email, or identifier
