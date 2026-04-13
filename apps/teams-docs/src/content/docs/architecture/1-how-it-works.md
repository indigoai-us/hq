---
title: How It Works
description: Technical architecture of HQ Teams — GitHub App auth, token flow, and embedded repos.
---

## Design principles

1. **No server required** — HQ Teams runs entirely on GitHub infrastructure. No backend, no database, no account system. GitHub is the identity provider, access control layer, and content host.
2. **Embedded git repos** — team content lives in an independent git repo inside the HQ directory tree, following the same pattern as HQ knowledge bases.
3. **Tokens are self-contained** — invite tokens encode team coordinates (org, repo, slug) as base64url. Security comes from GitHub org membership, not token secrecy.

## Components

```
┌──────────────────────────────────────────────────────┐
│  GitHub                                               │
│  ├── Organization (admin-owned)                       │
│  │   ├── hq-{slug} repo (private)                    │
│  │   └── Member list (org invites)                    │
│  └── hq-team-sync App                                │
│      ├── Device flow auth (ghu_ tokens)               │
│      ├── Org member management                        │
│      └── Repo contents access                         │
├──────────────────────────────────────────────────────┤
│  create-hq CLI                                        │
│  ├── Admin flow (create org repo, seed, invite)       │
│  ├── Member flow (auth, verify access, clone)         │
│  ├── Invite command (generate tokens, send org invite)│
│  └── Auto-discovery (scan App installations)          │
├──────────────────────────────────────────────────────┤
│  Local HQ                                             │
│  ├── ~/hq/.git (personal, local-only)                 │
│  └── ~/hq/companies/{slug}/.git (team remote)         │
└──────────────────────────────────────────────────────┘
```

## Authentication flow

HQ Teams uses GitHub's [device authorization flow](https://docs.github.com/en/apps/creating-github-apps/writing-code-for-a-github-app/building-a-cli-with-a-github-app#about-device-flow) via the **hq-team-sync** GitHub App.

### Sequence

1. CLI sends `POST github.com/login/device/code` with the App's client ID
2. GitHub returns a `device_code`, `user_code`, and `verification_uri`
3. CLI displays the user code and opens the verification URL in the browser
4. User enters the code in the browser and authorizes the App
5. CLI polls `github.com/login/oauth/access_token` at GitHub's specified interval
6. On success: GitHub returns a `ghu_` user-to-server token
7. CLI fetches `/user` to get the user's profile (login, id, name, email)
8. Credentials saved to `~/.hq/credentials.json` (mode 0600)

### Token type

The `ghu_` token is a **GitHub App user-to-server token**. Unlike personal access tokens, its permissions are defined by the App's configuration — not OAuth scopes. The token can:

- Read/write repository contents (for git clone, push, pull)
- Read organization members (for membership verification)
- Write organization members (for sending org invites)

### Token storage

```json
{
  "access_token": "ghu_...",
  "login": "username",
  "id": 12345,
  "name": "Display Name",
  "email": "user@example.com",
  "issued_at": "2026-01-01T00:00:00Z"
}
```

Stored at `~/.hq/credentials.json` with `0600` permissions. Reused on subsequent runs if the token is still valid (checked via `/user` API call).

## Invite token format

Tokens are self-contained — no server lookup needed.

```
hq_ + base64url({ org, repo, slug, teamName, cloneUrl, invitedBy })
```

Example decoded payload:

```json
{
  "org": "indigoai-us",
  "repo": "hq-indigo",
  "slug": "indigo",
  "teamName": "Indigo",
  "cloneUrl": "https://github.com/indigoai-us/hq-indigo.git",
  "invitedBy": "admin-username"
}
```

The token tells the CLI where to find the team repo. Security is enforced by GitHub — the member must be an org member (accepted the org invite) to clone the private repo.

## Git credential handling

The CLI uses `GIT_ASKPASS` to inject the GitHub token into git operations without storing it in remote URLs or command arguments.

```
git -c credential.helper= clone <url>
     ^                     ^
     |                     |
     Disables macOS        Token provided via
     keychain/GCM          GIT_ASKPASS script
```

The `-c credential.helper=` flag is critical on macOS — without it, the system keychain intercepts and provides stale or wrong credentials before `GIT_ASKPASS` runs.

## Team repo structure

The admin flow seeds the team repo with this structure:

```
hq-{slug}/
  team.json          ← team metadata (IDs, org, slug, creator)
  knowledge/         ← shared knowledge bases
  workers/           ← shared workers
  settings/          ← shared settings
  policies/          ← shared policies
  data/              ← shared data exports
  .gitignore
  README.md
```

This maps directly to the HQ `companies/{slug}/` convention. When cloned, it becomes a standard HQ company directory.

## GitHub App: hq-team-sync

**Client ID:** `Iv23liSdkCBQYhrNcRmI` (public — safe to commit)

**Required permissions:**
- Repository > Contents: Read & write
- Organization > Members: Read & write

**Installation scope:** All repositories (recommended) or selected repositories. If using selected repositories, newly created `hq-*` repos must be manually added to the installation.
