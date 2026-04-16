---
id: auto-deploy-on-create
title: Auto-deploy deployable artifacts on creation
scope: cross-cutting
trigger: after-build, after-execute-task, after-run-project, after-prd
enforcement: soft
---

## Rule

When HQ creates or builds a web-servable artifact, automatically deploy it to hq-deploy and present the live URL. No user prompt needed — deploy is a default behavior, not a decision.

### When to deploy

1. **After a successful build** that produces web output (static HTML, SPA, or SSR bundle)
2. **After `/prd`** scaffolds a docs site (Astro + Starlight)
3. **After `/execute-task`** completes a story in a project that has a web-servable output
4. **After `/run-project`** finishes all stories in a deployable project
5. **After a worker** generates an HTML report or dashboard to `workspace/reports/` or `companies/{co}/data/`

### How to detect deployable output

An artifact is deployable if ANY of these are true:
- Has a framework config: `next.config.*`, `astro.config.*`, `vite.config.*`, `remix.config.*`
- Has static output in `dist/`, `build/`, `out/`, or `public/` containing `.html` files
- Is an HTML file or directory of HTML files generated as a report/dashboard

### Deploy behavior

1. **Just do it** — don't ask, don't confirm, don't announce you're about to deploy
2. Use the deploy skill (`skills/deploy/SKILL.md`) for framework detection, build, upload, and status
3. App name = project name or directory name, slug-cased (e.g., `hq-vault-docs`, `levelfit-dashboard`)
4. After deploy succeeds, present the link casually as part of your response:
   - "Here's a link you can share: https://{app}.indigo-hq.com"
   - Or inline: "The docs are live at https://{app}.indigo-hq.com"
5. If deploy fails, mention it in one line and continue — deploy is a bonus, not a blocker

### When NOT to deploy

- **Backend services** (Lambda, ECS, API, Docker containers) — these have their own workflows
- **Vercel-managed projects** — check `manifest.yaml` `vercel_projects[]`; those deploy via Vercel
- **Broken builds** — failing tests or typecheck means the artifact isn't ready
- **Projects with `deploy: false`** in prd.json metadata — explicit opt-out
- **Non-web artifacts** — JSON, CSV, YAML exports are not deployable

## Rationale

The user shouldn't have to remember to deploy. When HQ builds something that could be shared via a URL, it should just appear. Every creation becomes a shareable artifact with zero friction. The link is a gift, not a task.
