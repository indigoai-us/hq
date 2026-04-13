---
title: Roadmap
description: What's coming next for HQ Teams.
---

## Current: v0 (10.7.1)

The foundation — admin creates teams, invites members, members join and clone.

- Admin team creation via `npx create-hq`
- GitHub App device flow authentication
- Invite token generation + GitHub org invite API
- Member onboarding via `--invite` flag
- Auto-discovery of teams via GitHub App installations
- Multi-team support (multiple `companies/` entries)
- Team orientation UI with boxed layout

## Next: v0.1 — Team Commands

HQ commands that let admins and members manage teams from inside Claude sessions.

- `/invite` — generate and send invites from within Claude
- `/sync` — pull latest team content across all teams
- Team-only command distribution (commands only appear in team HQ installs)

## Planned: v1 — Content Governance

Entitlements and contribution workflows.

- **Content packs** — named groups of file path patterns (e.g., "marketing" = `skills/marketing-*`, `workers/content-team/*`)
- **Pack assignments** — admin assigns packs to members; members get only entitled content via git sparse checkout
- **Submissions** — members submit content changes on branches for admin review
- **Review workflow** — `/submit`, `/review-submission`, `/approve-submission` commands
- **Role-based defaults** — `role:member` gets a default pack set

## Planned: v2 — Web Dashboard

Visual management for admins.

- Team settings and member list
- Pack editor (create, edit, assign packs)
- Submission queue with diff viewer
- Approve/reject with one click
- Member activity feed

## Planned: v3 — Peer Sharing

Direct member-to-member content sharing.

- `/share {path} --with {email}` — push to a shared branch
- Alternates installed with `.alt.{author}` suffix
- Share discovery on sync
