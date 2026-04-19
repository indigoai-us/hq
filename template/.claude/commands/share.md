---
description: Share a skill, worker, or command directly with a teammate — pushes the file to a shared branch on the team repo and creates a share record so they see it on next /team-sync
allowed-tools: Bash, Read
argument-hint: <path> --with <email> [--team <slug>]
visibility: public
---

# /share - Peer Share via Shared Branch

Share a skill, worker, command, or any HQ file directly with a teammate. No admin approval needed — the file lands in their HQ with an `.alt.{your-name}` suffix so it never shadows team-governed content.

**Arguments:** $ARGUMENTS

## Step 1: Parse Arguments

Extract from `$ARGUMENTS`:
- `--with <email>` — recipient email address (required)
- `--team <slug>` — team slug (required if you belong to multiple teams)
- Remaining arg is the file path to share (one file per invocation)

If `--with` is missing or no file path provided: stop and print usage:
```
Usage: /share <path> --with <email> [--team <slug>]

Examples:
  /share .claude/skills/marketing-brief.md --with alice@example.com
  /share workers/public/copywriter.yaml --with bob@example.com --team acme
```

## Step 2: Resolve Team

Locate team directory:

```bash
find ~/hq/companies -name "team.json" -maxdepth 2 2>/dev/null
```

- If `--team <slug>` was provided: look for `~/hq/companies/{slug}/team.json`
- If not provided and only one team exists: use it
- If multiple teams and no `--team` flag: list them and ask which to use

Read `~/hq/companies/{slug}/team.json` to get `team_id` and `team_name`.

## Step 3: Load Auth Token

```bash
TOKEN=$(cat ~/.hq/auth.json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('clerk_session_token',''))" 2>/dev/null)
```

If token is empty or file missing:
```
Error: Not authenticated. Run: hq login
```

Also extract the sender's email from the auth token (for branch naming):

```bash
SENDER_EMAIL=$(cat ~/.hq/auth.json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('email',''))" 2>/dev/null)
```

If email is unavailable, derive a safe sender slug from the system username:
```bash
SENDER_EMAIL=$(whoami)@local
```

## Step 4: Verify File Exists

```bash
ls ~/hq/{path} 2>/dev/null
```

If the file doesn't exist: stop with an error.

Only one file can be shared per invocation. If multiple paths were given, share only the first and warn about the rest.

## Step 5: Verify Team Repo

Check that the team directory is a git repo:

```bash
git -C ~/hq/companies/{slug} status 2>/dev/null
```

If not a git repo:
```
Error: companies/{slug}/ is not a git repository.
Run: hq team-sync --team {slug}
```

## Step 6: Derive Branch Name and Alternate Suffix

From the sender's email and the file path:

```bash
# Sender slug — email with non-alphanumeric chars replaced
SENDER_SLUG=$(echo "${SENDER_EMAIL}" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9@._-]/-/g')

# Filename from the path
FILENAME=$(basename "{path}")

# Branch name: shared/{sender-email}/{filename}
BRANCH="shared/${SENDER_SLUG}/${FILENAME}"

# Alternate suffix author part — the local-part of the email before @
AUTHOR=$(echo "${SENDER_EMAIL}" | cut -d@ -f1 | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g')
```

The alternate file will be installed as:
- `{original-path}.alt.{author}` in the recipient's HQ

## Step 7: Create the Shared Branch

Ensure the team repo is on its default branch before branching:

```bash
git -C ~/hq/companies/{slug} fetch origin 2>/dev/null || true
git -C ~/hq/companies/{slug} checkout main 2>/dev/null || git -C ~/hq/companies/{slug} checkout master 2>/dev/null
```

Create and switch to the shared branch:

```bash
git -C ~/hq/companies/{slug} checkout -b "${BRANCH}"
```

If the branch already exists, switch to it (the file may have been updated):

```bash
git -C ~/hq/companies/{slug} checkout "${BRANCH}" 2>/dev/null || git -C ~/hq/companies/{slug} checkout -b "${BRANCH}"
```

## Step 8: Copy File to Team Directory

Compute the target path in the team repo:
- Source: `~/hq/{relative-path}` (e.g., `~/hq/.claude/skills/marketing-brief.md`)
- Target: `~/hq/companies/{slug}/{relative-path}` (same relative structure)

```bash
mkdir -p "$(dirname ~/hq/companies/{slug}/{relative-path})"
cp ~/hq/{relative-path} ~/hq/companies/{slug}/{relative-path}
```

## Step 9: Commit and Push the Shared Branch

```bash
git -C ~/hq/companies/{slug} add .
git -C ~/hq/companies/{slug} commit -m "share: {filename} from ${SENDER_EMAIL} to {recipient}

Peer share — alternate version of {path}.
Recipient installs as: {path}.alt.{author}

Shared via /share on {ISO-date}"
```

Push the branch to the team remote:

```bash
git -C ~/hq/companies/{slug} push origin "${BRANCH}"
```

If push fails due to auth: suggest `hq team-sync` to refresh git credentials.

Return to the main branch after pushing:

```bash
git -C ~/hq/companies/{slug} checkout main 2>/dev/null || git -C ~/hq/companies/{slug} checkout master 2>/dev/null
```

## Step 10: Register Share via API

```bash
TEAM_ID=$(cat ~/hq/companies/{slug}/team.json | python3 -c "import sys,json; print(json.load(sys.stdin)['team_id'])")

RESPONSE=$(curl -s -X POST "https://hq.{company}ai.com/api/teams/${TEAM_ID}/shares" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"recipient\": \"{recipient-email}\",
    \"path\": \"{relative-path}\",
    \"branchName\": \"${BRANCH}\"
  }")
```

Parse the response for `id` — this is the share record ID.

If the API call fails (non-2xx or network error):
```
Warning: Branch pushed but share record creation failed.
Error: {error}
The recipient's next /team-sync may not detect this share automatically.
They can still manually fetch the branch: git fetch origin {branch}
```

## Step 11: Confirm

Print success summary:

```
Share created
─────────────────────────────────────
Team:       {team_name} ({slug})
File:       {relative-path}
Recipient:  {recipient-email}
Branch:     {branch}

The recipient will see this on their next /team-sync.
It will be installed as: {path}.alt.{author}

To check delivery: /list-shared
```

## Error Handling

| Error | Action |
|-------|--------|
| Missing `--with` | Stop — print usage |
| Not authenticated | Stop — print `hq login` |
| No team found | List teams, ask user |
| File not found | Stop with error |
| Not a git repo | Stop with setup instructions |
| Push fails (no remote) | Stop — team repo not connected |
| Push fails (auth) | Stop — suggest `hq team-sync` |
| API registration fails | Warn but consider success (branch exists) |

## Notes

- Alternates are installed with `.alt.{author}` suffix — they never shadow team-governed files
- The recipient chooses to install the alternate via `/team-sync` (interactive prompt)
- The recipient can activate an alternate by referencing the `.alt.` file in their `CLAUDE.md` or command invocation
- Sharing is peer-to-peer — no admin approval required
- The team admin can see all share branches via `git branch -r | grep shared/`
