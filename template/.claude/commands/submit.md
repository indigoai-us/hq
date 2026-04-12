---
description: Submit content to your team — copies files to team directory, creates branch, pushes, and registers submission for admin review
allowed-tools: Bash, Read
argument-hint: <path> [path2 ...] [--team <slug>] [--title "Description"] [--description "Details"]
visibility: public
---

# /submit - Submit Content to Team

Contribute content to your team HQ. Copies files from your personal HQ to the team's `companies/{slug}/` directory, creates a submission branch, pushes to the team repo, and registers the submission via the HQ Cloud API for admin review.

**Arguments:** $ARGUMENTS

## Step 1: Parse Arguments

Extract from `$ARGUMENTS`:
- `--team <slug>` — team slug (required if not inferable from cwd)
- `--title <text>` — human-readable title for the submission (default: derived from file paths)
- `--description <text>` — optional description/note for the reviewer
- Remaining args are file paths or glob patterns (e.g., `.claude/skills/marketing-*`)

If no paths provided after flag parsing: stop and print usage.

## Step 2: Resolve Team

Locate team directory:

```bash
# Find all companies with a team.json (joined teams)
find ~/hq/companies -name "team.json" -maxdepth 2 2>/dev/null
```

- If `--team <slug>` was provided: look for `~/hq/companies/{slug}/team.json`
- If not provided and only one team exists: use it
- If multiple teams and no `--team` flag: list them and ask which to submit to

Read `~/hq/companies/{slug}/team.json` to get `team_id` and `team_name`.

## Step 3: Load Auth Token

```bash
TOKEN=$(cat ~/.hq/auth.json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('clerk_session_token',''))" 2>/dev/null)
```

If token is empty or file missing:
```
Error: Not authenticated. Run: hq login
```

## Step 4: Resolve File Paths

Expand the provided paths/globs from the HQ root (`~/hq`):

```bash
# For each path/glob argument, resolve from ~/hq
cd ~/hq && ls {path_or_glob} 2>/dev/null
```

- Paths are relative to `~/hq` (your personal HQ root)
- Glob patterns expand against `~/hq` (e.g., `.claude/skills/marketing-*` expands there)
- If a path doesn't exist: warn and skip it
- If no valid files found after expansion: stop with error

For each resolved file, compute the **target path** in the team directory:
- Source: `~/hq/{relative-path}` (e.g., `~/hq/.claude/skills/marketing-brief.md`)
- Target: `~/hq/companies/{slug}/{relative-path}` (e.g., `~/hq/companies/{slug}/.claude/skills/marketing-brief.md`)

## Step 5: Verify Team Repo

Check that the team directory is a git repo:

```bash
git -C ~/hq/companies/{slug} status 2>/dev/null
```

If not a git repo or command fails:
```
Error: companies/{slug}/ is not a git repository.
This team directory hasn't been set up for contributions.
Run: hq team-sync --team {slug}
```

## Step 6: Check for Uncommitted Changes

```bash
git -C ~/hq/companies/{slug} status --short
```

If there are uncommitted changes in the team directory, warn:
```
Warning: Team directory has uncommitted local changes. Continuing may mix your submission with existing changes.
Proceed? [y/N]
```

## Step 7: Create Submission Branch

Generate a branch name from the current timestamp and file paths:

```bash
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
SLUG=$(echo "{first-file-basename}" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | cut -c1-30)
BRANCH="submit/${TIMESTAMP}-${SLUG}"
```

Create and switch to the branch in the team repo:

```bash
git -C ~/hq/companies/{slug} checkout -b "${BRANCH}"
```

If branch creation fails (e.g., already exists): append a random suffix and retry.

## Step 8: Copy Files

For each resolved file:

1. Ensure the target directory exists:
   ```bash
   mkdir -p "$(dirname ~/hq/companies/{slug}/{relative-path})"
   ```

2. Copy the file:
   ```bash
   cp ~/hq/{relative-path} ~/hq/companies/{slug}/{relative-path}
   ```

3. Track which files were copied (for the commit message and API call).

If any copy fails: note the error but continue with other files.

## Step 9: Commit the Submission

```bash
git -C ~/hq/companies/{slug} add .
git -C ~/hq/companies/{slug} commit -m "submission: {title}

Files submitted:
{list-of-relative-paths}

Submitted via /submit on {ISO-date}"
```

## Step 10: Push to Remote

```bash
git -C ~/hq/companies/{slug} push origin "${BRANCH}"
```

If push fails:
- Check if `origin` is configured: `git -C ~/hq/companies/{slug} remote -v`
- If no remote: print error explaining the team repo isn't connected
- If auth error: print error and suggest `hq team-sync` to refresh credentials

## Step 11: Register Submission via API

Read team_id from `~/hq/companies/{slug}/team.json`.

Determine title: if `--title` was provided, use it. Otherwise derive from file paths:
- Single file: `"Add {filename}"`
- Multiple files in same directory: `"Add {N} files to {directory}/"`
- Mixed: `"Add {N} files"`

```bash
TEAM_ID=$(cat ~/hq/companies/{slug}/team.json | python3 -c "import sys,json; print(json.load(sys.stdin)['team_id'])")

RESPONSE=$(curl -s -X POST "https://hq.indigoai.com/api/teams/${TEAM_ID}/submissions" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"branchName\": \"${BRANCH}\",
    \"title\": \"{title}\",
    \"description\": \"{description-if-provided}\"
  }")
```

Parse response for `id` field — this is the submission ID.

If API call fails (non-2xx or curl error):
```
Warning: Files pushed to branch {BRANCH} but submission record failed.
Error: {error message}
The admin can still review the branch directly. Contact your team admin.
```

## Step 12: Confirm

Print success summary:

```
Submission created
──────────────────
Team:     {team_name} ({slug})
Title:    {title}
Branch:   {branch}
Files:    {N} file(s)

  {list of relative paths, one per line}

Status:   pending review
ID:       {submission_id}

Your submission is queued for admin review.
The admin will be notified and can run: /review-submission {email-or-member}
```

## Error Handling

| Error | Action |
|-------|--------|
| Not authenticated | Stop — print `hq login` instruction |
| No team found | List available teams, ask user |
| File not found | Warn and skip; continue with other files |
| Not a git repo | Stop with setup instructions |
| Push fails (no remote) | Stop — team repo not connected |
| Push fails (auth) | Stop — suggest `hq team-sync` |
| API registration fails | Warn but consider success (branch exists for manual review) |

## Examples

```
/submit .claude/skills/marketing-brief.md
/submit .claude/skills/marketing-* --team acme --title "Marketing skill pack"
/submit .claude/commands/run.md workers/public/copywriter.yaml --description "Updated run command and new worker"
/submit knowledge/public/brand-guide/ --title "Brand guide knowledge base"
```

## Notes

- Files are copied from your personal HQ (`~/hq/`) to the team directory (`~/hq/companies/{slug}/`)
- The team directory (`companies/{slug}/`) is a separate embedded git repo — submissions go to that repo, not HQ main
- The submission branch is not deleted on approval — the admin's `/approve-submission` merges it via GitHub API
- Run `/list-submissions` to check the status of your submissions
