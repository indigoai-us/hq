# Team Sync

Pull latest team content for all joined teams. Refreshes entitlements, updates sparse checkout, pulls changes, and detects incoming peer shares.

## Usage

Run the HQ CLI team-sync command:

```bash
hq team-sync
```

### Options

- `--team <slug>` — Sync only a specific team by slug
- `--dry-run` — Show what would be synced without making changes

## What it does

1. **Discovers teams** — Finds all `companies/*/team.json` files (created during team setup)
2. **Authenticates** — Loads cached auth token from `~/.hq/auth.json`, refreshes if expired
3. **Refreshes entitlements** — Fetches current entitlements from the HQ Cloud API; if packs were added or revoked, updates the git sparse checkout config accordingly
4. **Pulls changes** — Configures git credentials and pulls latest content from the team repo
5. **Detects incoming shares** — Checks the HQ Cloud API for active peer shares targeting the current user; prompts to install each as a `.alt.{author}` alternate
6. **Reports changes** — Shows new files, removed files (from entitlement changes), installed alternates, and any conflicts

## Shared Branch Detection (Peer Shares)

After pulling team content, `/team-sync` checks for incoming peer shares via the API:

```bash
TEAM_ID=$(cat ~/hq/companies/{slug}/team.json | python3 -c "import sys,json; print(json.load(sys.stdin)['team_id'])")

SHARES=$(curl -s \
  -H "Authorization: Bearer ${TOKEN}" \
  "https://hq.indigoai.com/api/teams/${TEAM_ID}/shares?direction=incoming")
```

For each share with `status: "active"`:

1. **Prompt the user** (skip in `--dry-run` mode):
   ```
   Incoming share from {senderEmail}:
     File:       {path}
     Branch:     {branchName}
     Installs as: {path}.alt.{author}

   Install this alternate? [y/N/skip-all]
   ```

2. **If user accepts (`y`):**
   - Fetch the shared branch from the remote:
     ```bash
     git -C ~/hq/companies/{slug} fetch origin {branchName}
     ```
   - Extract the file from the branch and install it as an alternate:
     ```bash
     # Derive the .alt. suffix from the sender's email local-part
     AUTHOR=$(echo "{senderEmail}" | cut -d@ -f1 | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g')
     ALT_PATH="${HOME}/hq/{path}.alt.${AUTHOR}"
     git -C ~/hq/companies/{slug} show "origin/{branchName}:{relative-path-in-repo}" > "${ALT_PATH}"
     ```
   - Update the share status to `installed` via the API:
     ```bash
     curl -s -X PUT "https://hq.indigoai.com/api/teams/${TEAM_ID}/shares/{shareId}/status" \
       -H "Authorization: Bearer ${TOKEN}" \
       -H "Content-Type: application/json" \
       -d '{"status": "installed"}'
     ```
   - Print:
     ```
     ✓ Installed: ~/hq/{path}.alt.{author}
     ```

3. **If user declines (`N`):**
   - Update the share status to `declined` via the API (same endpoint, `"status": "declined"`)
   - Print: `Skipped.`

4. **If user chooses `skip-all`:**
   - Do not prompt for remaining shares; leave them as `active` for the next sync

### Alternate file convention

Alternates coexist with team-governed files:
- Team file: `~/hq/.claude/skills/marketing-brief.md`
- Alternate: `~/hq/.claude/skills/marketing-brief.md.alt.alice`

To use an alternate, reference it directly:
- In `CLAUDE.md`: load `skills/marketing-brief.md.alt.alice` instead of the team version
- In a command invocation: reference the `.alt.` file path explicitly

Alternates never shadow team-governed content — they must be explicitly selected.

## Conflict handling

If you have local edits to team-managed files:
- The sync will warn you about conflicts instead of force-overwriting
- To resolve: stash your changes, sync, then reapply

```bash
cd companies/<team-slug>
git stash
hq team-sync --team <team-slug>
git stash pop
```

## Troubleshooting

- **"Not logged in"** — Run `hq login` first
- **"Session expired"** — Run `hq login` to re-authenticate
- **"No team directories found"** — Join a team with `npx create-hq`
- **"Not a git repository"** — The team directory wasn't set up correctly; re-run team setup
- **Shares not appearing** — Run `/list-shared` to check the API directly
