---
id: hq-pre-deploy-domain-check
title: Check Domain Ownership Before Vercel Deploys
scope: global
trigger: before any Vercel deploy or domain assignment
enforcement: hard
version: 2
created: 2026-02-22
updated: 2026-03-12
source: goclaw.getindigo.ai overwrite incident
---

## Rule

Before ANY Vercel deploy:

1. **Look up the repo** in `settings/deploy-registry.yaml` — confirm `project_id`, `org_id`, and `domains` match what you're about to deploy
2. **Verify `--scope`** matches the registry's `org_id` for this entry. If no `--scope` flag, verify `.vercel/project.json` in cwd matches registry
3. **If domains[] is non-empty** in the registry entry, `curl -s` the live URL first to confirm what's currently there
4. **NEVER** remove a domain from one Vercel project to assign it to another — add new routes within the existing project instead
5. **NEVER** deploy a repo whose registry entry shows a different `owner` without explicit user confirmation

Protected domains (never reassign): `hq.getindigo.ai`, `goclaw.getindigo.ai`, `getindigo.ai`, `{company}.com`, `hollermgmt.com`, `havenslay.com`, `{your-domain}.com`, `goldenthread.band`, `{company}.com`, `{your-name}.com`, `moonflowapp.com`, `www.{company}.ai`

## Rationale

goclaw.getindigo.ai was overwritten by another team member deploying to the wrong project (2026-03-12). hq.getindigo.ai was nearly replaced in a prior incident. The deploy registry (`settings/deploy-registry.yaml`) is the source of truth for repo → project → domain mapping.
