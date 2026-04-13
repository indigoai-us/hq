---
id: hq-vercel-framework-detection
title: Verify Vercel Framework Detection After Project Creation
scope: global
trigger: after creating a new Vercel project
enforcement: hard
version: 2
created: 2026-02-22
updated: 2026-03-15
source: migration
---

## Rule

If Vercel project has `framework: null`, production builds deploy but serve 404 on all routes (even though build succeeds). Two fix methods:

1. **Preferred — `vercel.json` in repo root**: Add `{"framework": "nextjs"}` (or appropriate framework). Committed to repo, survives project recreation, no API calls needed.
2. **Alternative — API patch**: `PATCH /v9/projects/{id}` with `{"framework":"nextjs","installCommand":"pnpm install"}` then redeploy.

Always verify framework is set after project creation. Diagnostic clue: build logs missing "Traced Next.js server files" line despite successful page compilation.

## Rationale

CLI-created projects (`vercel link --project`) don't inherit the framework preset from the dashboard. The build runs correctly (uses local Next.js config), but the routing layer doesn't know how to serve pages — all routes return 404. Discovered during {your-project} migration from Indigo → AMASS Brands team (2026-03-15).
