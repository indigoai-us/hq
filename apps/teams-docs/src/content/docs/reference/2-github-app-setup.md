---
title: GitHub App Setup
description: How to configure the hq-team-sync GitHub App for your organization.
---

## Overview

The **hq-team-sync** GitHub App is the bridge between HQ Teams and GitHub. It handles authentication, org membership, and repository access — so members never need to manage SSH keys or personal access tokens.

## For admins: Installing the App

The `create-hq` installer prompts you to install the App during team creation. You can also install it manually:

1. Visit [github.com/apps/hq-team-sync](https://github.com/apps/hq-team-sync)
2. Click **Install**
3. Choose your organization
4. Set repository access:
   - **All repositories** (recommended) — new `hq-*` repos are automatically accessible
   - **Only select repositories** — you must manually add new repos after creation
5. Review and accept permissions

## Required permissions

| Scope | Permission | Why |
|-------|-----------|-----|
| Repository > Contents | Read & write | Git clone, push, pull on team repos |
| Organization > Members | Read & write | Send org invites, verify membership |

## Permission updates

When HQ releases features that require new permissions, the App's configuration is updated. GitHub notifies org admins:

1. You'll see a banner on the App's installation page
2. Review the new permissions
3. Click **Accept** to apply

**Important:** Until you accept updated permissions, features that depend on them will fail gracefully (e.g., org invite falls back to manual instructions).

## Repository access

### All repositories (recommended)

When set to "All repositories," any new `hq-*` repo created by the installer is automatically accessible via the App's token. This is the smoothest experience.

### Selected repositories

If your org prefers tighter control:

1. Go to your org's **Settings > Integrations > GitHub Apps**
2. Click **Configure** on hq-team-sync
3. Under "Repository access," add the `hq-{slug}` repo

Without this step, `git push` and `git clone` will fail with "Repository not found."

## Troubleshooting

### "The HQ App doesn't have permission to send org invites"

The App needs **Organization > Members: Read & write**. Check your installation's permissions and accept any pending updates.

### "Repository not found" during git operations

Either:
1. The App installation is set to "Selected repositories" and the team repo isn't included — add it
2. You haven't accepted a permission update — check the App's installation page for pending requests

### Device flow code expired

The authorization code is valid for 15 minutes. If it expires, run the command again for a fresh code.

### Token stopped working

GitHub App user-to-server tokens can expire. Delete `~/.hq/credentials.json` and re-authenticate:

```bash
rm ~/.hq/credentials.json
npx create-hq invite  # triggers fresh device flow
```
