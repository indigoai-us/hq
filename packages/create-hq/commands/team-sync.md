# Sync Team Content

Pull latest team content and push local changes for all joined teams. Bidirectional git sync using `gh` CLI for authentication — no manual git operations needed.

**Usage:** `/sync` or `/sync --team <slug>` or `/sync --dry-run`

**Requires:** `gh` CLI authenticated (`gh auth status`)

## Arguments

Parse the user's input for:
- `--team <slug>` — Sync only a specific team by slug (e.g., `--team indigo`)
- `--dry-run` — Show what would be synced without making changes

If no flags, sync all discovered teams.

## Process

1. Discover teams from `companies/*/team.json`
2. Verify `gh` CLI is authenticated
3. For each team: pull remote changes, then push local changes
4. Sync command symlinks
5. Report what was pulled and pushed

## Steps

### 1. Verify gh CLI

Check that `gh` is installed and authenticated:
```bash
gh auth status 2>&1
```

If `gh` is not found:
```
GitHub CLI (gh) is required for team commands.
Install it: https://cli.github.com
```
Stop here.

If not authenticated:
```
GitHub CLI is not authenticated. Run:
  gh auth login
Then try /sync again.
```
Stop here.

Ensure git is configured to use `gh` for HTTPS authentication:
```bash
gh auth setup-git 2>&1
```

### 2. Discover teams

Find all team.json files:
```bash
find companies/*/team.json -maxdepth 0 2>/dev/null
```

If no files found, check for promotable companies (folders without team.json):

```bash
for dir in companies/*/; do
  slug=$(basename "$dir")
  [ "$slug" = "_template" ] && continue
  [[ "$slug" == .* ]] && continue
  [ ! -f "$dir/team.json" ] && echo "$slug"
done
```

If promotable companies exist, offer to promote:
```
No teams synced yet, but you have {N} company folder(s) that could become shared teams:

  [1] {slug_1}  ({summary: e.g. "5 workers, 12 policies"})
  [2] {slug_2}  ({summary})

Would you like to share one as a team repo? (Y/n)
```

If the user says yes, proceed to the **Promote Flow** (section 6 below) for the selected company, then return to step 3 to sync the newly promoted team.

If no promotable companies exist either:
```
No teams found. Join or create a team first:
  npx create-hq
```
Stop here.

If `--team <slug>` was specified, filter to only `companies/{slug}/team.json`. If that file doesn't exist:
```
Team "{slug}" not found. Available teams:
  {list discovered team slugs}
```
Stop here.

### 3. Sync each team

For each team (or the single `--team` target):

#### 3a. Read team metadata

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

#### 3b. Check local status

```bash
git -C companies/{slug} status --short
```

Note which files have local modifications (these will be pushed after pulling).

#### 3c. Pull remote changes (--dry-run: fetch only)

If `--dry-run`:
```bash
git -C companies/{slug} fetch origin 2>&1
git -C companies/{slug} log HEAD..origin/main --oneline 2>/dev/null
```

Show what would be pulled:
```
[dry-run] Would pull from {team_name}:
  {list of incoming commits}
```

If NOT `--dry-run`:
```bash
git -C companies/{slug} pull origin main --ff-only 2>&1
```

Capture the output. If pull succeeds, parse the output for:
- "Already up to date." → nothing to report
- File change summary → report changed files

If `--ff-only` fails (diverged history):
```bash
git -C companies/{slug} pull origin main --no-rebase 2>&1
```

If the merge pull succeeds (auto-merged), continue to step 3d.

If the merge pull fails with conflicts, enter the **conflict resolution flow**:

##### Conflict Detection

List the conflicting files:
```bash
git -C companies/{slug} diff --name-only --diff-filter=U
```

For each conflicting file, show a plain-language summary:
```
Sync conflict in {team_name} ({slug}):

  {N} file(s) have changes on both your machine and the team repo:

    {filename_1}:
      Your change:  {brief description from local side of conflict}
      Team change:  {brief description from remote side of conflict}

    {filename_2}:
      Your change:  ...
      Team change:  ...
```

To generate descriptions, read each conflicting file and look for `<<<<<<<`, `=======`, `>>>>>>>` markers. Summarize the content between `<<<<<<<` and `=======` as "Your change" and between `=======` and `>>>>>>>` as "Team change". Keep descriptions short and jargon-free.

##### Resolution Options

Ask the user which resolution strategy to use:

```
How would you like to resolve these conflicts?

  1. Keep my local version (discard team changes for conflicting files)
  2. Keep team version (discard my local changes for conflicting files)
  3. Let me resolve manually (I'll edit the files, then re-run /sync)
```

**Option 1 — Keep local:**
For each conflicting file:
```bash
git -C companies/{slug} checkout --ours -- {filename}
git -C companies/{slug} add {filename}
```
Then complete the merge:
```bash
git -C companies/{slug} commit -m "sync: resolved conflicts — kept local versions"
```
Report: `Kept your local version for {N} file(s). Merge complete.`
Continue to step 3d (push).

**Option 2 — Keep remote (team):**
For each conflicting file:
```bash
git -C companies/{slug} checkout --theirs -- {filename}
git -C companies/{slug} add {filename}
```
Then complete the merge:
```bash
git -C companies/{slug} commit -m "sync: resolved conflicts — kept team versions"
```
Report: `Kept team version for {N} file(s). Merge complete.`
Continue to step 3d (push).

**Option 3 — Manual merge:**
```
OK — the conflicting files have been left with merge markers.
Open these files and look for lines like:

  <<<<<<< HEAD
  (your version)
  =======
  (team version)
  >>>>>>>

Edit each file to keep what you want, then delete the marker lines.
When you're done, run /sync again to complete the merge.
```
**Do NOT push for this team.** Skip to the next team. The user will re-run /sync after editing.

##### Never Silently Overwrite

If at any point the merge would silently overwrite local changes (e.g., a force-pull), **do not proceed**. Always show the user what will change and let them choose. The `--no-rebase` flag ensures git does not rewrite local history.

##### Post-Resolution State

After resolving (options 1 or 2), verify the working tree is clean:
```bash
git -C companies/{slug} status --short
```

If clean: report `Conflicts resolved. Ready to push.` and continue.
If still dirty: report remaining issues and skip push for this team.

#### 3d. Push local changes (--dry-run: show status only)

If there are local changes to push (from step 3b):

If `--dry-run`:
```bash
git -C companies/{slug} diff --stat HEAD 2>/dev/null
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

#### 3d-pre. Pre-push secrets scan

Before pushing, scan the changes for accidental secrets or PII. Compare what will be pushed against the remote:

```bash
git -C companies/{slug} diff origin/main..HEAD -- . ':!team.json' 2>/dev/null
```

Scan the diff output for these patterns:

| Pattern | Description |
|---------|-------------|
| `(?i)(api[_-]?key\|api[_-]?secret)\s*[:=]\s*\S+` | API keys |
| `(?i)(password\|passwd\|pwd)\s*[:=]\s*\S+` | Passwords |
| `(?i)(secret\|token)\s*[:=]\s*['"]?[A-Za-z0-9+/=_-]{20,}` | Tokens/secrets |
| `-----BEGIN (RSA\|DSA\|EC\|OPENSSH) PRIVATE KEY-----` | Private keys |
| `(?i)(aws_access_key_id\|aws_secret_access_key)\s*=\s*\S+` | AWS credentials |
| `ghp_[A-Za-z0-9]{36}\|gho_[A-Za-z0-9]{36}\|ghu_[A-Za-z0-9]{36}` | GitHub tokens |
| `sk-[A-Za-z0-9]{20,}` | OpenAI/Stripe-style keys |
| `^\+.*\.env` | .env file additions |

Run the scan:
```bash
git -C companies/{slug} diff origin/main..HEAD -- . ':!team.json' 2>/dev/null | grep -nE '(api[_-]?key|api[_-]?secret|password|passwd|pwd|secret|token)\s*[:=]|-----BEGIN .* PRIVATE KEY-----|aws_(access_key_id|secret_access_key)\s*=|ghp_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|ghu_[A-Za-z0-9]{36}|sk-[A-Za-z0-9]{20,}' || true
```

**If matches found:**

```
Pre-push security scan found potential secrets:

  {filename}:{line}: {matched pattern preview}
  {filename}:{line}: {matched pattern preview}

These look like they might contain sensitive data (API keys, tokens, passwords, or private keys).
Pushing secrets to a shared repo is hard to undo — they persist in git history.

Options:
  1. Remove the sensitive data and re-run /sync
  2. Push anyway (I've verified these are safe to share)
```

If the user chooses option 1: skip the push for this team. The user will edit files and re-run /sync.
If the user chooses option 2: continue to push.

**If no matches found:** Continue to push silently (no output needed).

#### 3d-push. Push to remote

Then push:
```bash
git -C companies/{slug} push origin main 2>&1
```

If push fails because remote has new changes (non-fast-forward):
```
Remote has new changes. Pulling first, then retrying push...
```
Pull again (step 3c flow). If pull triggers conflicts, enter the conflict resolution flow above. After a clean pull, retry the push once:
```bash
git -C companies/{slug} push origin main 2>&1
```
If the retry also fails, report the error and skip this team:
```
Push failed for {team_name} after retry. Error: {error message}
You can try again later with /sync --team {slug}
```

### 4. Sync command symlinks

After all teams have been synced, manage command symlinks so team-distributed commands are available as slash commands.

#### 4a. Scan for team commands

For each synced team, check if the team directory contains distributed commands:
```bash
ls companies/{slug}/.claude/commands/*.md 2>/dev/null
```

If the directory doesn't exist or has no `.md` files, skip this team for symlink management.

#### 4b. Create symlinks for new commands

For each `.md` file found in `companies/{slug}/.claude/commands/`:

1. Determine the symlink name using the pattern `{slug}--{command}.md` (double-dash separates team slug from command name). For example: `companies/acme/.claude/commands/deploy.md` → `.claude/commands/acme--deploy.md`

2. Check if the symlink target already exists at `.claude/commands/{slug}--{command}.md`:
   - If it's already a symlink pointing to the correct source → skip (already linked)
   - If it exists but is NOT a symlink (a real file or symlink to wrong target) → warn and skip:
     ```
     Skipping {slug}--{command}.md — file already exists (not a team symlink)
     ```
   - If it doesn't exist → create the symlink:
     ```bash
     ln -s "../../companies/{slug}/.claude/commands/{command}.md" ".claude/commands/{slug}--{command}.md"
     ```

3. Track linked commands for the report.

**Note on relative paths:** Symlinks use relative paths (`../../companies/...`) so they work regardless of HQ's absolute location. The path is relative from `.claude/commands/` to `companies/{slug}/.claude/commands/`.

If `--dry-run`:
```
[dry-run] Would link commands for {team_name}:
  {slug}--{command}.md → companies/{slug}/.claude/commands/{command}.md
```
Do not create actual symlinks.

#### 4c. Remove stale symlinks

Scan `.claude/commands/` for symlinks that match the team pattern (`{slug}--*.md`) but whose targets no longer exist (the source command was removed from the team repo):

```bash
for link in .claude/commands/{slug}--*.md; do
  if [ -L "$link" ] && [ ! -e "$link" ]; then
    rm "$link"
    # Track as unlinked for report
  fi
done
```

Also remove symlinks for commands that were removed from the team's `.claude/commands/` directory — compare the set of existing symlinks against the set of current source files:

```bash
# Get current team commands
CURRENT=$(ls companies/{slug}/.claude/commands/*.md 2>/dev/null | xargs -I{} basename {})
# Get current symlinks for this team
LINKED=$(ls -la .claude/commands/{slug}--*.md 2>/dev/null | grep "^l" | awk '{print $NF}' | xargs -I{} basename {})
# Any symlink not matching a current command → remove
```

If `--dry-run`, show what would be removed without removing.

#### 4d. Symlink summary (per team)

Collect results for the final report:
- Commands linked (new symlinks created)
- Commands already linked (unchanged)
- Commands unlinked (stale symlinks removed)
- Commands skipped (name collision)

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

### 5b. Offer to promote remaining non-team companies

After syncing existing teams (or if some teams were synced but other companies remain without team.json), check for promotable folders:

```bash
for dir in companies/*/; do
  slug=$(basename "$dir")
  [ "$slug" = "_template" ] && continue
  [[ "$slug" == .* ]] && continue
  [ ! -f "$dir/team.json" ] && echo "$slug"
done
```

If any promotable companies are found AND this is NOT a `--dry-run`:

```
You also have {N} company folder(s) not yet shared as teams:

  {slug_1}, {slug_2}, ...

Want to promote one to a shared team repo? (y/N)
```

Default is No (non-intrusive — the user came to sync, not promote). If yes, proceed to section 6.

If `--dry-run` or no promotable folders, skip this section silently.

## 6. Promote Flow (inline)

When a user opts to promote a company folder (from step 2 or step 5b), run this flow inline. This creates a GitHub team repo from an existing local folder.

### 6a. Select company (if not already selected)

If coming from step 5b with multiple promotable folders, present numbered list:
```
Choose a company to promote:

  [1] {slug_1}
  [2] {slug_2}
```

### 6b. Authenticate

Verify `gh` is authenticated (already done in step 1). Get the authenticated user:
```bash
gh api user --jq '.login' 2>/dev/null
```

### 6c. Select GitHub organization

List orgs the user is admin of:
```bash
gh api user/orgs --jq '.[].login' 2>/dev/null
```

If no orgs found:
```
You need a GitHub organization to host the team repo.
Create one at: https://github.com/organizations/new
Then re-run /sync.
```
Stop the promote flow (sync results still reported normally).

If one org, auto-select. If multiple, present numbered list.

### 6d. Pre-push secrets scan

Before creating the repo, scan the folder for accidental secrets:

```bash
# Scan settings/ directory (highest risk)
grep -rnE '(api[_-]?key|password|secret|token)\s*[:=]\s*\S{10,}|-----BEGIN .* PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9_]{36,}|op://|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{20,}' companies/{slug}/ --include='*.json' --include='*.yaml' --include='*.yml' --include='*.env' --include='*.md' --include='*.ts' --include='*.js' --include='*.sh' 2>/dev/null || true
```

**If matches found:**
```
Pre-push security scan found potential secrets in companies/{slug}/:

  {file}:{line}: {match preview}

These would be pushed to a shared GitHub repo (visible to all org members).

Options:
  1. Remove the sensitive data first (recommended)
  2. Continue anyway (I've verified these are safe to share)
```

If option 1: abort promote flow, report which files to clean.
If option 2: continue.

**If no matches:** continue silently.

### 6e. Create team repo

```bash
gh api orgs/{org}/repos -X POST -f name="hq-{slug}" -f private=true -f description="HQ Teams workspace for {slug}" --jq '.html_url' 2>&1
```

If the repo already exists (422 error), ask to reuse or abort.

### 6f. Initialize and push

```bash
cd companies/{slug}

# Init git if not already
[ -d .git ] || git init -b main

# Check for existing remote
if git remote get-url origin 2>/dev/null; then
  echo "This folder already has a git remote. Aborting to avoid conflict."
  # Stop promote flow
fi

# Configure and push
git remote add origin "https://github.com/{org}/hq-{slug}.git"
git add -A
git commit -m "Initial team content from HQ promote"
git push -u origin main
```

### 6g. Write team.json

Create `companies/{slug}/team.json` with metadata:
```json
{
  "team_id": "{generated UUID}",
  "team_name": "{slug}",
  "team_slug": "{slug}",
  "org_login": "{org}",
  "org_id": {org_id},
  "created_by": "{gh_username}",
  "created_at": "{ISO8601}",
  "hq_version": "promoted",
  "repo_url": "https://github.com/{org}/hq-{slug}",
  "clone_url": "https://github.com/{org}/hq-{slug}.git"
}
```

Generate UUID:
```bash
uuidgen 2>/dev/null || python3 -c "import uuid; print(uuid.uuid4())"
```

Get org_id:
```bash
gh api orgs/{org} --jq '.id'
```

Commit and push team.json:
```bash
git -C companies/{slug} add team.json
git -C companies/{slug} commit -m "chore: add team.json metadata"
git -C companies/{slug} push origin main
```

### 6h. Post-promote wiring

Update `companies/manifest.yaml` to include the team repo reference:
- If company entry exists, add `hq-{slug}` to its `repos` array
- If no entry exists, create a minimal entry with the repo

Run search reindex:
```bash
qmd update 2>/dev/null || true
```

### 6i. Report promote results

```
Promoted companies/{slug}/ → https://github.com/{org}/hq-{slug}

  Files pushed: {N}
  team.json: companies/{slug}/team.json
  Manifest: updated

Next steps:
  /sync — sync this team going forward
  /invite — invite team members
```

After promoting, the newly created team is immediately eligible for normal sync in step 3.

## Security Notes

- Git authentication is handled by `gh auth setup-git`, which configures a credential helper that delegates to `gh`. No tokens are stored on disk or passed via environment variables.
- No askpass scripts, no credential.helper overrides, no GIT_TOKEN env vars.
- `gh` stores credentials in the OS keychain (macOS Keychain, Windows Credential Manager) and handles token refresh transparently.

## Troubleshooting

- **"gh: command not found"** — Install GitHub CLI: https://cli.github.com
- **"not logged into any GitHub hosts"** — Run `gh auth login`
- **"No git remote"** — Team directory wasn't set up correctly; re-join the team
- **"Permission denied" on push** — Your GitHub account may not have write access to this repo
- **Merge conflicts** — See conflict messages; resolve manually or wait for `/sync` conflict resolution
