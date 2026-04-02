---
id: verify-vercel-project-exists
title: Verify Vercel project exists before domain operations
scope: global
trigger: before adding domains or deploying to Vercel
enforcement: soft
created: 2026-04-01
---

## Rule

Before running `vercel domains add` or assuming a Vercel project is live, verify it actually exists on the team with `vercel project ls --scope {team}`. The deploy registry `live: false` may mean the project was never created on Vercel — not just that it's paused. If the project doesn't exist, run `vercel link --yes` + `vercel --prod` first.

## Rationale

The {company}-invest-site was listed in the deploy registry with a project_id but had never been created on Vercel. Running `vercel domains add` on a nonexistent project would fail silently or create orphan domain assignments. Always confirm the project exists before DNS/domain operations.
