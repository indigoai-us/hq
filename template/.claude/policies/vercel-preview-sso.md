---
id: hq-vercel-deployment-protection
title: Vercel Deployment Protection Blocks External Requests
scope: global
trigger: when deploying APIs consumed by mobile apps or external clients
enforcement: soft
version: 2
created: 2026-02-22
updated: 2026-03-18
source: back-pressure-failure
learned_from: "{company}-field-app couldn't fetch /api/reps from .vercel.app domain"
---

## Rule

1. `vercel deploy --public` makes source public, NOT bypasses deployment protection (SSO). Vercel preview URLs always require login unless project-level protection is disabled. To test a preview without auth: run prod server locally (`npm run build && npm run start`).

2. Vercel Deployment Protection also blocks ALL external requests (mobile apps, curl, etc.) to `.vercel.app` production domains on team plans. `vercel curl` auto-injects bypass token, but real clients get 307 redirects. For APIs consumed by mobile apps: use a **custom domain** (protection doesn't apply) or **hardcode small, stable datasets** client-side to avoid the fetch entirely.

## Rationale

Prevents wasted time debugging 307 redirects that look like middleware issues but are actually Vercel's team-level deployment protection. Discovered when {company}-field-app's sign-in screen couldn't fetch the rep list from {company}-gtm-hq.vercel.app — multiple middleware rewrites and redeploys failed because the issue was infrastructure, not code.
