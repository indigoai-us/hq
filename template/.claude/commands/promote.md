# Promote a Team Member to Admin

Give a team member org admin privileges so they can invite new members and manage the team.

**Usage:** `/promote` or `/promote @username`

## Steps

### 1. Discover teams

Find all team.json files:
```bash
find companies/*/team.json -maxdepth 0 2>/dev/null
```

If no files found:
```
No teams found. Create a team first:
  npx create-hq
```
Stop here.

### 2. Select team

If multiple teams exist, present a numbered list and ask the user to select one.

If only one team exists, use it automatically.

### 3. Extract team metadata

Read the selected `companies/{slug}/team.json` and extract:
- `team_name` — human-readable team name
- `org_login` — GitHub org login (e.g. `indigoai-us`)

### 4. Load credentials

Read `~/.hq/credentials.json`:
```bash
cat ~/.hq/credentials.json
```

Extract `access_token` and `login`.

**Never display the access_token value in output.**

If credentials.json is missing or invalid:
```
No credentials found. Run `npx create-hq` to authenticate with GitHub.
```
Stop here.

### 5. Verify current user is an admin

```bash
curl -s \
  -H "Authorization: token {access_token}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/orgs/{org_login}/memberships/{login}"
```

If `role` is not `"admin"`:
```
Only org admins can promote members.
Your team admin is @{created_by} — ask them to run /promote.
```
Stop here.

### 6. List org members

Fetch current org members:
```bash
curl -s \
  -H "Authorization: token {access_token}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/orgs/{org_login}/members?role=member&per_page=100"
```

Parse the response — extract `login` for each member. These are the non-admin members who can be promoted.

If no non-admin members found:
```
No members to promote — everyone in {org_login} is already an admin.
```
Stop here.

If the user provided a `@username` argument, look for that username in the list. If found, skip to step 7 with that user. If not found:
```
@{username} is not a member of {org_login}, or is already an admin.
```
Stop here.

If no argument was provided, present a numbered list:
```
Members of {team_name} ({org_login}):

  1. @alice
  2. @bob
  3. @charlie

Which member should become an admin?
```

### 7. Confirm promotion

Show what will happen:
```
Promote @{target_username} to admin of {org_login}?

This will allow them to:
  - Invite new members to the org
  - Manage repository settings
  - Promote other members

Type "yes" to confirm:
```

Wait for explicit "yes" confirmation. Any other response cancels.

### 8. Send promotion API call

```bash
curl -s -X PUT \
  -H "Authorization: token {access_token}" \
  -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json" \
  "https://api.github.com/orgs/{org_login}/memberships/{target_username}" \
  -d '{"role": "admin"}'
```

Check the response:
- If `role` is `"admin"` in response: success
- If 403: insufficient permissions (the hq-team-sync App may not have the required scope)
- If 404: user not found in org

### 9. Report result

**On success:**
```
@{target_username} is now an admin of {org_login}.

They can now:
  - Run /invite to add new team members
  - Run /promote to make other members admin
```

**On failure (403):**
```
Could not promote @{target_username} — insufficient permissions.

The hq-team-sync GitHub App may need additional org permissions.
You can promote them manually:
  https://github.com/orgs/{org_login}/people
  Find @{target_username} → Change role → Owner
```

**On failure (404):**
```
@{target_username} is not a member of {org_login}.
Invite them first with /invite, then promote after they join.
```
