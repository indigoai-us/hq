---
title: Admin Setup
description: Create a team, configure the GitHub App, and invite your first member.
---

## Prerequisites

Before creating a team, you need:

1. **A GitHub account** with admin access to an organization (or create a new org — it's free)
2. **Node.js 18+** installed
3. **The hq-team-sync GitHub App** installed on your org

## Step 1: Run the installer

```bash
npx create-hq
```

When prompted:

1. **"Do you have an HQ Teams account?"** → No
2. **"Would you like to create an HQ Teams account?"** → Yes

This triggers the admin onboarding flow.

## Step 2: Authenticate with GitHub

The installer uses GitHub's device flow:

1. A verification URL opens in your browser
2. Enter the code shown in the terminal
3. Authorize the **hq-team-sync** app

Your credentials are stored locally at `~/.hq/credentials.json` (mode 0600) and reused on future runs.

## Step 3: Choose your organization

The installer lists GitHub organizations where you're an admin:

```
Choose an organization:
  [1] your-org
  [2] Create a new GitHub organization
```

Select an existing org or create a new one. The org needs the **hq-team-sync** GitHub App installed.

### Installing the GitHub App

If the app isn't installed on your org, the installer will prompt you:

```
The HQ GitHub App isn't installed on your-org yet.
Open the install page in your browser? (Y/n)
```

On the GitHub App install page:

1. Select **All repositories** (recommended) or choose specific repos
2. Grant the requested permissions:
   - **Repository > Contents: Read & write** — for git clone/push
   - **Organization > Members: Read & write** — for sending org invites
3. Click **Install**

## Step 4: Name your team

```
Team name (your-org):
```

The team name becomes the slug used for the company directory (`companies/{slug}/`) and the GitHub repo name (`hq-{slug}`).

## Step 5: Invite members

After team creation, the installer offers to generate invites:

```
Invite a team member now? (Y/n)
```

For each member:

1. Enter their email address
2. The installer:
   - Generates an invite token (`hq_...`)
   - Sends a GitHub org invite to that email via API
   - Copies the full invite message to your clipboard
   - Opens a pre-populated email in your default mail client

The invite message contains everything the member needs:
- Link to accept the GitHub org invite
- Node.js install instructions (cross-platform)
- The `npx create-hq --invite hq_<token>` command

### Generating invites later

From your HQ directory:

```bash
npx create-hq invite
```

This finds your `team.json`, authenticates, and runs the invite loop. If you have multiple teams, it lets you choose which one.

## What gets created

After the admin flow completes:

| Location | What |
|----------|------|
| `~/.hq/credentials.json` | Your GitHub auth token (local, not committed) |
| `~/hq-admin/` (or your chosen dir) | Your personal HQ installation |
| `~/hq-admin/companies/{slug}/` | Cloned team repo (embedded git) |
| `~/hq-admin/companies/{slug}/team.json` | Team metadata (IDs, org, slug, creator) |
| GitHub: `{org}/hq-{slug}` | Private repo with team workspace template |

## Next steps

- **Invite members** — generate tokens with `npx create-hq invite`
- **Add content** — push skills, workers, knowledge to the team repo
- **Start Claude** — `cd ~/hq-admin && claude`
