# Team Sync

Pull latest team content for all joined teams. Refreshes entitlements, updates sparse checkout, and pulls changes.

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
5. **Reports changes** — Shows new files, removed files (from entitlement changes), and any conflicts

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
