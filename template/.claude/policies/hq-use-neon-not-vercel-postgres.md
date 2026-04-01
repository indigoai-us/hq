---
id: hq-use-neon-not-vercel-postgres
title: Use @neondatabase/serverless instead of @vercel/postgres
scope: global
trigger: adding Postgres to a Vercel project
enforcement: hard
version: 1
created: 2026-03-29
updated: 2026-03-29
source: task-completion
---

## Rule

ALWAYS use `@neondatabase/serverless` instead of `@vercel/postgres` for Vercel-hosted Postgres. `@vercel/postgres` is deprecated — Vercel migrated all Postgres databases to Neon. The Neon SDK uses HTTP-based queries optimized for serverless, auto-reads `POSTGRES_URL`. Create databases via `neonctl` CLI.

## Rationale

Discovered during {company} supporter intake form implementation. Installing `@vercel/postgres` triggers a deprecation warning and points to the Neon transition guide. The Neon SDK is the maintained replacement with identical API patterns.
