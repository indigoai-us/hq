---
description: List team submissions — admins see all, members see their own
allowed-tools: Bash, Read
argument-hint: [--team <slug>] [--status pending|approved|rejected|all] [--mine]
visibility: public
---

# /list-submissions - List Team Submissions

Show submissions for your team. Admins see all submissions; members see only their own. Results are sorted by submission date (newest first).

**Arguments:** $ARGUMENTS

## Step 1: Parse Arguments

Extract from `$ARGUMENTS`:
- `--team <slug>` — team slug (required if multiple teams)
- `--status <value>` — filter by status: `pending`, `approved`, `rejected`, or `all` (default: `pending`)
- `--mine` — force member view even if admin (show only your own submissions)
- `--all` — alias for `--status all`

## Step 2: Resolve Team

```bash
find ~/hq/companies -name "team.json" -maxdepth 2 2>/dev/null
```

- If `--team <slug>` provided: use `~/hq/companies/{slug}/team.json`
- If only one team: use it automatically
- If multiple teams and no flag: list them and ask which

Read `team_id` and `team_name` from `team.json`.

## Step 3: Load Auth Token

```bash
TOKEN=$(cat ~/.hq/auth.json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('clerk_session_token',''))" 2>/dev/null)
```

If empty: `Error: Not authenticated. Run: hq login`

## Step 4: Fetch Submissions

```bash
TEAM_ID=$(cat ~/hq/companies/{slug}/team.json | python3 -c "import sys,json; print(json.load(sys.stdin)['team_id'])")

RESPONSE=$(curl -s -X GET "https://hq.{company}ai.com/api/teams/${TEAM_ID}/submissions" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Accept: application/json")
```

Parse `submissions` array from response. If API fails: print error and stop.

## Step 5: Filter Results

From the submissions array:

1. **Status filter**:
   - `--status pending` (default): keep only `status === "pending"`
   - `--status approved`: keep only `status === "approved"`
   - `--status rejected`: keep only `status === "rejected"`
   - `--status all` or `--all`: keep all statuses

2. **`--mine` flag**: filter further to only submissions where `userId` matches the authenticated user's ID.
   - Read user ID from `~/.hq/auth.json` field `user_id`

3. **Sort**: newest first by `createdAt`

## Step 6: Display Results

### Empty State

```
No {status} submissions for {team_name}.
```

If `--status pending` (default) and no pending: also hint:
```
No pending submissions. Run /list-submissions --all to see all submissions.
```

### Submissions Table

Print a header:

```
Submissions — {team_name}
Status: {filter} | Total: {N}
```

Then a table:

```
ID                        User                  Title                                  Status    Submitted
─────────────────────────────────────────────────────────────────────────────────────────────────────────
sub_1714234567_abc123     alice@co.com          Add marketing skill pack               pending   2026-04-01 14:23
sub_1714159200_def456     bob@co.com            Update run command + worker yaml       approved  2026-03-31 09:11
sub_1714072800_ghi789     carol@co.com          Brand guide knowledge base             rejected  2026-03-30 17:45
```

Column widths:
- ID: 26 chars (truncate with `...` if longer)
- User: 22 chars (truncate)
- Title: 40 chars (truncate with `...`)
- Status: 10 chars (color-coded: pending=yellow, approved=green, rejected=red)
- Submitted: `YYYY-MM-DD HH:MM` (local time)

If the submission has a `rejectionReason`, show it on the next line indented:
```
  └─ Reason: {rejectionReason}
```

### Summary Footer

After the table:

```
─────────────────────────────────────────────────────────────────────────────
{pending_count} pending  ·  {approved_count} approved  ·  {rejected_count} rejected
```

Only show counts that are non-zero.

### Admin Actions Hint (if pending submissions exist)

```
Review:  /review-submission <submission-id>
Approve: /approve-submission <submission-id>
Reject:  /approve-submission <submission-id> --reject "reason"
```

### Member Actions Hint (if own pending submissions exist)

```
Your submission is pending admin review.
To check status, run: /list-submissions --mine
```

## Error Handling

| Error | Action |
|-------|--------|
| Not authenticated | Stop — `hq login` |
| No team found | List available teams |
| API fetch fails | Print error with response details |
| `submissions` missing in response | Print empty state |

## Examples

```
/list-submissions                           # Pending submissions (default)
/list-submissions --all                     # All submissions, all statuses
/list-submissions --status approved         # Only approved
/list-submissions --mine                    # Only your own submissions
/list-submissions --team acme               # Specific team
/list-submissions --team acme --status all  # All submissions for specific team
```

## Notes

- Admins see all team members' submissions; members see only their own (API-enforced)
- Default filter is `pending` — most useful for admins doing their review queue
- Submission IDs are used with `/review-submission` and `/approve-submission`
- The API returns submissions stored in S3 at `teams/{teamId}/submissions/index.json`
