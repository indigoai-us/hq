---
description: List incoming and outgoing peer shares — see what teammates have shared with you and what you've shared with others
allowed-tools: Bash, Read
argument-hint: [--team <slug>] [--incoming | --outgoing]
visibility: public
---

# /list-shared - List Peer Shares

Show all incoming shares (files teammates have shared with you) and outgoing shares (files you've shared with others). Incoming shares can be installed as alternates via `/team-sync`.

**Arguments:** $ARGUMENTS

## Step 1: Parse Arguments

Extract from `$ARGUMENTS`:
- `--team <slug>` — team slug (required if you belong to multiple teams)
- `--incoming` — show only incoming shares
- `--outgoing` — show only outgoing shares
- No filter: show both

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

## Step 4: Fetch Shares from API

```bash
TEAM_ID=$(cat ~/hq/companies/{slug}/team.json | python3 -c "import sys,json; print(json.load(sys.stdin)['team_id'])")

# Set direction query param based on flags
DIRECTION_PARAM=""
if [ flag == "--incoming" ]; then
  DIRECTION_PARAM="?direction=incoming"
elif [ flag == "--outgoing" ]; then
  DIRECTION_PARAM="?direction=outgoing"
fi

RESPONSE=$(curl -s \
  -H "Authorization: Bearer ${TOKEN}" \
  "https://hq.{company}ai.com/api/teams/${TEAM_ID}/shares${DIRECTION_PARAM}")
```

If the request fails or returns non-2xx: print the error and stop.

Parse the JSON response which contains `incoming`, `outgoing`, and `total` arrays.

## Step 5: Display Results

### No shares

If both incoming and outgoing are empty:
```
No shares found for {team_name}.

Share a file: /share <path> --with <email>
```

### Incoming shares (files shared with you)

```
Incoming shares — {N} file(s) shared with you
──────────────────────────────────────────────
```

For each incoming share, show:
```
  {status-icon}  {path}
     From:    {senderEmail}
     Branch:  {branchName}
     Installs as: {path}.alt.{author}
     Shared:  {relative-time} ({createdAt date})
     Status:  {status}
     ID:      {id}
```

Status icons:
- `[new]` — status is `active` (not yet installed)
- `[✓]` — status is `installed`
- `[–]` — status is `declined`

### Outgoing shares (files you've shared)

```
Outgoing shares — {N} file(s) you've shared
─────────────────────────────────────────────
```

For each outgoing share, show:
```
  {status-icon}  {path}
     To:      {recipient}
     Branch:  {branchName}
     Shared:  {relative-time} ({createdAt date})
     Status:  {status}
     ID:      {id}
```

Status icons:
- `[pending]` — status is `active` (recipient hasn't acted yet)
- `[installed]` — recipient installed the alternate
- `[declined]` — recipient declined the share

### Summary footer

```
──────────────────────────────────────────────
{incoming-count} incoming  |  {outgoing-count} outgoing

To install a pending share: /team-sync
To share a file: /share <path> --with <email>
```

## Error Handling

| Error | Action |
|-------|--------|
| Not authenticated | Stop — print `hq login` |
| No team found | List teams, ask user |
| API error | Print error detail and stop |

## Notes

- Incoming shares with status `active` will also appear during `/team-sync` as an installation prompt
- Alternates are installed as `{path}.alt.{author}` — they coexist with the team-governed version
- To activate an alternate, reference the `.alt.` file directly in your `CLAUDE.md` or command invocation
- Declined shares are kept in the list for visibility but won't be re-prompted during sync
