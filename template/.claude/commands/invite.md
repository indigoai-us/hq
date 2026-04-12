# Invite a Team Member

Generate an invite code for a new team member and optionally send them a GitHub org invitation.

**Usage:** `/invite`

## Process

1. Find team metadata from `companies/*/team.json` files in this HQ
2. If multiple teams exist, ask which team to invite to
3. Ask for the new member's email (optional — used to send GitHub org invite)
4. Generate the invite token (self-contained, no server needed)
5. If email provided, send GitHub org invitation via API
6. Output the invite code and a ready-to-share message

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

Get the clone URL:
```bash
git -C companies/{slug} remote get-url origin
```

### 4. Load credentials

Read `~/.hq/credentials.json` to get the admin's auth:
```bash
cat ~/.hq/credentials.json
```

Extract `access_token` (a `ghu_` GitHub App token) and `login` (admin's GitHub username). These tokens are issued by the **hq-team-sync** GitHub App via device flow.

If credentials.json is missing or invalid, tell the user to re-authenticate:
```
No credentials found. Run `npx create-hq` to authenticate with GitHub.
```

### 5. Ask for email

Ask: **"New member's email address? (leave blank to skip GitHub org invite)"**

### 6. Send GitHub org invite (if email provided)

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
  Could not send org invite automatically (insufficient permissions).
  Invite them manually: https://github.com/orgs/{org_login}/people
  ```

**Never display the access_token value in output.**

### 7. Generate invite token

Build the token using python3 (available in all environments):
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

### 8. Output results

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
