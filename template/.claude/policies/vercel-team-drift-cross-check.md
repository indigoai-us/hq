---
id: vercel-team-drift-cross-check
title: Cross-check Vercel team between manifest.yaml and prd.json metadata
scope: global
trigger: Any command reads vercelTeam from a PRD or vercel_team from companies/manifest.yaml to target a deploy / open a PR / scope gh or vercel CLI calls
enforcement: hard
version: 1
created: 2026-04-10
updated: 2026-04-10
---

## Rule

`companies/manifest.yaml` field `vercel_team` and `companies/{co}/projects/{project}/prd.json` field `metadata.vercelTeam` must match byte-for-byte. **If they don't, STOP and reconcile before running any Vercel-scoped operation.**

**Cross-check protocol (mandatory when either field is about to be used):**

1. Read both values:
   ```bash
   manifest_team=$(yq '.companies.{co}.vercel_team' companies/manifest.yaml)
   prd_team=$(jq -r '.metadata.vercelTeam' companies/{co}/projects/{project}/prd.json)
   ```
2. If `"$manifest_team" != "$prd_team"`: ABORT and surface both values to the user.
3. Resolve ground truth against Vercel itself:
   ```bash
   cd repos/{pub|priv}/{repo}
   vercel whoami                  # current scope
   vercel teams ls                # all teams the current user can access
   vercel project ls              # projects scoped to the current team
   ```
4. Update the wrong file — prefer the PRD matching the manifest if the manifest reflects deploy reality. Commit the correction with a `fix(manifest)` or `fix(prd)` message naming both files.
5. Only after the two fields agree, proceed with `gh pr create`, `vercel deploy`, `vercel alias`, etc.

**Don't assume either is right.** The PRD is authored by hand and drifts; the manifest can be outdated from a team rename (e.g. `{company}-brands` renamed to a team ID like `{company}-f0dc7e1b`). Both have been wrong in real incidents.

## Rationale

Observed 2026-04-10 while planning the `{company}-{your-project}-land` landing PRD: `companies/manifest.yaml` declared `vercel_team: {company}-f0dc7e1b` for {company} (an Indigo-shaped team ID), while `companies/{company}/projects/{company}-{your-project}/prd.json` declared `vercelTeam: {company}-brands`. One is wrong. Landing a sprint under the wrong `--scope` would have:
- opened the PR Vercel bot against the wrong team and broken the preview URL comment,
- or deployed to the wrong project altogether on prod merge,
- or silently rejected the `vercel deploy` with a team-mismatch error late in the pipeline.

The landing PRD made this cross-check the first acceptance criterion of US-L01 (clean working tree + reconcile metadata) so it's resolved before any push happens. That pattern should apply to every landing/deploy PRD going forward.

## Related

- `.claude/CLAUDE.md` — "Vercel Deployments" section (verify team before deploy)
- `companies/manifest.yaml` — canonical infrastructure routing
- `companies/{company}/projects/{company}-{your-project}-land/prd.json` — landing PRD that first codified this check
