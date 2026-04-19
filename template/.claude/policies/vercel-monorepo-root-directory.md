---
id: vercel-monorepo-root-directory
title: Configure Vercel rootDirectory via API for subdirectory apps
scope: global
trigger: before deploying a Next.js app in a repo subdirectory to Vercel
enforcement: hard
version: 1
created: 2026-03-29
updated: 2026-03-29
source: success-pattern
---

## Rule

When a Next.js app lives in a subdirectory (e.g. `site/`), `vercel deploy --yes` from the repo root creates a NEW project that fails to detect the framework (builds in <1s, serves static files instead of Next.js).

ALWAYS set rootDirectory via the Vercel REST API before the first successful deploy:

```
PATCH /v9/projects/{projectId}?teamId={teamId}
{"rootDirectory":"site","framework":"nextjs","installCommand":"pnpm install","buildCommand":"pnpm build"}
```

After creating the correct project, ALWAYS disconnect old/duplicate projects from the same GitHub repo via `DELETE /v9/projects/{oldProjectId}/link` to prevent duplicate builds on push.

The Vercel CLI has no `vercel project settings` subcommand — the REST API is the only way to set rootDirectory programmatically.

