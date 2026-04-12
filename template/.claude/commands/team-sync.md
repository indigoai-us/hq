# Sync Team Content

Pull latest team content and push local changes for all joined teams. Bidirectional git sync with credential injection — no manual git operations needed.

**Usage:** `/sync` or `/sync --team <slug>` or `/sync --dry-run`

## Arguments

Parse the user's input for:
- `--team <slug>` — Sync only a specific team by slug (e.g., `--team indigo`)
- `--dry-run` — Show what would be synced without making changes

If no flags, sync all discovered teams.

## Process

1. Discover teams from `companies/*/team.json`
2. Authenticate via cached GitHub App token
3. For each team: pull remote changes, then push local changes
4. Report what was pulled and pushed

## Steps

### 1. Discover teams

Find all team.json files:
```bash
find companies/*/team.json -maxdepth 0 2>/dev/null
```

If no files found:
```
No teams found. Join a team first:
  npx create-hq
```
Stop here.

If `--team <slug>` was specified, filter to only `companies/{slug}/team.json`. If that file doesn't exist:
```
Team "{slug}" not found. Available teams:
  {list discovered team slugs}
```
Stop here.

### 2. Load credentials

Read `~/.hq/credentials.json`:
```bash
cat ~/.hq/credentials.json
```

Extract `access_token` (a `ghu_` GitHub App token) and `login` (GitHub username).

**Never display the access_token value in output.**

If credentials.json is missing or invalid:
```
No credentials found. Run `npx create-hq` to authenticate with GitHub.
```
Stop here.

### 3. Validate token

Check the token is still valid:
```bash
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: token {access_token}" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/user
```

If response is not `200`:
```
GitHub token expired or invalid. Re-authenticate:
  npx create-hq
```
Stop here.

### 4. Sync each team

For each team (or the single `--team` target):

#### 4a. Read team metadata

Read `companies/{slug}/team.json` and extract:
- `team_name` — human-readable name
- `team_slug` — directory slug

Get the remote URL:
```bash
git -C companies/{slug} remote get-url origin
```

If no git remote is configured:
```
Team "{slug}" has no git remote configured. Was it set up correctly?
Try re-joining: npx create-hq
```
Skip this team and continue.

#### 4b. Check local status

```bash
git -C companies/{slug} status --short
```

Note which files have local modifications (these will be pushed after pulling).

#### 4c. Set up credential helper

Create a temporary askpass script for secure token injection:
```bash
ASKPASS_DIR=$(mktemp -d)
ASKPASS_SCRIPT="$ASKPASS_DIR/askpass.sh"
cat > "$ASKPASS_SCRIPT" << 'ASKPASS_EOF'
#!/bin/sh
echo "$GIT_TOKEN"
ASKPASS_EOF
chmod 700 "$ASKPASS_SCRIPT"
```

All subsequent git commands in this section use this environment:
```bash
export GIT_TOKEN="{access_token}"
export GIT_ASKPASS="$ASKPASS_SCRIPT"
export GIT_TERMINAL_PROMPT=0
export GCM_INTERACTIVE=never
```

**Critical:** The `-c credential.helper=` flag MUST be included on every git command. This disables macOS Keychain and other system credential helpers that would otherwise cache or use the wrong token.

#### 4d. Pull remote changes (--dry-run: fetch only)

If `--dry-run`:
```bash
git -c credential.helper= -C companies/{slug} fetch origin 2>&1
git -c credential.helper= -C companies/{slug} log HEAD..origin/main --oneline 2>/dev/null
```

Show what would be pulled:
```
[dry-run] Would pull from {team_name}:
  {list of incoming commits}
```

If NOT `--dry-run`:
```bash
git -c credential.helper= -C companies/{slug} pull origin main --ff-only 2>&1
```

Capture the output. If pull succeeds, parse the output for:
- "Already up to date." → nothing to report
- File change summary → report changed files

If `--ff-only` fails (diverged history):
```bash
git -c credential.helper= -C companies/{slug} pull origin main --no-rebase 2>&1
```

If this also fails due to merge conflicts, report them (US-003 handles resolution). For now:
```
Merge conflict detected in {slug}. Files with conflicts:
  {list conflicting files}

Resolve conflicts manually, then re-run /sync.
```
Skip the push step for this team.

#### 4e. Push local changes (--dry-run: show status only)

If there are local changes to push (from step 4b):

If `--dry-run`:
```bash
git -c credential.helper= -C companies/{slug} diff --stat HEAD 2>/dev/null
```

Show what would be pushed:
```
[dry-run] Would push from {team_name}:
  {list of local changes}
```

If NOT `--dry-run`:

First, stage and commit any uncommitted changes:
```bash
git -C companies/{slug} add -A
git -C companies/{slug} diff --cached --quiet || git -C companies/{slug} commit -m "sync: local changes from $(whoami)"
```

Then push:
```bash
git -c credential.helper= -C companies/{slug} push origin main 2>&1
```

If push fails because remote has new changes (non-fast-forward):
```
Remote has new changes. Pulling first, then retrying push...
```
Pull again (step 4d), then retry push. If it still fails, report the error.

#### 4f. Clean up credentials

```bash
rm -rf "$ASKPASS_DIR"
unset GIT_TOKEN GIT_ASKPASS GIT_TERMINAL_PROMPT GCM_INTERACTIVE
```

### 5. Report results

After syncing all teams, display a summary:

```
Sync complete:

  {team_name} ({slug}):
    Pulled: {N} files changed ({list or "up to date"})
    Pushed: {N} files changed ({list or "nothing to push"})

  {team_name_2} ({slug_2}):
    Pulled: ...
    Pushed: ...
```

If `--dry-run`:
```
Dry run complete — no changes were made.

  {team_name} ({slug}):
    Would pull: {N} incoming commits
    Would push: {N} local changes
```

## Security Notes

- The `access_token` is passed via `GIT_TOKEN` env var → `GIT_ASKPASS` script. It never appears in command arguments, remote URLs, or output.
- `-c credential.helper=` prevents macOS Keychain from caching the team token (which would conflict with personal GitHub credentials).
- The askpass script is created in a temp directory with 700 permissions and deleted after sync.
- Credentials.json is stored with 0600 permissions at `~/.hq/credentials.json`.

## Troubleshooting

- **"No credentials found"** — Run `npx create-hq` to authenticate
- **"Token expired"** — Run `npx create-hq` to re-authenticate
- **"No git remote"** — Team directory wasn't set up correctly; re-join the team
- **"Permission denied" on push** — Your GitHub App token may not have write access to this repo
- **Merge conflicts** — See conflict messages; resolve manually or wait for `/sync` conflict resolution
