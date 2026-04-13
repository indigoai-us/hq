---
id: hq-vercel-env-pull-environment
title: Specify --environment production when pulling prod-only Vercel env vars
scope: global
trigger: pulling env vars from Vercel with vercel env pull
enforcement: soft
version: 1
created: 2026-03-23
updated: 2026-03-23
source: success-pattern
---

## Rule

ALWAYS check `vercel env ls` to see which environment vars are scoped to before pulling. `vercel env pull` defaults to "development" — production-only vars (like SUPABASE_SERVICE_ROLE_KEY) won't appear. Use `vercel env pull --environment production` to get prod-scoped vars.
