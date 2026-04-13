---
title: CLI Reference
description: All create-hq commands and flags for HQ Teams.
---

## create-hq

The main installer. Creates a new HQ and optionally sets up team workspaces.

```bash
npx create-hq [options]
```

### Options

| Flag | Description |
|------|-------------|
| `--invite <token>` | Join a team via invite token. Skips the setup wizard and goes straight to the join flow. |
| `--join <token>` | Alias for `--invite`. |
| `--yes` | Accept all defaults without prompting. |
| `--local-template <path>` | Use a local template directory instead of downloading from GitHub. For development only. |

### Entry modes

When run without `--invite`, the installer asks a series of questions to determine the flow:

1. **"Do you have an HQ Teams account?"**
   - **Yes** → Teams existing flow (auto-discovery or invite code prompt)
   - **No** → Continue to next question

2. **"Would you like to create an HQ Teams account?"**
   - **Yes** → Admin onboarding (create team, GitHub org, invite members)
   - **No** → Continue to next question

3. **"Set up a personal HQ instead?"**
   - **Yes** → Personal HQ (no GitHub, no teams)
   - **No** → Exit

### Examples

```bash
# Interactive setup (auto-detects best flow)
npx create-hq

# Join a team with an invite token
npx create-hq --invite hq_eyJvcmciOiJpbmRpZ29haS11cyIs...

# Non-interactive with defaults
npx create-hq --yes
```

---

## create-hq invite

Generate invite tokens and send GitHub org invites for an existing team.

```bash
npx create-hq invite
```

Must be run from within an HQ directory that contains `companies/*/team.json`. Finds team metadata automatically by walking up from the current directory.

### Flow

1. If multiple teams found, prompts for which team
2. Authenticates via GitHub device flow (or reuses cached token)
3. For each invite:
   - Prompts for member's email (optional)
   - Generates `hq_` invite token
   - If email provided: sends GitHub org invite via API
   - Copies invite message to clipboard
   - Opens pre-populated email (mailto: link)

### Multi-team

If your HQ has multiple teams (`companies/team-a/team.json`, `companies/team-b/team.json`), the command lists them and lets you choose:

```
Which team?
  [1] Team A (org-a)
  [2] Team B (org-b)
```

---

## team.json

Team metadata file stored at `companies/{slug}/team.json`.

```json
{
  "team_id": "uuid-v4",
  "team_name": "Indigo",
  "team_slug": "indigo",
  "org_login": "indigoai-us",
  "org_id": 12345678,
  "created_by": "admin-username",
  "created_at": "2026-04-11T00:00:00.000Z",
  "hq_version": "10.7.1"
}
```

| Field | Description |
|-------|-------------|
| `team_id` | Unique identifier (UUID v4) |
| `team_name` | Human-readable team name |
| `team_slug` | URL-safe slug, used for directory name |
| `org_login` | GitHub organization login |
| `org_id` | GitHub organization numeric ID |
| `created_by` | GitHub login of the admin who created the team |
| `created_at` | ISO 8601 timestamp |
| `hq_version` | Version of create-hq used to create the team |

---

## Credentials

Stored at `~/.hq/credentials.json` (mode 0600, not committed to git).

```json
{
  "access_token": "ghu_...",
  "login": "username",
  "id": 12345,
  "name": "Display Name",
  "email": "user@example.com",
  "issued_at": "2026-04-11T00:00:00.000Z"
}
```

Automatically created during GitHub device flow authentication. Reused on subsequent CLI operations. Cleared and recreated if the token is expired.
