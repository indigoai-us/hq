---
id: hq-vercel-domain-team-move
title: Vercel Domain Team Transfer Procedure
scope: global
trigger: when a Vercel-purchased domain is in the wrong team
enforcement: soft
version: 1
created: 2026-02-22
updated: 2026-02-22
source: migration
---

## Rule

When purchasing a domain via Vercel/Name.com, it can land in the wrong team/org. Check ownership with `GET /v6/domains/{domain}?teamId={teamId}` across all teams. Move between teams with `PATCH /v6/domains/{domain}?teamId={source}` body `{"op": "move-out", "destination": "{target_team_id}"}`. Cannot delete Vercel-purchased domains — must move them.

