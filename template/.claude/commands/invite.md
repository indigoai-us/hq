# Invite a Team Member

Send an invite for a new team member. Only org admins can invite — members are guided to contact their admin.

**Usage:** `/invite`

## Process

1. Find team metadata from `companies/*/team.json`
2. If multiple teams, ask which team
3. Check if the current user is an org admin
4. If admin: generate invite token + send GitHub org invite
5. If not admin: show a message to contact the admin with a prepared email

## Invite Token

The token is a self-contained `hq_`-prefixed base64url string encoding:
- org (GitHub org login)
- repo (team repo name, e.g. hq-indigo)
- slug (team slug for companies/{slug}/)
- teamName (human-readable)
- cloneUrl (HTTPS clone URL)
- invitedBy (admin's GitHub login)

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
- `team_slug` — directory slug under `companies/`
- `org_login` — GitHub org login (e.g. `indigoai-us`)
- `created_by` — GitHub username of the team admin/creator

Get the clone URL:
```bash
git -C companies/{slug} remote get-url origin
```

### 4. Load credentials

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

### 5. Validate token + check org role

First, validate the token is still active:
```bash
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: token {access_token}" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/user
```

If the response is **401** (bad credentials / expired token):
```
Your GitHub token has expired. Re-authenticate by running:
  npx create-hq
Then try /invite again.
```
**Stop here.** Do not fall through to the non-admin flow — a 401 means the token is invalid, not that the user lacks permissions.

If the token is valid (200), check the org role:
```bash
curl -s \
  -H "Authorization: token {access_token}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/orgs/{org_login}/memberships/{login}"
```

Parse the response:
- If `role` is `"admin"` → continue to step 6 (admin flow)
- If `role` is `"member"` → go to step 5a (non-admin flow)
- If **403** (not a member of the org) → tell the user they're not a member of `{org_login}` and suggest `npx create-hq` to join
- If **404** or other error → go to step 5a (non-admin flow)

### 5a. Non-admin: contact your admin

If the user is not an org admin, they cannot send invitations.

#### Find the admin's email

Try these sources in order until an email is found:

1. **Git log** — the admin created the team repo, so the first commit has their email:
   ```bash
   git -C companies/{slug} log --format='%ae' --reverse | head -1
   ```

2. **GitHub profile** — check public profile (often null, but worth trying):
   ```bash
   curl -s \
     -H "Authorization: token {access_token}" \
     -H "Accept: application/vnd.github+json" \
     "https://api.github.com/users/{created_by}"
   ```
   Extract the `email` field.

3. **Fallback** — if both return nothing, use `{created_by}@users.noreply.github.com`.

Use the first non-null email found as `{admin_email}`.

#### Show message and copy draft to clipboard

Show:
```
Only org admins can invite new members to {team_name}.

Your team admin is @{created_by} ({admin_email}).
I've prepared an email draft and copied it to your clipboard.
```

Build the email draft:
```
Hey {created_by},

Could you invite a new member to our {team_name} HQ team?
You can run /invite from your HQ to generate an invite code,
or go to https://github.com/orgs/{org_login}/people to add them directly.

Thanks!
```

Copy the draft to the clipboard:
```bash
printf 'Hey {created_by},\n\nCould you invite a new member to our {team_name} HQ team?\nYou can run /invite from your HQ to generate an invite code,\nor go to https://github.com/orgs/{org_login}/people to add them directly.\n\nThanks!' | pbcopy 2>/dev/null || true
```

Then open a pre-populated mailto link (macOS):
```bash
open "mailto:{admin_email}?subject=HQ%20team%20invite%20request%20%E2%80%94%20{team_name}&body=Hey%20{created_by}%2C%0A%0ACould%20you%20invite%20a%20new%20member%20to%20our%20{team_name}%20HQ%20team%3F%0AYou%20can%20run%20%2Finvite%20from%20your%20HQ%20to%20generate%20an%20invite%20code%2C%0Aor%20go%20to%20https%3A%2F%2Fgithub.com%2Forgs%2F{org_login}%2Fpeople%20to%20add%20them%20directly.%0A%0AThanks!" 2>/dev/null || true
```

If `pbcopy` is not available (Linux), try `xclip -selection clipboard` or `xsel --clipboard` instead.

**Stop here** — do not proceed to token generation.

### 6. Ask for email (admin only)

Ask: **"New member's email address? (leave blank to skip GitHub org invite)"**

### 7. Send GitHub org invite (if email provided)

If the user provided an email, send the org invitation:
```bash
curl -s -X POST "https://api.github.com/orgs/{org_login}/invitations" \
  -H "Authorization: token {access_token}" \
  -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json" \
  -d '{"email": "{email}", "role": "direct_member"}'
```

- On success (2xx): note that the invite was sent
- On failure (403/404): fall back to manual instructions:
  ```
  Could not send org invite automatically.
  Invite them manually: https://github.com/orgs/{org_login}/people
  ```

**Never display the access_token value in output.**

### 8. Generate invite token

Build the token using python3:
```bash
python3 -c "
import json, base64
payload = {
    'org': '{org_login}',
    'repo': 'hq-{slug}',
    'slug': '{slug}',
    'teamName': '{team_name}',
    'cloneUrl': '{clone_url}',
    'invitedBy': '{login}'
}
token = 'hq_' + base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip('=')
print(token)
"
```

### 9. Output results

Display the invite code and a ready-to-share message block.

If the GitHub org invite was sent, include a confirmation line.

## Ready-to-Share Message Template

```
You've been invited to join {teamName} on HQ!

Step 1: Accept the GitHub organization invite (check your email from GitHub)
Step 2: Install Node.js if you don't have it: https://nodejs.org
Step 3: Open your terminal and run: npx create-hq
Step 4: When asked "Do you have an HQ Teams account?", choose Yes
Step 5: Paste this invite code when prompted: {token}
Step 6: Follow the remaining prompts to complete setup
```
