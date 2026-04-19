---
id: hq-vercel-project-id-collision
title: Verify Unique Vercel Project IDs Before Deploying
scope: global
trigger: vercel deploy, vercel link, new project creation
enforcement: hard
version: 1
created: 2026-03-12
updated: 2026-03-12
source: back-pressure-failure
---

## Rule

Before any `vercel deploy` or `vercel link`, check `settings/deploy-registry.yaml` for the target project ID. If two repos share the same `project_id`, deploying either repo silently overwrites the other's production deployment — whoever pushes last wins.

1. ALWAYS verify `.vercel/project.json` has a unique `projectId` before deploying
2. ALWAYS check `deploy-registry.yaml` for `COLLISION` notes on the target project
3. NEVER run `vercel link` and reuse an existing project name without confirming it won't collide
4. After creating a new Vercel project, update `deploy-registry.yaml` with the new project ID immediately

