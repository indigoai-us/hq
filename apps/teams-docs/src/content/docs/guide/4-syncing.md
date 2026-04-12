---
title: Syncing Team Content
description: Keep your local team workspace up to date with the latest changes.
---

## How sync works

Team content lives in a git repo cloned at `companies/{slug}/` inside your HQ. Syncing is just `git pull` — the same mechanism used for any git repository.

### Pulling latest changes

```bash
cd ~/hq/companies/{slug}
git pull
```

This pulls any new content the admin (or other members) have pushed — updated knowledge, new workers, changed settings.

### What gets synced

Everything in the team repo:

| Content | Path in team repo |
|---------|-------------------|
| Knowledge bases | `knowledge/` |
| Workers | `workers/` |
| Settings | `settings/` |
| Team metadata | `team.json` |
| Policies | `policies/` |
| Data exports | `data/` |

### Multiple teams

If you belong to multiple teams, sync each one:

```bash
cd ~/hq/companies/team-a && git pull
cd ~/hq/companies/team-b && git pull
```

A `/sync` command that handles all teams at once is planned.

## For admins: pushing content

As an admin, you push content to the team repo the same way:

```bash
cd ~/hq/companies/{slug}
git add .
git commit -m "add marketing knowledge base"
git push
```

All members will get the changes on their next pull.

## Conflict handling

If you've made local edits to team files, `git pull` may show merge conflicts. Standard git resolution applies:

1. Git marks conflicted files
2. Edit the files to resolve conflicts
3. `git add` the resolved files
4. `git commit` to complete the merge

To avoid conflicts, treat the team workspace as read-only for members. Make personal modifications in your personal HQ directories instead.

## Authentication

Git operations use the GitHub token from your device flow authentication, stored at `~/.hq/credentials.json`. If your token expires, re-authenticate by running:

```bash
npx create-hq invite  # admin
# or
npx create-hq         # member (triggers device flow)
```
