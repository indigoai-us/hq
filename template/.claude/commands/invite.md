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

### 5. Check org role

Check if the current user is an org admin:
```bash
curl -s \
  -H "Authorization: token {access_token}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/orgs/{org_login}/memberships/{login}"
```

Parse the response for `"role"`. If `role` is `"admin"`, continue to step 6 (admin flow). Otherwise, go to step 5a (member flow).

If the API call fails entirely (403, network error), assume the user is not an admin and go to step 5a.

### 5a. Non-admin: contact your admin

If the user is not an org admin, they cannot send invitations. Show:

```
Only org admins can invite new members to {team_name}.

Your team admin is @{created_by}.
```

Then look up the admin's public email (best-effort):
```bash
curl -s \
  -H "Authorization: token {access_token}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/users/{created_by}"
```

Extract the `email` field from the response. If null/empty, use `{created_by}@users.noreply.github.com` as fallback.

Prepare a draft message for the user to send:

```
Here's a quick message you can send to @{created_by}:

  To: {admin_email}
  Subject: HQ team invite request — {team_name}

  Hey {created_by},

  Could you invite a new member to our {team_name} HQ team?
  You can run /invite from your HQ to generate an invite code.

  Thanks!
```

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
