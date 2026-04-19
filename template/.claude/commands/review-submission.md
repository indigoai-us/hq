---
description: Review a team member's pending submission — shows git diff of their branch vs main
allowed-tools: Bash, Read
argument-hint: <submission-id> [--team <slug>]
visibility: public
---

# /review-submission - Review a Team Submission

Show the git diff for a pending submission branch so you can evaluate the content before approving or rejecting it. Admin command.

**Arguments:** $ARGUMENTS

## Step 1: Parse Arguments

Extract from `$ARGUMENTS`:
- First positional arg — either a submission ID (`sub_...`) or a member identifier (email or user ID)
- `--team <slug>` — team slug (required if multiple teams)

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

## Step 4: Fetch Submissions

```bash
TEAM_ID=$(cat ~/hq/companies/{slug}/team.json | python3 -c "import sys,json; print(json.load(sys.stdin)['team_id'])")

RESPONSE=$(curl -s -X GET "https://hq.{company}ai.com/api/teams/${TEAM_ID}/submissions" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Accept: application/json")
```

Parse `submissions` array from the response.

If API call fails: print error and stop.

## Step 5: Resolve Target Submission

Based on the argument:

**If arg looks like a submission ID** (`sub_...`):
- Find the submission with that exact `id`
- If not found: `Error: Submission {id} not found`

**If arg looks like an email or user identifier**:
- Filter submissions to those where `userId` matches (exact) or contains the arg as a substring
- If no match: `No pending submissions found for "{arg}"`
- If multiple matches: list all matches (id, title, status, createdAt) and ask which to review

**If no arg**:
- Show all pending submissions in a table (see listing format below)
- Ask which submission ID to review

**Listing format** (when showing all or multiple matches):

```
Pending Submissions — {team_name}
──────────────────────────────────
ID                   User          Title                          Submitted
sub_1234_abc123      user@co.com   Add marketing skill pack       2026-04-01 14:23
sub_5678_def456      dev@co.com    Update run command             2026-04-02 09:11
```

If no pending submissions: `No pending submissions for {team_name}.`

## Step 6: Show Submission Details

Print submission header:

```
Submission: {submission.title}
──────────────────────────────
ID:          {submission.id}
User:        {submission.userId}
Branch:      {submission.branchName}
Status:      {submission.status}
Submitted:   {submission.createdAt}
Description: {submission.description || "(none)"}
```

## Step 7: Show Git Diff

Check if the team directory is a git repo with the branch available:

```bash
# Fetch latest from remote (to get the submission branch)
git -C ~/hq/companies/{slug} fetch origin 2>/dev/null

# Check if branch exists (local or remote)
git -C ~/hq/companies/{slug} branch -a | grep -E "^[[:space:]]*(\*?[[:space:]]*)?({branchName}|origin/{branchName})$"
```

**If branch exists locally or on remote — show diff via local git:**

```bash
# Show diff of the submission branch vs main
git -C ~/hq/companies/{slug} diff origin/main...origin/{branchName} --stat

echo "---"

git -C ~/hq/companies/{slug} diff origin/main...origin/{branchName}
```

Display the stat summary first (files changed, insertions, deletions), then the full diff.

**If branch not found locally** (team dir not a git repo or fetch failed):
```
Note: Local team repo unavailable. Branch diff not shown.
Branch: {branchName}
Contact the member or check GitHub directly.
```

## Step 8: Show Action Options

After displaying the diff, print:

```
──────────────────────────────────────────────────────────
Actions:
  /approve-submission {submission.id} --team {slug}    Merge and approve
  /approve-submission {submission.id} --team {slug} --reject "reason"    Reject with feedback
```

## Error Handling

| Error | Action |
|-------|--------|
| Not authenticated | Stop — `hq login` |
| API fetch fails | Stop with error message |
| Submission not found | Clear error with available IDs |
| Branch not in local repo | Show info, skip diff |
| Not an admin | API returns 403 — print: "Only team admins can view all submissions" |

## Examples

```
/review-submission                                     # Show all pending, pick one
/review-submission sub_1714234567_abc123               # Review by submission ID
/review-submission user@company.com                    # Review by submitter email
/review-submission sub_1714234567_abc123 --team acme   # Explicit team
```

## Notes

- Only team admins see all submissions; members see only their own (API enforced)
- The diff uses `origin/main...origin/{branch}` — shows only commits on the submission branch, not divergence
- To approve or reject after reviewing, use `/approve-submission`
- Run `/list-submissions` to see all submissions with their current status
