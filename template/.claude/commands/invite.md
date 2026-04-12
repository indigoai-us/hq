# Invite a Team Member

Generate an invite code for a new team member and optionally send them a GitHub org invitation.

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

1. Read all `companies/*/team.json` files to find available teams
2. If no teams found, tell the user they need to create a team first
3. If multiple teams, present a numbered list and ask which one
4. Read the selected team.json — extract: team_name, team_slug, org_login
5. Get the clone URL: `git -C companies/{slug} remote get-url origin`
6. Ask: "New member's email? (press Enter to skip)"
7. If email provided:
   - Use the GitHub API to send an org invite: `POST /orgs/{org}/invitations` with `{"email": "{email}", "role": "direct_member"}`
   - This requires a GitHub token with org admin access — check `~/.hq/credentials.json`
   - If the API call fails (permissions), tell the admin to invite manually at `https://github.com/orgs/{org}/people`
8. Generate the invite token:
   ```javascript
   const payload = { org, repo: `hq-${slug}`, slug, teamName, cloneUrl, invitedBy };
   const token = "hq_" + Buffer.from(JSON.stringify(payload)).toString("base64url");
   ```
9. Output:
   - The invite code
   - A ready-to-share message block (copy-paste into Slack/email/text)
   - If email was sent, confirmation of the org invite

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
