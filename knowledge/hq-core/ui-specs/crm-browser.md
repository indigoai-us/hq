# CRM Browser UI Spec

Single-page contact browser for the HQ CRM. Searchable, filterable contact list with detail cards. Read-only -- mutations happen via /clean-crm or CRM workers.

## Data Sources

| Source | Path | Purpose |
|--------|------|---------|
| Contact files | `workspace/crm/contacts/*.json` | Individual contact records |
| CRM schema | `knowledge/hq-core/crm-schema.json` | Schema reference (not loaded at runtime) |

### Contact shape (`workspace/crm/contacts/{slug}.json`)

```json
{
  "id": "uuid-v4",
  "slug": "corey-epstein",
  "name": {
    "display": "Corey Epstein",
    "first": "Corey",
    "last": "Epstein",
    "aliases": []
  },
  "emails": [{ "address": "corey@example.com", "primary": true, "label": "work" }],
  "phones": [{ "number": "+1555123456", "primary": true, "label": "mobile" }],
  "companies": [{ "name": "Indigo", "role": "Co-founder", "current": true }],
  "title": "Co-founder",
  "identifiers": {
    "slack": [{ "workspace": "indigo-ai", "userId": "U042Z9XCRK3", "dmChannel": "D0672CEKJ1E" }],
    "linear": [{ "workspace": "indigo-ai", "userId": "be96bce2-...", "displayName": "corey1" }],
    "github": [{ "username": "coreyepstein" }]
  },
  "sources": [{ "type": "migration", "date": "2026-02-22T04:42:57Z", "ref": "...", "context": "..." }],
  "interactions": [{ "date": "2026-02-22T10:00:00Z", "type": "slack-message", "summary": "...", "ref": "..." }],
  "tags": ["team", "indigo"],
  "notes": "Free-form notes",
  "createdAt": "2026-02-22T04:42:57Z",
  "updatedAt": "2026-02-22T04:42:57Z"
}
```

## Server Routes

### `GET /` -- HTML page

Returns the full single-page application (HTML + CSS + JS inlined). Content-Type: `text/html; charset=utf-8`.

### `GET /api/contacts` -- contact list

Returns a JSON array of all contacts. Each item is the full contact object loaded from its JSON file.

**Data assembly logic:**

1. Read all `.json` files from `workspace/crm/contacts/` using `fs.readdir` with `withFileTypes: true`.
2. For each `.json` file, parse with `readJson()`. Skip files that fail to parse.
3. Sort alphabetically by `name.display` (case-insensitive).
4. Return the full array.

### `GET /api/contacts/:slug` -- single contact detail

Returns a single contact by slug. Reads `workspace/crm/contacts/{slug}.json`.

Returns 404 with `{ "error": "Contact not found" }` if the file does not exist.

### `GET /api/stats` -- CRM statistics

Returns aggregate stats for the header:

```json
{
  "totalContacts": 8,
  "withEmail": 3,
  "withCompany": 6,
  "topTags": ["team", "indigo", "frogbear"],
  "topCompanies": ["Indigo", "FrogBear"],
  "sourceBreakdown": { "migration": 8, "slack": 2, "email": 1 }
}
```

**Assembly logic:**

1. Load all contacts (same as `/api/contacts`).
2. `totalContacts`: array length.
3. `withEmail`: count contacts where `emails.length > 0`.
4. `withCompany`: count contacts where `companies.length > 0`.
5. `topTags`: collect all tags across contacts, count frequency, return top 10 sorted by frequency descending.
6. `topCompanies`: collect all `companies[].name`, count frequency, return top 10 sorted by frequency descending.
7. `sourceBreakdown`: count each `sources[].type` across all contacts.

## Visual Design

### Layout

- Full-viewport dark background (`--bg-primary`)
- Centered container, max-width 960px, 24px vertical padding, 16px horizontal padding
- Header at top, stats bar below header, search/filter bar below stats, contact list below that
- Clicking a contact row opens a detail panel (slide-in from right or inline expansion)

### Header

- Left side: title "CRM" (18px, bold, `--text-primary`) with subtitle "Contact Browser" (12px, `--text-tertiary`)
- Right side: contact count as "{N} contacts" (12px, `--text-tertiary`, tabular-nums)

### Stats Bar

A horizontal row of stat cards below the header, 16px gap, 16px below header. Each stat card:

- Background: `--bg-card`, 1px `--border-subtle` border, 8px border-radius, 12px padding
- Top line: stat value (20px, bold, `--text-primary`, tabular-nums)
- Bottom line: stat label (10px, `--text-tertiary`)
- Cards flex to fill available width equally

| Card | Value | Label |
|------|-------|-------|
| 1 | `{totalContacts}` | Total Contacts |
| 2 | `{withEmail}` | With Email |
| 3 | `{withCompany}` | With Company |
| 4 | `{topCompanies.length}` | Companies |

### Search Bar

Full-width input field, 16px below stats bar:

- Background: `--bg-secondary`, 1px `--border-subtle` border, 8px border-radius, 12px horizontal padding, 40px height
- Placeholder text: "Search by name, email, company, or tag..." (13px, `--text-tertiary`)
- Active/focused: border changes to `--border-active`, subtle inner glow
- Left icon: magnifying glass SVG (16px, `--text-tertiary`)
- Debounced input: 200ms delay before filtering

Search matches against (case-insensitive, substring match):
- `name.display`
- `name.first`, `name.last`
- `name.aliases[]`
- `emails[].address`
- `companies[].name`
- `tags[]`
- `title`
- `notes`

### Filter Pills

Horizontal row of pill-shaped buttons, 12px below search bar, 8px gap:

| Pill | Filters to |
|------|-----------|
| All | All contacts |
| Has Email | contacts where `emails.length > 0` |
| Has Company | contacts where `companies.length > 0` |

Additionally, dynamic tag pills generated from `topTags` (top 5 most frequent tags). Each shows the tag name.

**Active pill style:** background `--accent-yellow`, text `--text-inverse`, border-color `--accent-yellow`.
**Inactive pill style:** transparent background, `--text-secondary` text, 1px `--border-subtle` border. Hover brightens.

Multiple pills can be active simultaneously (AND logic for tag pills; OR logic for Has Email / Has Company).

Filtering is client-side and instant (no server round-trip). Default filter is "All".

### Contact List

Each contact is a row card (`--bg-card` background, 1px `--border-subtle` border, 8px border-radius, 14px vertical padding, 16px horizontal padding). Rows are stacked vertically with 6px gap. Hover brightens border to `--border-active` and cursor changes to pointer.

**Row layout:**

```
[ Avatar ] [ Name          Company      ] [ Tags          ] [ Source Icons ]
  circle     bold 14px     12px muted      badge pills       small icons
           [ Title / Email - one line, truncated ]
             12px, --text-tertiary
```

- **Avatar circle:** 36px circle, `--bg-elevated` background. Contains first letter of `name.display` (14px, bold, `--text-secondary`, centered). If contact has a tag "team", circle gets `--accent-blue` text. If tag "self", circle gets `--accent-yellow` text and a ring border.
- **Name:** 14px, medium weight, `--text-primary`.
- **Company:** First current company name, 12px, `--text-secondary`. If no company, show em dash.
- **Title / Email line:** 12px, `--text-tertiary`. Shows `title` if present, otherwise first email address, otherwise nothing. Single line with ellipsis overflow.
- **Tags:** Up to 3 tag badges rendered as small pills (10px font, 2px/6px padding, full border-radius, `--bg-tertiary` background, `--text-secondary` text). If more than 3, show "+{N}" count.
- **Source icons:** Small icons (12px) in `--text-tertiary` for each source type the contact has. Use text abbreviations in a monospace font:
  - Slack: "S" in a small rounded square
  - Email: "E" in a small rounded square
  - Linear: "L" in a small rounded square
  - GitHub: "G" in a small rounded square
  - Migration: "M" in a small rounded square

### Contact Detail Panel

Clicking a contact row expands an inline detail panel below the row (accordion-style, animated slide-down 0.2s ease-out). The expanded row gets a thicker left border (3px, `--accent-blue`).

Only one detail panel is open at a time. Clicking another contact closes the current one and opens the new one. Clicking the same contact again closes its panel.

**Detail panel layout:**

```
+------------------------------------------------------------------+
| IDENTIFIERS                                                       |
| [ slack: U042Z9XCRK3 @ indigo-ai   DM: D0672CEKJ1E ]           |
| [ linear: corey1 @ indigo-ai                          ]           |
| [ github: coreyepstein                                 ]           |
+------------------------------------------------------------------+
| EMAILS                                                            |
| corey@example.com (work, primary)                                |
+------------------------------------------------------------------+
| COMPANIES                                                         |
| Indigo - Co-founder (current)                                    |
+------------------------------------------------------------------+
| SOURCES                                                           |
| migration - knowledge/integrations/slack.md - 2026-02-22         |
| migration - knowledge/integrations/linear.md - 2026-02-22        |
+------------------------------------------------------------------+
| RECENT INTERACTIONS                                               |
| 2026-02-22 slack-message: Discussed project timeline              |
| (shows last 10, newest first)                                     |
+------------------------------------------------------------------+
| NOTES                                                             |
| Stefan's partner, main HQ driver                                 |
+------------------------------------------------------------------+
```

**Section structure:**

Each section within the detail panel:

- **Section label:** 10px, uppercase, letter-spacing 1px, `--text-tertiary`, 16px bottom margin
- **Section content:** 12px, `--text-secondary`, 12px vertical padding between items
- **Sections separated by:** 1px `--border-subtle` horizontal line, 16px vertical padding

**Identifiers section:**

For each identifier system (slack, linear, github, email, plus any additional):
- System name as badge (10px, uppercase, `--bg-tertiary` background, `--text-secondary`)
- Identifier details inline: userId, workspace, displayName, dmChannel etc. (12px, `--text-secondary`)
- Each identifier entry on its own line

**Emails section:**

Each email address on its own line:
- Address in `--text-primary` (12px)
- Label and primary status in `--text-tertiary` (10px), parenthesized

**Companies section:**

Each company on its own line:
- Company name in `--text-primary` (12px)
- Role in `--text-secondary` (12px), dash-separated
- Current status: if `current: true`, show green dot; if false, show `--text-tertiary` "(past)"

**Sources section:**

Each source on its own line:
- Source type as badge (same style as identifiers section)
- Reference path or ID (12px, `--text-tertiary`, truncated if long)
- Date formatted as YYYY-MM-DD (12px, `--text-tertiary`, tabular-nums)
- Context string if present (12px, `--text-tertiary`, italic)

**Interactions section:**

Show last 10 interactions, newest first. Each interaction:
- Date formatted as YYYY-MM-DD HH:mm (12px, `--text-tertiary`, tabular-nums)
- Type as badge (same badge style, color varies by type):
  - slack-message: blue badge
  - email-sent / email-received: green badge
  - linear-comment / linear-assignment: yellow badge
  - Other: default `--bg-tertiary`
- Summary text (12px, `--text-secondary`)

If no interactions: show "No interactions recorded" in `--text-tertiary`, italic.

If more than 10 interactions, show "{total - 10} earlier interactions not shown" in `--text-tertiary` at the bottom.

**Notes section:**

Free-form text rendered as-is. 12px, `--text-secondary`, `white-space: pre-wrap`.

If no notes: section is hidden entirely.

### Empty State

When no contacts exist (directory empty or missing), show a centered column:
- 64px circle with `--bg-tertiary` background containing a person SVG icon (32px, `--text-tertiary`)
- "No contacts found" (14px, `--text-secondary`)
- "Run /clean-crm or use the crm-manager worker to add contacts." (12px, `--text-tertiary`, max-width 320px, centered)

When search/filter matches nothing, show: "No contacts match your search." centered, 14px, `--text-tertiary`, with a "Clear search" link button below it.

## Interactions

### Search

- Input field filters the contact list in real-time (200ms debounce)
- Matching is case-insensitive substring across all searchable fields
- Contact count in header updates to show "{filtered} / {total} contacts" when a search is active
- Pressing Escape in the search field clears the search
- Search is additive with filter pills (both must match)

### Filter Pills

- Clicking a pill toggles it active/inactive
- "All" pill clears all other filters and search
- Tag pills are AND with other active tag pills (contact must have all selected tags)
- "Has Email" and "Has Company" pills are AND with each other and with tag pills
- Counts on pills update to reflect current matches
- Client-side only, no server calls

### Detail Panel Accordion

- Clicking a contact row toggles its detail panel open/closed
- Only one panel open at a time
- Opening a new panel smoothly closes the previous one
- Panel slides down with a 0.2s ease-out animation
- Panel slides up with a 0.15s ease-in animation on close
- Expanded row gets a left accent border and slightly elevated background (`--bg-secondary`)

### Keyboard Navigation

- Tab through contact rows (each row is focusable with `tabindex="0"`)
- Enter or Space on a focused row toggles its detail panel
- Escape closes any open detail panel
- Tab navigates between sections within an open detail panel
- Up/Down arrow keys navigate between contact rows

## CSS Theme Block

Include the full HQ dark theme from the runtime protocol. Additionally, include these CRM-specific styles:

```css
/* Search */
.search-container { position: relative; margin-bottom: 12px; }
.search-icon {
  position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
  width: 16px; height: 16px; color: var(--text-tertiary); pointer-events: none;
}
.search-input {
  width: 100%; height: 40px;
  background: var(--bg-secondary); color: var(--text-primary);
  border: 1px solid var(--border-subtle); border-radius: 8px;
  padding: 0 12px 0 36px; font-size: 13px;
  outline: none; transition: border-color 0.15s;
}
.search-input:focus { border-color: var(--border-active); }
.search-input::placeholder { color: var(--text-tertiary); }

/* Stats bar */
.stats-bar { display: flex; gap: 16px; margin-bottom: 16px; }
.stat-card {
  flex: 1;
  background: var(--bg-card); border: 1px solid var(--border-subtle);
  border-radius: 8px; padding: 12px; text-align: center;
}
.stat-value { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
.stat-label { font-size: 10px; color: var(--text-tertiary); margin-top: 2px; }

/* Contact row */
.contact-row {
  background: var(--bg-card); border: 1px solid var(--border-subtle);
  border-radius: 8px; padding: 14px 16px;
  cursor: pointer; transition: border-color 0.15s, background 0.15s;
  display: flex; align-items: center; gap: 12px;
}
.contact-row:hover { border-color: var(--border-active); }
.contact-row.expanded {
  border-left: 3px solid var(--accent-blue);
  background: var(--bg-secondary);
  border-radius: 8px 8px 0 0;
}
.contact-row:focus-visible { outline: 2px solid var(--accent-blue); outline-offset: 2px; }

/* Avatar */
.avatar {
  width: 36px; height: 36px; min-width: 36px;
  border-radius: 50%; background: var(--bg-elevated);
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700; color: var(--text-secondary);
}
.avatar.team { color: var(--accent-blue); }
.avatar.self { color: var(--accent-yellow); border: 2px solid var(--accent-yellow); }

/* Contact info */
.contact-info { flex: 1; min-width: 0; }
.contact-name { font-size: 14px; font-weight: 500; }
.contact-company { font-size: 12px; color: var(--text-secondary); margin-left: 8px; }
.contact-subtitle { font-size: 12px; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }

/* Tags */
.contact-tags { display: flex; gap: 4px; flex-shrink: 0; }
.tag-badge {
  font-size: 10px; padding: 2px 6px;
  border-radius: 9999px;
  background: var(--bg-tertiary); color: var(--text-secondary);
}
.tag-more { font-size: 10px; color: var(--text-tertiary); padding: 2px 4px; }

/* Source indicators */
.source-icons { display: flex; gap: 3px; flex-shrink: 0; }
.source-icon {
  width: 18px; height: 18px; border-radius: 4px;
  background: var(--bg-tertiary); color: var(--text-tertiary);
  font-size: 9px; font-weight: 600; font-family: monospace;
  display: flex; align-items: center; justify-content: center;
}

/* Detail panel */
.detail-panel {
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle); border-top: none;
  border-radius: 0 0 8px 8px;
  padding: 20px 16px;
  overflow: hidden;
  animation: slideDown 0.2s ease-out;
}
@keyframes slideDown {
  from { max-height: 0; opacity: 0; padding: 0 16px; }
  to { max-height: 800px; opacity: 1; padding: 20px 16px; }
}

.detail-section { padding: 12px 0; border-bottom: 1px solid var(--border-subtle); }
.detail-section:last-child { border-bottom: none; }
.detail-section-label {
  font-size: 10px; text-transform: uppercase; letter-spacing: 1px;
  color: var(--text-tertiary); margin-bottom: 8px;
}
.detail-row { font-size: 12px; color: var(--text-secondary); padding: 4px 0; display: flex; align-items: center; gap: 8px; }
.detail-value { color: var(--text-primary); }
.detail-muted { color: var(--text-tertiary); font-style: italic; }

/* Identifier badges */
.system-badge {
  display: inline-block; font-size: 10px; text-transform: uppercase;
  padding: 1px 6px; border-radius: 4px;
  background: var(--bg-tertiary); color: var(--text-secondary);
  font-weight: 600; letter-spacing: 0.5px; min-width: 40px; text-align: center;
}

/* Interaction type badges */
.interaction-badge { font-size: 10px; padding: 1px 6px; border-radius: 4px; font-weight: 500; }
.interaction-badge.slack { background: rgba(59,130,246,0.15); color: var(--accent-blue); }
.interaction-badge.email { background: rgba(74,222,128,0.15); color: var(--accent-green); }
.interaction-badge.linear { background: rgba(245,197,66,0.15); color: var(--accent-yellow); }
.interaction-badge.other { background: var(--bg-tertiary); color: var(--text-secondary); }

/* Current company indicator */
.current-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent-green); display: inline-block; }

/* Empty state */
.empty-state {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 64px 16px; text-align: center;
}
.empty-icon {
  width: 64px; height: 64px; border-radius: 50%;
  background: var(--bg-tertiary);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 16px;
}
```

## Data Shape Summary

The `/api/contacts` endpoint returns:

```typescript
interface Contact {
  id: string;               // UUID v4
  slug: string;             // filename stem, e.g. "corey-epstein"
  name: {
    display: string;        // "Corey Epstein"
    first?: string;
    last?: string;
    aliases: string[];
  };
  emails: Array<{ address: string; primary?: boolean; label?: string }>;
  phones: Array<{ number: string; primary?: boolean; label?: string }>;
  companies: Array<{ name: string; role?: string; current?: boolean }>;
  title?: string;
  identifiers: {
    slack?: Array<{ workspace?: string; userId: string; dmChannel?: string; displayName?: string }>;
    linear?: Array<{ workspace?: string; userId: string; displayName?: string }>;
    github?: Array<{ username: string; profileUrl?: string }>;
    email?: Array<{ address: string; primary?: boolean }>;
    [system: string]: Array<Record<string, unknown>> | undefined;
  };
  sources: Array<{ type: string; date: string; ref?: string; context?: string }>;
  interactions: Array<{ date: string; type: string; summary: string; ref?: string }>;
  tags: string[];
  notes?: string;
  createdAt: string;        // ISO 8601
  updatedAt: string;        // ISO 8601
}
```

The `/api/stats` endpoint returns:

```typescript
interface CRMStats {
  totalContacts: number;
  withEmail: number;
  withCompany: number;
  topTags: string[];         // top 10 by frequency
  topCompanies: string[];    // top 10 by frequency
  sourceBreakdown: Record<string, number>;
}
```

## Generation Notes

An agent reading this spec plus the runtime protocol should generate a single `.js` file that:

1. Uses Node `http`, `fs/promises`, `path`, `url` -- no other modules.
2. Implements all routes (`GET /`, `GET /api/contacts`, `GET /api/contacts/:slug`, `GET /api/stats`).
3. Embeds the full HTML page with CSS custom properties and all component styles as a template literal.
4. Embeds the client-side JavaScript as a template literal implementing: data fetch on load, contact list rendering with avatars, search with debounce, filter pills with tag generation, accordion detail panels with all sections (identifiers, emails, companies, sources, interactions, notes), keyboard navigation, empty state.
5. Handles `HQ_ROOT` env var (defaults to `C:\hq`), `PORT` env var (defaults to 3100).
6. Binds to localhost, handles SIGINT/SIGTERM for graceful shutdown.
7. Uses `path.join()` for all filesystem paths (Windows compatible).
8. All data access is read-only -- no POST routes, no file writes.
