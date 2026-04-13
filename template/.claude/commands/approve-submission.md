---
description: Approve or reject a team submission — merges the branch (approve) or marks rejected with feedback (reject)
allowed-tools: Bash, Read
argument-hint: <submission-id> [--team <slug>] [--reject "reason"]
visibility: public
---

# /approve-submission - Approve or Reject a Team Submission

Admin command. Approves a submission (merges branch to main via GitHub API) or rejects it with optional feedback. The submission must be in `pending` status.

**Arguments:** $ARGUMENTS

## Step 1: Parse Arguments

Extract from `$ARGUMENTS`:
- First positional arg — submission ID (required, format: `sub_...`)
- `--team <slug>` — team slug (required if multiple teams)
- `--reject "reason"` — if present, reject instead of approve; `reason` is optional feedback for the submitter

If no submission ID provided: stop and print usage.

## Step 2: Resolve Team

```bash
find ~/hq/companies -name "team.json" -maxdepth 2 2>/dev/null
```

- If `--team <slug>` provided: use `~/hq/companies/{slug}/team.json`
- If only one team: use it
- If multiple teams and no flag: list them and stop

Read `team_id` and `team_name` from `team.json`.

## Step 3: Load Auth Token

```bash
TOKEN=$(cat ~/.hq/auth.json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('clerk_session_token',''))" 2>/dev/null)
```

If empty: `Error: Not authenticated. Run: hq login`

## Step 4: Confirm Action

Fetch the submission details to show before acting:

```bash
TEAM_ID=$(cat ~/hq/companies/{slug}/team.json | python3 -c "import sys,json; print(json.load(sys.stdin)['team_id'])")

SUBMISSIONS=$(curl -s -X GET "https://hq.indigoai.com/api/teams/${TEAM_ID}/submissions" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Accept: application/json")
```

Find the submission with the given ID in the response. If not found: `Error: Submission {id} not found.`

If submission status is not `pending`:
```
Error: Submission is already {status}.
Only pending submissions can be approved or rejected.
```

Print confirmation prompt:

**Approve flow:**
```
Approve submission?
─────────────────────────────────────
Submission: {submission.title}
ID:         {submission.id}
User:       {submission.userId}
Branch:     {submission.branchName}

This will merge branch {branchName} into main on the team repo.
Confirm? [y/N]
```

**Reject flow** (`--reject` present):
```
Reject submission?
─────────────────────────────────────
Submission: {submission.title}
ID:         {submission.id}
User:       {submission.userId}
Branch:     {submission.branchName}
Reason:     {reason or "(no reason provided)"}

The branch will NOT be deleted. The member can revise and resubmit.
Confirm? [y/N]
```

Wait for user confirmation before proceeding.

## Step 5: Call API

### Approve

```bash
RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT \
  "https://hq.indigoai.com/api/teams/${TEAM_ID}/submissions/{submissionId}/approve" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)
```

### Reject

```bash
RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT \
  "https://hq.indigoai.com/api/teams/${TEAM_ID}/submissions/{submissionId}/reject" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"reason\": \"{rejection-reason}\"}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)
```

## Step 6: Handle Response

### Approve — Success (HTTP 200)

Parse `merge.sha` from response body.

```
Submission approved
──────────────────────────────────────────────────
Title:   {submission.title}
Branch:  {submission.branchName} → main
Merge:   {merge.sha}
Status:  approved

The content is now live in the team repo.
```

### Reject — Success (HTTP 200)

```
Submission rejected
──────────────────────────────────────────────────
Title:   {submission.title}
Branch:  {submission.branchName} (not deleted)
Reason:  {rejection-reason or "(none provided)"}
Status:  rejected

The member can revise their content and resubmit.
```

### Error Cases

**HTTP 403 (not an admin):**
```
Error: Only team admins can approve or reject submissions.
```

**HTTP 404 (branch not found on GitHub):**
```
Error: Branch "{branchName}" was not found on the team repo.
The branch may have been deleted or the team repo is not connected.
```

**HTTP 409 (merge conflict):**
```
Error: Merge conflict — the branch cannot be automatically merged.
The member needs to rebase their branch against main and resubmit.
Branch: {branchName}
```

**HTTP 409 (already processed):**
```
Error: Submission is already {status}.
```

**HTTP 500 / 502 (GitHub App not configured):**
```
Error: {error message from API}
The team's GitHub App may not be configured. Contact your HQ admin.
```

**Other errors:**
```
Error: {HTTP_CODE} — {error message from response body}
```

## Error Handling Summary

| Error | Action |
|-------|--------|
| Not authenticated | Stop — `hq login` |
| Submission not found | Clear error |
| Not pending | Clear error with current status |
| Not an admin | Clear 403 error |
| Branch not on GitHub | Error with remediation |
| Merge conflict | Error with rebase instructions |
| GitHub App not configured | Error escalate to HQ admin |

## Examples

```
/approve-submission sub_1714234567_abc123
/approve-submission sub_1714234567_abc123 --team acme
/approve-submission sub_1714234567_abc123 --reject
/approve-submission sub_1714234567_abc123 --reject "Missing required frontmatter in skill files. Please add description and allowed-tools."
```

## Notes

- Approving calls GitHub's merge API via the team's GitHub App installation — the branch must exist on the remote
- Rejecting is non-destructive: the branch stays on GitHub for the member to revise
- Both operations require admin role on the team (enforced server-side)
- After approval, run `hq team-sync --team {slug}` to pull the newly merged content locally
- To preview before approving, run `/review-submission {submissionId}` first
