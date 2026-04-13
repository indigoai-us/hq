---
title: Overview
description: What HQ Teams is, how it works, and who it's for.
---

## What is HQ Teams?

HQ Teams extends [HQ by Indigo](https://github.com/indigoai-us/hq) with shared workspaces. An admin creates a team backed by a private GitHub repo, invites members, and everyone gets a synchronized copy of team content alongside their personal HQ.

Each member's HQ looks like this:

```
~/hq/                          ← personal HQ (local git repo)
  .claude/commands/            ← personal commands
  .claude/skills/              ← personal skills
  workers/public/              ← personal workers
  companies/
    indigo/                    ← team workspace (embedded git repo)
      team.json                ← team metadata
      knowledge/               ← shared knowledge
      workers/                 ← shared workers
      settings/                ← shared settings
```

The `companies/{slug}/` directory is an independent git repo that points to the team's shared GitHub repo. This is the same embedded-repo pattern HQ uses for knowledge bases.

## Who is it for?

- **Admins** — team leads who create and manage shared workspaces. They control what content is shared and who has access.
- **Members** — team participants who use the shared content and contribute back. Members are Claude Code users who benefit from curated skills, workers, and knowledge.

## Key concepts

### Teams

A team is a GitHub organization + a private repo (`hq-{slug}`). The repo holds shared content — knowledge, workers, settings, and anything else the admin wants to distribute.

### Invites

Admins generate invite tokens that encode the team coordinates (org, repo, slug). The token plus a GitHub org invite is everything a new member needs to join. No server or account system required — GitHub is the identity provider.

### GitHub App

The [hq-team-sync](https://github.com/apps/hq-team-sync) GitHub App powers the integration. It handles:
- **Device flow authentication** — members sign in via browser, CLI polls for token
- **Org membership verification** — proves a member was invited
- **Org invite delivery** — sends GitHub org invites when the admin provides an email
- **Repository access** — the App's installation token enables git clone/push/pull

### Sync

Team content syncs via `git pull` on the `companies/{slug}/` repo. Members pull the latest content; admins push updates. Standard git workflow.

## Current status (v10.7.1)

HQ Teams is in its first release. What's working:

| Feature | Status |
|---------|--------|
| Admin team creation | Shipped |
| Invite token generation | Shipped |
| GitHub org invite (API) | Shipped |
| Member onboarding via `--invite` | Shipped |
| Auto-discovery (find teams without token) | Shipped |
| Multi-team support | Shipped |
| Git-based content sync | Manual (`git pull`) |
| `/invite` command (from Claude) | Planned |
| `/sync` command (from Claude) | Planned |
| Entitlements / content packs | Planned |
| Submission / review workflow | Planned |
| Web dashboard | Planned |
