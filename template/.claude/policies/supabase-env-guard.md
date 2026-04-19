---
id: supabase-env-guard
title: Supabase middleware must guard missing env vars
scope: global
trigger: Scaffolding Next.js + Supabase projects
enforcement: soft
created: 2026-03-03
---

## Rule

When creating `@supabase/ssr` middleware in Next.js projects, always add an early-return guard for missing `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Without this, the dev server crashes on every request when credentials aren't yet configured.

For server/client factory functions (`createClient()`), use placeholder fallbacks (`|| "http://localhost:54321"`) instead of returning `null` — null returns cause cascading TypeScript errors across all consuming server components.

