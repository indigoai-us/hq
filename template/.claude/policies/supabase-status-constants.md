---
id: supabase-status-constants
title: Use status constants in Supabase queries, never hardcoded strings
scope: repo
trigger: editing Supabase .eq() queries with status filters
enforcement: soft
created: 2026-04-03
---

## Rule

When filtering by subscription status (or any enum-like status field) in Supabase/PostgREST queries, always use the canonical constant array (e.g. `ACTIVE_SUB_STATUS`) with `.in()` — never hardcode `.eq('status', 'active')`. The `ACTIVE_SUB_STATUS` constant exists at `libs/core/billing/src/constant/index.ts` and includes `in_trial`, `past_due`, `paused`, `unpaid`, `incomplete`.

## Rationale

A hardcoded `.eq('subscriptions.status', 'active')` in `BrandData.listActive()` silently excluded all `in_trial` brands from ETL processing, preventing historical outreach from firing. The constant was already imported in the same file and used correctly in a different method — the divergence was invisible until a trial brand reported missing texts. Grep for raw status string literals in Supabase queries to catch similar issues.
