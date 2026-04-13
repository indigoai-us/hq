---
id: clerk-vercel-edge-removal
title: Clerk on Vercel persists at edge level — may need new project
scope: global
trigger: Clerk removal, Vercel deployment protection, x-clerk-auth headers
enforcement: soft
version: 1
created: 2026-03-18
---

## Rule

Removing `@clerk/nextjs` from code + env vars is NOT enough to remove Clerk auth from a Vercel project. Clerk injects middleware at the Vercel edge infrastructure level (visible via `x-clerk-auth-status` and `x-clerk-auth-reason` response headers). Even disabling `ssoProtection`, `vercelAuthentication`, and `passwordProtection` via the Vercel API may not remove it.

**Fastest fix:** Create a new Vercel project without the Clerk integration, copy env vars via the Vercel API, and deploy there.

## Rationale

Spent significant time trying to remove Clerk from `{your-project}` Vercel project. Uninstalled npm packages, removed env vars, disabled all protection settings — Clerk headers persisted. Solution was creating `{company}-gtm-api` as a clean project.

## How to apply

When migrating away from Clerk on Vercel, budget for creating a new Vercel project rather than trying to strip Clerk from the existing one.
